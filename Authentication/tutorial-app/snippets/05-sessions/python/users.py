from argon2 import PasswordHasher

from passwords import HASHER, hash_password, verify_password

# Two demo accounts so you can try the API. A real app signs users up (chapter 04) and keeps them in a database.
DEMO_USERS = {
    "ada@example.com": "correct horse battery",
    "bo@example.com": "purple monkey dishwasher",
}


class UserTable:
    """Email -> password hash, and the sign-in check from chapter 04."""

    def __init__(self, users: dict[str, str] = DEMO_USERS, hasher: PasswordHasher = HASHER) -> None:
        self._hasher = hasher
        self._hashes = {email: hash_password(password, hasher) for email, password in users.items()}
        self._dummy_hash = hash_password("not-a-real-password", hasher)

    def check(self, email: str, password: str) -> str | None:
        """The normalized email if the password is right, otherwise None. Unknown emails take as long as known ones."""
        key = email.strip().lower()
        stored = self._hashes.get(key)
        ok = verify_password(password, stored or self._dummy_hash, self._hasher)
        return key if stored is not None and ok else None
