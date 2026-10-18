"""A tiny OpenID Connect provider for the lab: discovery, JWKS, authorize, token (with an RS256 ID token), UserInfo
and RP-initiated logout. It stands in for Microsoft Entra ID, Google, Okta or Keycloak; never use it for real.
"""
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from dataclasses import dataclass
from urllib.parse import quote, unquote_plus

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse
from jwt.algorithms import RSAAlgorithm

CODE_TTL = 60
TOKEN_TTL = 300
TEST_USER = {"sub": "u-1001", "name": "Ada Example", "email": "ada@example.com", "email_verified": True}
VERIFIER_FORMAT = re.compile(r"[A-Za-z0-9\-._~]{43,128}")


@dataclass(frozen=True)
class IdpClient:
    """A client registered at the provider."""
    id: str
    secret_hash: str
    redirect_uris: list[str]
    post_logout_redirect_uris: list[str]


@dataclass
class CodeGrant:
    client_id: str
    redirect_uri: str
    code_challenge: str
    nonce: str | None
    scope: str
    auth_time: int
    expires_at: float


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _param(values, name: str) -> str:
    found = values.getlist(name)
    return found[0] if len(found) == 1 and isinstance(found[0], str) else ""


def _with_params(uri: str, params: dict[str, str | None]) -> str:
    return uri + ("&" if "?" in uri else "?") + "&".join(f"{k}={quote(v, safe='')}" for k, v in params.items() if v)


