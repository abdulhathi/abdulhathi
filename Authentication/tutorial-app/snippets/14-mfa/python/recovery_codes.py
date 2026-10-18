"""Ten single-use recovery codes, for the day the phone with the authenticator app is lost.

Each code is 10 characters from a 32-letter alphabet (50 random bits) and is shown to the user once. NIST SP 800-63B
calls them "look-up secrets": below 112 bits, each one is stored salted and hashed with a password hashing scheme, with
its own salt (the salt and the hash are stored for each secret). So every code gets its own random salt and the same
Argon2id settings as passwords, and checking a typed code means hashing it once per unused code, stopping at the
first match.
"""
import hmac
import secrets
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.low_level import Type, hash_secret_raw

COUNT = 10
ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"  # Crockford's base32: no i, l, o or u to misread


@dataclass
class RecoveryCode:
    """One stored entry per code; the code itself is not kept."""

    salt: bytes
    hash: bytes


def new_recovery_codes() -> list[str]:
    """ "7gk2m-x9q4d": the dash is only for reading; it is ignored when the code is typed."""
    codes = []
    for _ in range(COUNT):
        chars = "".join(ALPHABET[b & 31] for b in secrets.token_bytes(10))  # 256 is a multiple of 32: no bias
        codes.append(f"{chars[:5]}-{chars[5:]}")
    return codes


def normalize(code: str) -> str:
    return "".join(code.split()).replace("-", "").lower()


def _hash(code: str, salt: bytes, hasher: PasswordHasher) -> bytes:
    # The same Argon2id settings as the password hasher, with this code's salt.
    return hash_secret_raw(
        normalize(code).encode(), salt, time_cost=hasher.time_cost, memory_cost=hasher.memory_cost,
        parallelism=hasher.parallelism, hash_len=32, type=Type.ID,
    )


def hash_recovery_codes(codes: list[str], hasher: PasswordHasher) -> list[RecoveryCode]:
    stored = []
    for code in codes:
        salt = secrets.token_bytes(16)  # a new salt for every code
        stored.append(RecoveryCode(salt, _hash(code, salt, hasher)))
    return stored


def use_recovery_code(stored: list[RecoveryCode], typed: str, hasher: PasswordHasher) -> bool:
    """True if the typed code is one of the unused ones. That code is removed, so it works once.

    The caller holds the user's lock, so two requests with the same code cannot both succeed.
    """
    for entry in stored:
        if hmac.compare_digest(_hash(typed, entry.salt, hasher), entry.hash):
            stored.remove(entry)
            return True
    return False
