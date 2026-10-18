import time
from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Cookie, Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from access import ACCESS_TTL, DenyList, issue_access_token, new_secret, verify_access_token
from refresh import Issued, RefreshStore, Rotated

# A stand-in for chapter 04, to keep this chapter about tokens: a real app checks a slow, salted hash.
USERS = [{"id": "u_1001", "email": "ada@example.com", "password": "correct horse battery"}]

# The refresh token lives in a cookie that page scripts cannot read (HttpOnly), that travels only over HTTPS
# (Secure), that other sites cannot make the browser send (SameSite=Strict), and that is sent only to /auth/*.
COOKIE = "refresh_token"
COOKIE_OPTIONS = {"httponly": True, "secure": True, "samesite": "strict", "path": "/auth"}

REFRESH_ERRORS = {
    "invalid": "Invalid refresh token.",
    "reused": "Refresh token reuse detected. Sign in again.",
    "expired": "Refresh token expired. Sign in again.",
}


class Credentials(BaseModel):
    email: str
    password: str


class Unauthorized(Exception):
    def __init__(self, error: str, challenge: str) -> None:
        self.error, self.challenge = error, challenge


def create_app(now: Callable[[], float] = time.time, secret: bytes | None = None) -> FastAPI:
    secret = secret or new_secret()
    store = RefreshStore(now)
    denied = DenyList(now)
    app = FastAPI()
    app.state.store = store

    def send_tokens(user: dict, refresh: Issued) -> JSONResponse:
        access = issue_access_token(secret, user["id"], user["email"], now)
        response = JSONResponse({"access_token": access, "token_type": "Bearer", "expires_in": ACCESS_TTL})
        response.set_cookie(COOKIE, refresh.token, max_age=round(refresh.expires_at - now()), **COOKIE_OPTIONS)
        response.headers["Cache-Control"] = "no-store"  # token responses must never be cached (RFC 6749, 5.1)
        return response

    def refused(error: str) -> JSONResponse:
        response = JSONResponse({"error": error}, status_code=401)
        response.delete_cookie(COOKIE, **COOKIE_OPTIONS)
        return response

    @app.post("/auth/login")
    def login(body: Credentials):
        user = next((u for u in USERS if u["email"] == body.email.strip().lower()), None)
        if user is None or user["password"] != body.password:
            return JSONResponse({"error": "Email or password is incorrect."}, status_code=401)
        return send_tokens(user, store.issue(user["id"]))

    @app.post("/auth/refresh")
    def refresh(refresh_token: Annotated[str | None, Cookie()] = None):
        if not refresh_token:
            return JSONResponse({"error": "Missing refresh token."}, status_code=401)
        result = store.rotate(refresh_token)
        if not isinstance(result, Rotated):
            return refused(REFRESH_ERRORS[result])
        user = next(u for u in USERS if u["id"] == result.user_id)
        return send_tokens(user, result.refresh)

    def bearer_claims(authorization: str | None) -> dict | None:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        claims = verify_access_token(secret, token)
        if claims["jti"] in denied:
            raise jwt.InvalidTokenError("Token revoked")
        return claims

    @app.post("/auth/logout", status_code=204)
    def logout(
        refresh_token: Annotated[str | None, Cookie()] = None,
        authorization: Annotated[str | None, Header()] = None,
    ):
        if refresh_token:
            store.revoke(refresh_token)
        # A JWT cannot be recalled. If the client sent its access token, deny-list it until it expires.
        try:
            if claims := bearer_claims(authorization):
                denied.add(claims["jti"], claims["exp"])
        except jwt.InvalidTokenError:
            pass
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, **COOKIE_OPTIONS)
        return response

    @app.exception_handler(Unauthorized)
    async def unauthorized(_: Request, exc: Unauthorized):
        return JSONResponse({"error": exc.error}, status_code=401, headers={"WWW-Authenticate": exc.challenge})

    def require_token(authorization: Annotated[str | None, Header()] = None) -> dict:
        try:
            claims = bearer_claims(authorization)
        except jwt.InvalidTokenError:
            raise Unauthorized("Invalid or expired token.", 'Bearer error="invalid_token"') from None
        if claims is None:
            raise Unauthorized("Missing bearer token.", "Bearer")
        return claims

    @app.get("/me")
    def me(claims: Annotated[dict, Depends(require_token)]):
        return {"sub": claims["sub"], "email": claims["email"]}

    return app


app = create_app()  # a fresh signing secret every start, and refresh tokens kept in memory: a restart signs everyone out