def _oauth_error(status: int, error: str, description: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": error, "error_description": description}, status_code=status, headers=headers)


class MockIdp:
    def __init__(self, issuer: str, clients: list[IdpClient]) -> None:
        self.issuer = issuer
        self.clients = {c.id: c for c in clients}
        self.misbehave = "none"  # test hook: makes the next ID tokens wrong in one way
        self._codes: dict[str, CodeGrant] = {}
        self._access_tokens: dict[str, dict] = {}
        # The signing key is made at start-up; its kid is its RFC 7638 thumbprint, so a new key always gets a new kid.
        self._key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        # Never published: for the unknown-kid and bad-signature tests.
        self._rogue_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = RSAAlgorithm.to_jwk(self._key.public_key(), as_dict=True)
        thumbprint_input = json.dumps({"e": public["e"], "kty": "RSA", "n": public["n"]}, separators=(",", ":"))
        self.kid = _b64url(hashlib.sha256(thumbprint_input.encode()).digest())
        self._jwks = {"keys": [{"kty": "RSA", "n": public["n"], "e": public["e"], "kid": self.kid, "use": "sig", "alg": "RS256"}]}

    def discovery(self) -> dict:
        i = self.issuer
        return {
            "issuer": i,
            "authorization_endpoint": f"{i}/authorize",
            "token_endpoint": f"{i}/token",
            "userinfo_endpoint": f"{i}/userinfo",
            "jwks_uri": f"{i}/jwks",
            "end_session_endpoint": f"{i}/logout",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["RS256"],
            "scopes_supported": ["openid", "profile", "email"],
            "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
            "code_challenge_methods_supported": ["S256"],
            "claims_supported": ["sub", "name", "email", "email_verified"],
        }

    def id_token(self, grant: CodeGrant, client_id: str) -> str:
        """The ID token: a signed statement that this user signed in, for this client, just now."""
        now = int(time.time())
        claims = {"iss": self.issuer, "sub": TEST_USER["sub"], "aud": client_id, "exp": now + TOKEN_TTL, "iat": now,
                  "auth_time": grant.auth_time}
        if grant.nonce:
            claims["nonce"] = grant.nonce
        key, kid = self._key, self.kid
        match self.misbehave:
            case "wrong-nonce":
                claims["nonce"] = "not-the-nonce-you-sent"
            case "wrong-audience":
                # Issued to another app; azp names this one, which must not be enough to accept it.
                claims["aud"], claims["azp"] = "another-app", client_id
            case "expired":
                claims["iat"], claims["exp"] = now - 900, now - 600
            case "wrong-issuer":
                claims["iss"] = "https://evil.example.com"
            case "unknown-kid":
                key, kid = self._rogue_key, "unknown-key"
            case "bad-signature":
                # A forgery: the real kid, but a signature made with a key the provider never published.
                key = self._rogue_key
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    def authenticate_client(self, request: Request, form) -> IdpClient | None:
        """client_secret_basic (an Authorization: Basic header) or client_secret_post (fields in the form)."""
        client_id, secret = _param(form, "client_id"), _param(form, "client_secret")
        header = request.headers.get("authorization", "")
        if header[:6].lower() == "basic ":
            try:
                decoded = base64.b64decode(header[6:], validate=True).decode()
            except ValueError:
                return None
            if ":" not in decoded:
                return None
            client_id, secret = (unquote_plus(part) for part in decoded.split(":", 1))
        client = self.clients.get(client_id)
        digest = hashlib.sha256(secret.encode()).hexdigest()
        return client if client and secret and _safe_equal(digest, client.secret_hash) else None

    def router(self) -> APIRouter:
        router = APIRouter()

        @router.get("/.well-known/openid-configuration")
        def discovery():
            return self.discovery()

        @router.get("/jwks")
        def jwks():
            return self._jwks

        @router.get("/authorize")
        def authorize(request: Request):
            q = lambda name: _param(request.query_params, name)  # noqa: E731
            client = self.clients.get(q("client_id"))
            # Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
            if client is None:
                return _oauth_error(400, "invalid_request", "Unknown client_id.")
            redirect_uri = q("redirect_uri")
            if redirect_uri not in client.redirect_uris:
                return _oauth_error(400, "invalid_request", "redirect_uri is not registered for this client.")
            state = q("state")

            def fail(error: str, description: str):
                return RedirectResponse(_with_params(redirect_uri, {"error": error, "error_description": description, "state": state}), 302)

            if q("response_type") != "code":
                return fail("unsupported_response_type", "Only response_type=code is supported.")
            if "openid" not in q("scope").split():
                return fail("invalid_scope", "The openid scope is required.")
            if not q("code_challenge") or q("code_challenge_method") != "S256":
                return fail("invalid_request", "PKCE with S256 is required.")

            # A real provider shows its sign-in page here (and remembers the user in its own session cookie).
            # To keep the flow to one request, this one signs in the test user straight away.
            code = secrets.token_urlsafe(32)
            self._codes[code] = CodeGrant(client.id, redirect_uri, q("code_challenge"), q("nonce") or None, q("scope"),
                                          int(time.time()), time.time() + CODE_TTL)
            return RedirectResponse(_with_params(redirect_uri, {"code": code, "state": state}), 302)

        @router.post("/token")
        async def token(request: Request):
            no_store = {"Cache-Control": "no-store"}
            form = await request.form()
            f = lambda name: _param(form, name)  # noqa: E731
            if f("grant_type") != "authorization_code":
                return _oauth_error(400, "unsupported_grant_type", "Only authorization_code is supported.", no_store)
            client = self.authenticate_client(request, form)
            if client is None:
                return _oauth_error(401, "invalid_client", "Client authentication failed.",
                                    {**no_store, "WWW-Authenticate": 'Basic realm="token"'})
            # Single use: the code leaves the store before any other check.
            saved = self._codes.pop(f("code"), None)
            if saved is None or saved.expires_at <= time.time():
                return _oauth_error(400, "invalid_grant", "The code is invalid, expired or already used.", no_store)
            if saved.client_id != client.id:
                return _oauth_error(400, "invalid_grant", "The code was issued to another client.", no_store)
            if saved.redirect_uri != f("redirect_uri"):
                return _oauth_error(400, "invalid_grant", "redirect_uri does not match the authorization request.", no_store)
            verifier = f("code_verifier")
            challenge = _b64url(hashlib.sha256(verifier.encode("ascii", "replace")).digest())
            if not VERIFIER_FORMAT.fullmatch(verifier) or not _safe_equal(challenge, saved.code_challenge):
                return _oauth_error(400, "invalid_grant", "code_verifier does not match the code_challenge.", no_store)
            access_token = secrets.token_urlsafe(32)  # opaque: only this provider can read it, at the UserInfo endpoint
            self._access_tokens[access_token] = {"sub": TEST_USER["sub"], "scope": saved.scope, "expires_at": time.time() + TOKEN_TTL}
            body = {"access_token": access_token, "token_type": "Bearer", "expires_in": TOKEN_TTL,
                    "id_token": self.id_token(saved, client.id), "scope": saved.scope}
            return JSONResponse(body, headers=no_store)

        @router.get("/userinfo")
        def userinfo(request: Request):
            header = request.headers.get("authorization", "")
            grant = self._access_tokens.get(header[7:]) if header[:7].lower() == "bearer " else None
            if grant is None or grant["expires_at"] <= time.time():
                return _oauth_error(401, "invalid_token", "The access token is invalid or expired.",
                                    {"WWW-Authenticate": 'Bearer error="invalid_token"'})
            # Only the claims the granted scopes allow.
            scopes = grant["scope"].split()
            claims = {"sub": grant["sub"]}
            if "profile" in scopes:
                claims["name"] = TEST_USER["name"]
            if "email" in scopes:
                claims |= {"email": TEST_USER["email"], "email_verified": TEST_USER["email_verified"]}
            return claims

        @router.get("/logout")
        def logout(request: Request):
            """RP-initiated logout: end the provider's session, then send the browser back to a registered address."""
            q = lambda name: _param(request.query_params, name)  # noqa: E731
            client_id = q("client_id")
            if hint := q("id_token_hint"):
                # The hint must be one of our own ID tokens. It may have expired: that is fine for a logout.
                try:
                    claims = jwt.decode(hint, self._key.public_key(), algorithms=["RS256"], issuer=self.issuer,
                                        options={"verify_exp": False, "verify_aud": False})
                except jwt.InvalidTokenError:
                    return _oauth_error(400, "invalid_request", "id_token_hint is not valid.")
                aud = claims.get("aud")
                client_id = client_id or (aud[0] if isinstance(aud, list) else aud)
            # A real provider clears its own session cookie here, and may ask "Sign out of all apps?"
            target = q("post_logout_redirect_uri")
            if not target:
                return {"message": "Signed out of the identity provider."}
            client = self.clients.get(client_id)
            if client is None or target not in client.post_logout_redirect_uris:
                return _oauth_error(400, "invalid_request", "post_logout_redirect_uri is not registered.")
            return RedirectResponse(_with_params(target, {"state": q("state")}), 302)

        return router
