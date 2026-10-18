"""Password hashing with Argon2id, the algorithm OWASP recommends first.

argon2-cffi stores everything needed to verify in one string:
$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
so the cost can rise later and old hashes still verify.
"""
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# OWASP's minimum for Argon2id: 19 MiB of memory, 2 iterations, 1 lane.
HASHER = PasswordHasher(memory_cost=19_456, time_cost=2, parallelism=1)


def hash_password(password: str, hasher: PasswordHasher = HASHER) -> str:
    return hasher.hash(password)  # a fresh random salt every time


def verify_password(password: str, stored: str, hasher: PasswordHasher = HASHER) -> bool:
    try:
        return hasher.verify(stored, password)  # compares in constant time
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(stored: str, hasher: PasswordHasher = HASHER) -> bool:
    """True when the stored hash used weaker settings than today's."""
    try:
        return hasher.check_needs_rehash(stored)
    except InvalidHashError:
        return True


COMMON = {"password1234", "123456789012", "qwertyuiop12", "letmein12345", "iloveyou1234"}


def password_problem(password: str) -> str | None:
    """NIST SP 800-63B style: long enough, not absurdly long, not a known-common password."""
    if len(password) < 12:
        return "Use at least 12 characters."
    if len(password) > 128:
        return "Use at most 128 characters."
    if password.lower() in COMMON:
        return "That password is too common. Choose another."
    return None
