"""Access tokens: short-lived JWTs, validated as in chapter 08.

This API issues and checks its own tokens, so HS256 with one random 256-bit secret is enough; switch to chapter 08's
RS256 key ring once other services verify them.
"""
import secrets
import threading
import time
import uuid
from collections.abc import Callable

import jwt

ISSUER = "https://auth.example.com"
AUDIENCE = "https://api.example.com"
ACCESS_TTL = 10 * 60  # 10 minutes: the longest a stolen access token stays useful


def new_secret() -> bytes:
    return secrets.token_bytes(32)


def issue_access_token(secret: bytes, user_id: str, email: str, now: Callable[[], float] = time.time) -> str:
    t = int(now())
    claims = {"iss": ISSUER, "sub": user_id, "aud": AUDIENCE, "email": email,
              "iat": t, "exp": t + ACCESS_TTL, "jti": str(uuid.uuid4())}
    return jwt.encode(claims, secret, algorithm="HS256")


def verify_access_token(secret: bytes, token: str) -> dict:
    """Returns the claims, or raises jwt.InvalidTokenError. PyJWT compares exp and iat with the system clock."""
    return jwt.decode(token, secret, algorithms=["HS256"], issuer=ISSUER, audience=AUDIENCE, leeway=30,
                      options={"require": ["sub", "exp", "iat", "jti"]})


class DenyList:
    """Access tokens that must stop working before they expire, by jti.

    Every request now pays a lookup, which is what JWTs were meant to avoid, so keep the list small: an entry can go as
    soon as its token would have expired anyway. In production, keep it in Redis with a TTL so every server sees it.
    """

    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._lock = threading.Lock()  # sign-outs can run on several threads at once
        self._entries: dict[str, int] = {}  # jti -> exp (seconds)

    def add(self, jti: str, exp: int) -> None:
        with self._lock:
            self._entries[jti] = exp
            self._entries = {k: v for k, v in self._entries.items() if v >= self._now()}

    def __contains__(self, jti: str) -> bool:
        return jti in self._entries
