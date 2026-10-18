"""API keys: random, prefixed, shown once, stored only as a SHA-256 hash, and looked up by their id.

Format: ak_live_<id>_<secret>   id: 12 hex characters (not secret)   secret: 32 random bytes, base64url
"""
import hashlib
import hmac
import re
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass

PREFIX = "ak_live_"
SCOPES = ("reports:read", "keys:manage")
DEFAULT_TTL_DAYS = 90
DAY = 24 * 60 * 60
ROTATION_GRACE = DAY  # after a rotation the old key keeps working for 24 hours
_FORMAT = re.compile(r"ak_live_([0-9a-f]{12})_[A-Za-z0-9_-]{43}")


@dataclass
class ApiKey:
    id: str
    name: str  # what the key is for, such as "nightly-export"
    hash: str  # SHA-256 of the whole key, in hex. Never the key itself.
    scopes: list[str]
    created_at: float
    expires_at: float
    lifetime_days: int  # the lifetime it was issued with; a rotation gives the new key the same
    revoked_at: float | None = None
    last_used_at: float | None = None


def hash_key(key: str) -> str:
    # A fast hash is right here: the key holds 256 random bits, so there is no list of likely keys to try.
    return hashlib.sha256(key.encode()).hexdigest()


class KeyStore:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._keys: dict[str, ApiKey] = {}  # a real app uses a table with id as the primary key

    def issue(self, name: str, scopes: list[str], ttl_days: int = DEFAULT_TTL_DAYS) -> tuple[ApiKey, str]:
        """Makes a new key. The plain key is returned here, once, and never stored."""
        key_id = secrets.token_hex(6)
        while key_id in self._keys:
            key_id = secrets.token_hex(6)
        key = f"{PREFIX}{key_id}_{secrets.token_urlsafe(32)}"  # the secrets module is a CSPRNG
        now = self._now()
        record = ApiKey(key_id, name, hash_key(key), list(scopes), now, now + ttl_days * DAY, ttl_days)
        self._keys[key_id] = record
        return record, key

    def get(self, key_id: str) -> ApiKey | None:
        return self._keys.get(key_id)

    def verify(self, presented: str) -> tuple[ApiKey | None, str | None]:
        """Returns (the key's record, None) for a working key, or (None, why it was refused)."""
        actual = hash_key(presented)
        match = _FORMAT.fullmatch(presented)
        record = self._keys.get(match.group(1)) if match else None
        # Look up by id, then compare the hashes in constant time. An unknown id and a wrong secret get the same answer.
        if record is None or not hmac.compare_digest(actual, record.hash):
            return None, "Invalid API key."
        # Only now that the caller has proved they hold the key do we say why it no longer works.
        if record.revoked_at is not None:
            return None, "This API key has been revoked."
        if self._now() >= record.expires_at:
            return None, "This API key has expired."
        record.last_used_at = self._now()  # shows which keys are unused and safe to delete
        return record, None

    def revoke(self, key_id: str) -> ApiKey | None:
        record = self._keys.get(key_id)
        if record and record.revoked_at is None:
            record.revoked_at = self._now()
        return record

    def rotate(self, old: ApiKey, grace: float = ROTATION_GRACE) -> tuple[ApiKey, str]:
        """A new key with the same name, scopes and lifetime. The old key stays valid for the grace period, then expires."""
        fresh = self.issue(old.name, old.scopes, old.lifetime_days)
        old.expires_at = min(old.expires_at, self._now() + grace)
        return fresh
