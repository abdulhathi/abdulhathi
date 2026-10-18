"""HTTP Basic authentication (RFC 7617): "Authorization: Basic base64(username:password)" on every request."""
from base64 import b64decode
from unicodedata import normalize

from fastapi import Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.security.utils import get_authorization_scheme_param

REALM = "Auth Lab"
REQUIRED = "Authentication required."
INVALID = "Username or password is incorrect."


class Unauthorized(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


class UTF8Basic(HTTPBasic):
    """FastAPI's HTTPBasic, which also declares the scheme in the OpenAPI docs (/docs gets an Authorize button).

    Two changes: the challenge advertises charset="UTF-8", and the header is decoded as UTF-8 (the built-in
    decoder accepts ASCII only, so a password such as "grüße" would be refused). A malformed header counts as wrong
    credentials; no header, or another scheme, returns None so the route can answer with a challenge.
    """

    def make_authenticate_headers(self) -> dict[str, str]:
        return {"WWW-Authenticate": f'Basic realm="{self.realm}", charset="UTF-8"'}

    async def __call__(self, request: Request) -> HTTPBasicCredentials | None:  # type: ignore[override]
        scheme, param = get_authorization_scheme_param(request.headers.get("Authorization"))
        if scheme.lower() != "basic":  # the scheme name is case-insensitive
            return None
        try:
            # validate=True: only standard base64 with its padding; .decode("utf-8") refuses bytes that are not UTF-8
            decoded = b64decode(param, validate=True).decode("utf-8")
        except ValueError:  # not base64 (binascii.Error), or not UTF-8 (UnicodeDecodeError)
            raise Unauthorized(INVALID)
        username, colon, password = decoded.partition(":")  # the first colon: a username cannot contain one
        if not colon:
            raise Unauthorized(INVALID)
        # RFC 7617 asks clients to send Unicode in Normalization Form C; normalizing here too makes both spellings
        # of a letter such as "ë" (one code point, or "e" plus a combining mark) match.
        return HTTPBasicCredentials(username=normalize("NFC", username), password=normalize("NFC", password))


basic = UTF8Basic(realm=REALM)
