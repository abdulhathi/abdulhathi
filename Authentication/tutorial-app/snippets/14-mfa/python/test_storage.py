import base64
import os
import re

import pytest
from argon2 import PasswordHasher
from cryptography.exceptions import InvalidTag

from recovery_codes import hash_recovery_codes, new_recovery_codes, use_recovery_code
from secret_box import SecretBox

FAST = PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)  # cheap for tests; the app uses HASHER
box = SecretBox(os.urandom(32))
secret = os.urandom(20)


def test_a_sealed_secret_opens_with_the_same_key_and_email_and_looks_different_every_time():
    a = box.seal(secret, "ada@example.com")
    b = box.seal(secret, "ada@example.com")
    assert re.fullmatch(r"v1\.[\w-]+", a)
    assert a != b  # a fresh nonce each time
    assert box.open(a, "ada@example.com") == secret


def test_a_changed_byte_another_users_email_or_another_key_fails_to_open():
    sealed = box.seal(secret, "ada@example.com")
    data = sealed[3:]
    raw = bytearray(base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)))
    raw[20] ^= 1
    tampered = "v1." + base64.urlsafe_b64encode(bytes(raw)).decode().rstrip("=")
    with pytest.raises(InvalidTag):
        box.open(tampered, "ada@example.com")
    with pytest.raises(InvalidTag):
        box.open(sealed, "bo@example.com")
    with pytest.raises(InvalidTag):
        SecretBox(os.urandom(32)).open(sealed, "ada@example.com")


def test_ten_recovery_codes_each_stored_only_as_a_hash_with_its_own_salt():
    codes = new_recovery_codes()
    assert len(codes) == len(set(codes)) == 10
    assert all(re.fullmatch(r"[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}", code) for code in codes)
    stored = hash_recovery_codes(codes, FAST)
    assert len(stored) == 10
    assert len({c.salt for c in stored}) == 10, "a different salt for every code"
    assert all(len(c.salt) == 16 for c in stored)  # NIST asks for at least 32 bits
    everything = repr(stored).encode() + b"".join(c.hash for c in stored)
    assert not any(code.replace("-", "").encode() in everything for code in codes), "never store a code as typed"


def test_each_recovery_code_works_once_typed_in_any_case_with_or_without_the_dash():
    codes = new_recovery_codes()
    stored = hash_recovery_codes(codes, FAST)
    assert use_recovery_code(stored, f" {codes[3].upper().replace('-', '')} ", FAST)
    assert not use_recovery_code(stored, codes[3], FAST)
    assert not use_recovery_code(stored, "aaaaa-aaaaa", FAST)
    assert len(stored) == 9
    assert use_recovery_code(stored, codes[9], FAST)  # the others still work
