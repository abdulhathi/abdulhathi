from argon2 import PasswordHasher

from passwords import HASHER, hash_password, verify_password

# Demo accounts: a person, a CI job whose password has colons, and a name that is not ASCII.
DEMO_USERS = {
    "ada": "correct horse battery",
    "ci-bot": "s3cret:with:colons",
    "zoë": "grüße aus Köln",
}


class UserTable:
    """Username -> password hash (chapter 04), and the check every Basic request runs."""

    def __init__(self, users: dict[str, str] = DEMO_USERS, hasher: PasswordHasher = HASHER) -> None:
        self._hasher = hasher
        self._hashes = {username: hash_password(password, hasher) for username, password in users.items()}
        self._dummy_hash = hash_password("not-a-real-password", hasher)

    def check(self, username: str, password: str) -> bool:
        """True only for a known user with the right password. Unknown users take as long as known ones."""
        stored = self._hashes.get(username)
        ok = verify_password(password, stored or self._dummy_hash, self._hasher)
        return stored is not None and ok
