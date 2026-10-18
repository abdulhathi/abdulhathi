"""The resource server (the API) checks every access token itself: signature, issuer, audience, type, expiry, scope.

Here it holds the authorization server's public key directly; across a network it would fetch it from a JWKS URL.
It also refuses revoked tokens. In one process it can read the server's list; a separate API would ask the server
(token introspection) or receive a deny list.
"""
from collections.abc import Callable

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse

from authorization_server import AUDIENCE


class BearerError(Exception):
    """Raised by the scope check; turned into a 401 or 403 with a WWW-Authenticate header (RFC 6750)."""

    def __init__(self, status: int, challenge: str, error: str, description: str):
        self.status, self.challenge, self.error, self.description = status, challenge, error, description


async def bearer_error_handler(_request: Request, e: BearerError) -> JSONResponse:
    return JSONResponse({"error": e.error, "error_description": e.description}, status_code=e.status,
                        headers={"WWW-Authenticate": e.challenge})


def resource_server(issuer: str, public_key: RSAPublicKey, now: Callable[[], float], revoked: set[str]):
    """Returns requires(scope): a FastAPI dependency that lets through only a valid token carrying that scope."""

    def verify(token: str) -> dict:
        try:
            decoded = jwt.decode_complete(
                token, public_key, algorithms=["RS256"], audience=AUDIENCE, issuer=issuer,
                # Time is checked below against the injected clock, so the tests can move it.
                options={"require": ["exp", "iat", "sub", "jti"], "verify_exp": False, "verify_iat": False},
            )
        except jwt.InvalidTokenError:
            return {}
        claims = decoded["payload"]
        if decoded["header"].get("typ") != "at+jwt" or claims["exp"] <= now() or claims["jti"] in revoked:
            return {}
        return claims

    def requires(scope: str):
        def check(authorization: str | None = Header(default=None)) -> dict:
            if not authorization or authorization[:7].lower() != "bearer " or not authorization[7:]:
                # No credentials at all: RFC 6750 says answer with the scheme and no error code.
                raise BearerError(401, "Bearer", "unauthorized", "A bearer token is required.")
            claims = verify(authorization[7:])
            if not claims:
                raise BearerError(401, 'Bearer error="invalid_token"', "invalid_token", "The access token is invalid or expired.")
            if scope not in str(claims.get("scope", "")).split():
                raise BearerError(403, f'Bearer error="insufficient_scope", scope="{scope}"', "insufficient_scope",
                                  f"This call needs the {scope} scope.")
            return claims

        return Depends(check)

    return requires
