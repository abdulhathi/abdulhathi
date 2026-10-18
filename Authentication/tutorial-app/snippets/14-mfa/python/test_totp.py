import random
from datetime import UTC, datetime

import pyotp

from totp import base32_decode, base32_encode, hotp, new_totp_secret, otpauth_uri, step_at, totp, verify_totp

# The secret both RFCs use for their test values: the ASCII bytes of "12345678901234567890".
RFC_SECRET = b"12345678901234567890"
NOW = 1_792_238_400.0  # 2026-10-17 12:00 UTC


def code_at(steps: int) -> str:
    return totp(RFC_SECRET, NOW + steps * 30)


def test_hotp_matches_the_rfc_4226_test_values():
    expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    assert [hotp(RFC_SECRET, counter) for counter in range(10)] == expected


def test_totp_matches_the_rfc_6238_test_values_sha1_8_digits():
    vectors = [
        (59, "94287082"), (1111111109, "07081804"), (1111111111, "14050471"),
        (1234567890, "89005924"), (2000000000, "69279037"), (20000000000, "65353130"),
    ]
    for seconds, code in vectors:
        assert totp(RFC_SECRET, seconds, digits=8) == code


def test_base32_matches_the_rfc_4648_test_values_without_padding():
    vectors = [("f", "MY"), ("fo", "MZXQ"), ("foo", "MZXW6"), ("foob", "MZXW6YQ"), ("fooba", "MZXW6YTB"), ("foobar", "MZXW6YTBOI")]
    for text, encoded in vectors:
        assert base32_encode(text.encode()) == encoded
        assert base32_decode(encoded) == text.encode()


def test_the_codes_match_pyotp_for_random_secrets_and_times():
    for _ in range(200):
        secret = new_totp_secret()
        seconds = random.randrange(4_102_444_800)  # any time before 2100
        # A timezone-aware datetime: pyotp turns a plain number into local time, which can be off by an hour.
        library = pyotp.TOTP(base32_encode(secret)).at(datetime.fromtimestamp(seconds, UTC))
        assert totp(secret, seconds) == library


def test_a_code_is_accepted_one_step_early_or_late_but_not_two():
    now = step_at(NOW)
    assert verify_totp(RFC_SECRET, code_at(0), NOW) == now
    assert verify_totp(RFC_SECRET, code_at(-1), NOW) == now - 1
    assert verify_totp(RFC_SECRET, code_at(1), NOW) == now + 1
    assert verify_totp(RFC_SECRET, code_at(-2), NOW) is None
    assert verify_totp(RFC_SECRET, code_at(2), NOW) is None
    assert verify_totp(RFC_SECRET, "abcdef", NOW) is None


def test_a_step_at_or_before_the_last_one_used_is_refused_so_a_code_works_once():
    used = verify_totp(RFC_SECRET, code_at(0), NOW)
    assert verify_totp(RFC_SECRET, code_at(0), NOW, used) is None  # the same code again
    assert verify_totp(RFC_SECRET, code_at(-1), NOW, used) is None  # an older one
    assert verify_totp(RFC_SECRET, code_at(1), NOW, used) == used + 1  # the next one is fine


def test_a_new_secret_is_160_random_bits_and_the_otpauth_uri_carries_it_in_a_form_pyotp_reads():
    secret = new_totp_secret()
    assert len(secret) == 20
    assert secret != new_totp_secret()
    b32 = base32_encode(RFC_SECRET)
    uri = otpauth_uri(b32, "ada@example.com", "Auth Lab")
    assert uri == (
        "otpauth://totp/Auth%20Lab:ada%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        "&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30"
    )
    parsed = pyotp.parse_uri(uri)
    assert (parsed.issuer, parsed.name, parsed.secret, parsed.digest().name, parsed.digits, parsed.interval) == (
        "Auth Lab", "ada@example.com", b32, "sha1", 6, 30,
    )
