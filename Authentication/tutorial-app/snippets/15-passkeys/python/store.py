"""What the server keeps: users, their passkeys (public keys only), and the challenges it has handed out.

A real app uses database tables for the first two and Redis or a table with an expiry for the third.
"""
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

Ceremony = Literal["registration", "authentication"]
CHALLENGE_TTL_SECONDS = 5 * 60


@dataclass
class User:
    id: str  # random bytes (base64url), never the email
    username: str


@dataclass
class Credential:
    id: str  # the credential ID, base64url
    user_id: str
    public_key: bytes  # a COSE key; never secret
    counter: int  # the signature counter from the last sign-in
    transports: list[str]  # how the browser reached the authenticator: internal, hybrid, usb, nfc, ble
    device_type: Literal["singleDevice", "multiDevice"]  # device-bound, or synced (backup eligible)
    backed_up: bool


@dataclass
class _Pending:
    ceremony: Ceremony
    user: User | None
    expires_at: float


class Challenges:
    """Challenges are random, stored on the server, short-lived, and single-use."""

    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._pending: dict[str, _Pending] = {}

    def remember(self, challenge: str, ceremony: Ceremony, user: User | None = None) -> None:
        self._pending[challenge] = _Pending(ceremony, user, self._now() + CHALLENGE_TTL_SECONDS)

    def take(self, challenge: str, ceremony: Ceremony) -> _Pending | None:
        """Removes the challenge whatever happens next, so a response can never be verified twice."""
        p = self._pending.pop(challenge, None)
        if p is None or p.ceremony != ceremony or p.expires_at <= self._now():
            return None
        return p


@dataclass
class Store:
    users: dict[str, User] = field(default_factory=dict)  # by id
    credentials: dict[str, Credential] = field(default_factory=dict)  # by credential ID

    def find_user_by_name(self, username: str) -> User | None:
        return next((u for u in self.users.values() if u.username == username), None)
