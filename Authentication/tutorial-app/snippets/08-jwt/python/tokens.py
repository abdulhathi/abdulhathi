"""Issuing and checking access tokens with PyJWT.

Every check is explicit: the algorithm, the issuer, the audience, the time claims (with a small clock skew) and the
claims that must be present.
"""
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass

import jwt

from keys import ALG, KeyRing

ISSUER = "https://auth.example.com"  # who made the token
AUDIENCE = "https://api.example.com"  # which API it is for
LIFETIME = 10 * 60  # access tokens live 10 minutes
CLOCK_SKEW = 30  # tolerate clocks that are up to 30 seconds apart
REQUIRED = ["iss", "sub", "aud", "exp", "nbf", "iat", "jti"]


@dataclass(frozen=True)
class User:
    id: str
    email: str


def issue_access_token(ring: KeyRing, user: User, now: Callable[[], float] = time.time) -> str:
    t = int(now())  # JWT times are whole seconds since 1970 (NumericDate)
    key = ring.current
    claims = {
        "iss": ISSUER,
        "sub": user.id,  # a stable ID that is never reused, not the email
        "aud": AUDIENCE,
        "email": user.email,  # never put secrets here: anyone can read the payload
        "iat": t,
        "nbf": t,
        "exp": t + LIFETIME,
        "jti": str(uuid.uuid4()),  # a unique ID for this token, for logs and deny-lists
    }
    return jwt.encode(claims, key.private_key, algorithm=ALG, headers={"kid": key.kid})


def verify_access_token(ring: KeyRing, token: str) -> dict:
    """Returns the claims, or raises jwt.InvalidTokenError. PyJWT compares the time claims with the system clock."""
    # Read the header without verifying, only to choose the key. An unknown kid fails; never fall back to "any key".
    key = ring.find(jwt.get_unverified_header(token).get("kid"))
    if key is None:
        raise jwt.InvalidTokenError("Unknown signing key")
    return jwt.decode(
        token,
        key.public_key,
        algorithms=[ALG],  # the allowlist: "none", HS256 and everything else is refused
        issuer=ISSUER,
        audience=AUDIENCE,
        leeway=CLOCK_SKEW,
        options={"require": REQUIRED},
    )
