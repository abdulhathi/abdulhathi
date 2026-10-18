"""A deliberately small OAuth 2.0 authorization server: GET /authorize and POST /token (RFC 6749, RFC 7636).

It exists to show what a real one checks. In production use Keycloak, Microsoft Entra ID, Okta, Auth0 or similar.
"""
import base64
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import quote, unquote_plus

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from clients import Client, find_client
from pkce import VERIFIER_FORMAT, challenge_for, random_token, safe_equal, sha256_hex

CODE_TTL = 60  # seconds: codes are short-lived and single-use
TOKEN_TTL = 600
AUDIENCE = "photo-api"  # the resource server these access tokens are for
TEST_USER = "u-1001"
SCOPE_ERROR = "The requested scope is invalid or not allowed for this client."
NO_STORE = {"Cache-Control": "no-store"}  # tokens must never be cached


@dataclass
class CodeGrant:
    client_id: str
    redirect_uri: str
    code_challenge: str
    scope: str
    sub: str
    expires_at: float


def oauth_error(status: int, error: str, description: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": description}, status_code=status, headers=headers)


def with_params(uri: str, params: dict[str, str | None]) -> str:
    """Adds query parameters to a URI, percent-encoding every value."""
    query = "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items() if v)
    return uri + ("&" if "?" in uri else "?") + query


def param(values, name: str) -> str:
    """One value per parameter: RFC 6749 says a parameter must not appear twice."""
    found = values.getlist(name)
    return found[0] if len(found) == 1 and isinstance(found[0], str) else ""


def scopes_allowed(scope: str, client: Client) -> bool:
    asked = scope.split()
    return bool(asked) and all(s in client.scopes for s in asked)


def authenticate_client(request: Request, form) -> Client | None:
    """client_secret_basic (an Authorization: Basic header) or client_secret_post (fields in the form)."""
    client_id, secret = param(form, "client_id"), param(form, "client_secret") or None
    header = request.headers.get("authorization", "")
    if header[:6].lower() == "basic ":
        try:
            decoded = base64.b64decode(header[6:], validate=True).decode()
        except ValueError:
            return None
        if ":" not in decoded:
            return None
        raw_id, raw_secret = decoded.split(":", 1)
        client_id, secret = unquote_plus(raw_id), unquote_plus(raw_secret)
    client = find_client(client_id)
    if client is None:
        return None
    if client.secret_hash is None:
        return client  # a public client has no secret to check
    return client if secret is not None and safe_equal(sha256_hex(secret), client.secret_hash) else None


def authorization_server(issuer: str, signing_key: RSAPrivateKey, now: Callable[[], float], revoked: set[str]) -> APIRouter:
    """revoked: the jti of every access token that must no longer work. The resource server checks it too."""
    router = APIRouter()
    codes: dict[str, CodeGrant] = {}  # a real server uses a shared store with expiry (Redis, a table)
    # Codes already redeemed, with the jti of the token each one gave, kept as long as that token lives.
    used_codes: dict[str, tuple[str, float]] = {}

    @router.get("/authorize")
    def authorize(request: Request):
        q = lambda name: param(request.query_params, name)  # noqa: E731
        client = find_client(q("client_id"))
        # Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
        if client is None or "authorization_code" not in client.grants:
            return oauth_error(400, "invalid_request", "Unknown client_id.")
        redirect_uri = q("redirect_uri")
        if redirect_uri not in client.redirect_uris:
            return oauth_error(400, "invalid_request", "redirect_uri is not registered for this client.")
        state = q("state") or None

        # Every response that goes back to the client carries iss (RFC 9207), so the client can tell which server sent it.
        def fail(error: str, description: str):
            params = {"error": error, "error_description": description, "state": state, "iss": issuer}
            return RedirectResponse(with_params(redirect_uri, params), 302)

        if q("response_type") != "code":
            return fail("unsupported_response_type", "Only response_type=code is supported.")
        if not q("code_challenge") or q("code_challenge_method") != "S256":
            return fail("invalid_request", "PKCE with S256 is required.")
        if not scopes_allowed(q("scope"), client):
            return fail("invalid_scope", SCOPE_ERROR)

        # A real server now shows its sign-in page, then a consent screen ("photo-app wants to read your photos").
        # To keep the flow to one request, this one signs in the test user straight away.
        code = random_token()
        codes[code] = CodeGrant(client.id, redirect_uri, q("code_challenge"), q("scope"), TEST_USER, now() + CODE_TTL)
        return RedirectResponse(with_params(redirect_uri, {"code": code, "state": state, "iss": issuer}), 302)

    def access_token(sub: str, client_id: str, scope: str) -> tuple[str, str]:
        """Signs an access token; returns it with its jti, the id that lets the server revoke it later."""
        iat, jti = int(now()), random_token(16)
        claims = {"iss": issuer, "sub": sub, "aud": AUDIENCE, "client_id": client_id, "scope": scope,
                  "iat": iat, "exp": iat + TOKEN_TTL, "jti": jti}
        # A JWT access token in the shape of RFC 9068: typ "at+jwt", so it cannot be mistaken for an ID token.
        return jwt.encode(claims, signing_key, algorithm="RS256", headers={"typ": "at+jwt"}), jti

    def issued(token: str, scope: str) -> JSONResponse:
        body = {"access_token": token, "token_type": "Bearer", "expires_in": TOKEN_TTL, "scope": scope}
        return JSONResponse(body, headers=NO_STORE)

    @router.post("/token")
    async def token(request: Request):
        form = await request.form()
        grant = param(form, "grant_type")
        # The implicit and password grants are not offered: RFC 9700 says not to use them.
        if grant not in ("authorization_code", "client_credentials"):
            return oauth_error(400, "unsupported_grant_type", "Use authorization_code or client_credentials.", NO_STORE)
        client = authenticate_client(request, form)
        if client is None:
            return oauth_error(401, "invalid_client", "Client authentication failed.",
                               {**NO_STORE, "WWW-Authenticate": 'Basic realm="token"'})
        if grant not in client.grants:
            return oauth_error(400, "unauthorized_client", "This client may not use this grant type.", NO_STORE)

        if grant == "client_credentials":
            scope = param(form, "scope") or " ".join(client.scopes)
            if not scopes_allowed(scope, client):
                return oauth_error(400, "invalid_scope", SCOPE_ERROR, NO_STORE)
            # No user is involved: the client is the subject. No refresh token either (RFC 6749 section 4.4.3).
            return issued(access_token(client.id, client.id, scope)[0], scope)

        code = param(form, "code")
        # A code that was already redeemed has leaked: refuse it and revoke the token it gave (RFC 6749 section 4.1.2).
        if used := used_codes.pop(code, None):
            jti, token_expires_at = used
            if token_expires_at > now():
                revoked.add(jti)
            return oauth_error(400, "invalid_grant", "The code is invalid, expired or already used.", NO_STORE)
        # authorization_code: take the code out of the store first, so it is used up even if a check below fails.
        saved = codes.pop(code, None)
        if saved is None or saved.expires_at <= now():
            return oauth_error(400, "invalid_grant", "The code is invalid, expired or already used.", NO_STORE)
        if saved.client_id != client.id:
            return oauth_error(400, "invalid_grant", "The code was issued to another client.", NO_STORE)
        if saved.redirect_uri != param(form, "redirect_uri"):
            return oauth_error(400, "invalid_grant", "redirect_uri does not match the authorization request.", NO_STORE)
        verifier = param(form, "code_verifier")
        if not VERIFIER_FORMAT.fullmatch(verifier) or not safe_equal(challenge_for(verifier), saved.code_challenge):
            return oauth_error(400, "invalid_grant", "code_verifier does not match the code_challenge.", NO_STORE)
        token, jti = access_token(saved.sub, client.id, saved.scope)
        used_codes[code] = (jti, now() + TOKEN_TTL)
        return issued(token, saved.scope)

    return router
