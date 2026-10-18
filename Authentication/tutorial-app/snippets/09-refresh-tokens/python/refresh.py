"""Refresh tokens: long-lived, opaque and single-use.

Only a SHA-256 hash of each one is stored, so a leaked table holds nothing an attacker can present. Each sign-in starts
a family; every refresh spends the presented token and mints its replacement in the same family.
"""
import hashlib
import secrets
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

DAY = 24 * 60 * 60
REFRESH_TTL = 7 * DAY  # a token unused for 7 days expires: sign in again
FAMILY_TTL = 30 * DAY  # 30 days after sign-in the family ends, however active the user is

Failure = Literal["invalid", "reused", "expired"]


# In production these are two database tables, with an index on the hash.
@dataclass
class TokenRecord:
    family_id: str
    expires_at: float
    used_at: float | None = None


@dataclass
class Family:
    user_id: str
    expires_at: float
    revoked: bool = False


@dataclass(frozen=True)
class Issued:
    token: str
    expires_at: float


@dataclass(frozen=True)
class Rotated:
    user_id: str
    refresh: Issued


def hash_token(token: str) -> str:
    """A fast hash is right here: the token is 256 random bits, so there is nothing to guess (unlike a password)."""
    return hashlib.sha256(token.encode()).hexdigest()


class RefreshStore:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        # FastAPI runs plain `def` endpoints on a thread pool, so two refreshes can run at the same moment.
        self._lock = threading.Lock()
        self.tokens: dict[str, TokenRecord] = {}  # key: the token's SHA-256, never the token
        self.families: dict[str, Family] = {}

    def issue(self, user_id: str) -> Issued:
        """At sign-in: a new family and its first refresh token."""
        with self._lock:
            family_id = str(uuid.uuid4())
            self.families[family_id] = Family(user_id, self._now() + FAMILY_TTL)
            return self._mint(family_id)

    def rotate(self, token: str) -> Rotated | Failure:
        """At /auth/refresh: spend the presented token and return its replacement."""
        # One lock makes check-and-spend atomic, so two parallel requests cannot both succeed. In SQL:
        # UPDATE refresh_tokens SET used_at = now() WHERE hash = %s AND used_at IS NULL
        with self._lock:
            record = self.tokens.get(hash_token(token))
            family = self.families.get(record.family_id) if record else None
            if record is None or family is None or family.revoked:
                return "invalid"
            if record.used_at is not None:
                # This token was already exchanged, so two parties hold copies: the user and, probably, a thief. We
                # cannot tell which one is asking, so end the whole family and make both sign in again (RFC 9700,
                # section 4.14).
                family.revoked = True
                return "reused"
            if self._now() >= record.expires_at:
                return "expired"
            record.used_at = self._now()
            return Rotated(family.user_id, self._mint(record.family_id))

    def revoke(self, token: str) -> None:
        """At /auth/logout: end this sign-in (this family) on this device."""
        with self._lock:
            record = self.tokens.get(hash_token(token))
            if record and (family := self.families.get(record.family_id)):
                family.revoked = True

    def _mint(self, family_id: str) -> Issued:
        family = self.families[family_id]
        token = secrets.token_urlsafe(32)  # 256 random bits
        # Each token lives 7 days, but never past the family's absolute end.
        expires_at = min(self._now() + REFRESH_TTL, family.expires_at)
        self.tokens[hash_token(token)] = TokenRecord(family_id, expires_at)
        return Issued(token, expires_at)
