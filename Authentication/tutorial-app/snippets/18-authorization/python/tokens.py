"""Who is calling? A small HS256 JWT carries the user's id, tenant, roles, department and the token's scopes.

Signing in and issuing real tokens is covered in chapters 04 to 12; here the tests and the server sign them.
"""
import time
from dataclasses import dataclass

import jwt

ISSUER = "auth-lab"
AUDIENCE = "documents-api"
# What the first-party app's tokens may do. A third-party client may get less, such as "documents:read".
FULL_ACCESS = "documents:read documents:write"


@dataclass(frozen=True)
class User:
    id: str
    tenant: str
    roles: tuple[str, ...]
    department: str
    scopes: tuple[str, ...]


def sign_token(key: bytes, claims: dict, scope: str = FULL_ACCESS, exp: int | None = None) -> str:
    """Signs a token for one user. `exp` is in seconds since 1970; the default is one hour from now."""
    now = int(time.time())
    payload = {**claims, "scope": scope, "iss": ISSUER, "aud": AUDIENCE, "iat": now, "exp": exp or now + 3600}
    return jwt.encode(payload, key, algorithm="HS256")


def verify_token(key: bytes, token: str) -> User | None:
    """The user a valid token describes, or None for a missing, forged, expired or malformed token."""
    try:
        # No clock skew is allowed (leeway is 0), and exp is required.
        claims = jwt.decode(token, key, algorithms=["HS256"], issuer=ISSUER, audience=AUDIENCE,
                            options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    sub, tenant, roles, department, scope = (claims.get(k) for k in ("sub", "tenant", "roles", "department", "scope"))
    # Every claim the rules read must be there: a missing tenant must never mean "no tenant, so everything".
    if not all(isinstance(v, str) and v for v in (sub, tenant, department, scope)) or not isinstance(roles, list):
        return None
    return User(id=sub, tenant=tenant, roles=tuple(map(str, roles)), department=department, scopes=tuple(scope.split(" ")))
