"""Password hashing with Argon2id, exactly as in chapter 04 (trimmed to hash and verify)."""
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

HASHER = PasswordHasher(memory_cost=19_456, time_cost=2, parallelism=1)  # OWASP's minimum for Argon2id


def hash_password(password: str, hasher: PasswordHasher = HASHER) -> str:
    return hasher.hash(password)


def verify_password(password: str, stored: str, hasher: PasswordHasher = HASHER) -> bool:
    try:
        return hasher.verify(stored, password)  # compares in constant time
    except (VerificationError, InvalidHashError):
        return False
