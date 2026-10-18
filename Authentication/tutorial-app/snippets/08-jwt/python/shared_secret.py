"""HS256: one shared secret both signs and verifies.

It suits a single service that issues and checks its own tokens. It does not suit tokens other services verify:
every service holding the secret could also forge tokens.
"""
import secrets
import time

import jwt

from tokens import AUDIENCE, CLOCK_SKEW, ISSUER, LIFETIME


def new_secret() -> bytes:
    """At least 256 random bits (RFC 7518 section 3.2). In production, load it from a secret store."""
    return secrets.token_bytes(32)


def sign_hs256(sub: str, secret: bytes) -> str:
    t = int(time.time())
    claims = {"iss": ISSUER, "sub": sub, "aud": AUDIENCE, "iat": t, "exp": t + LIFETIME}
    return jwt.encode(claims, secret, algorithm="HS256")


def verify_hs256(token: str, secret: bytes) -> dict:
    # PyJWT checks exp only when it is present, so require it.
    return jwt.decode(token, secret, algorithms=["HS256"], issuer=ISSUER, audience=AUDIENCE, leeway=CLOCK_SKEW,
                      options={"require": ["exp", "sub"]})
