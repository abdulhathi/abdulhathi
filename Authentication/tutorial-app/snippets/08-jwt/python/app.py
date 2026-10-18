import time
from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from keys import KeyRing
from tokens import LIFETIME, User, issue_access_token, verify_access_token

# A stand-in for chapter 04, to keep this chapter about tokens: a real app checks a slow, salted hash.
USERS = {"ada@example.com": (User("u_1001", "ada@example.com"), "correct horse battery")}


class Credentials(BaseModel):
    email: str = ""  # a missing field gets the same 401
    password: str = ""


class Unauthorized(Exception):
    def __init__(self, error: str, challenge: str) -> None:
        self.error, self.challenge = error, challenge


def create_app(ring: KeyRing | None = None, now: Callable[[], float] = time.time) -> FastAPI:
    ring = ring or KeyRing()
    app = FastAPI()
    app.state.ring = ring

    @app.exception_handler(Unauthorized)
    async def unauthorized(_: Request, exc: Unauthorized):
        return JSONResponse({"error": exc.error}, status_code=401, headers={"WWW-Authenticate": exc.challenge})

    # Authorization: Bearer <token> (RFC 6750). Any failure gets the same 401; the reason stays on the server.
    def bearer_claims(authorization: Annotated[str | None, Header()] = None) -> dict:
        scheme, _, token = (authorization or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise Unauthorized("Missing bearer token.", "Bearer")
        try:
            return verify_access_token(ring, token)
        except jwt.InvalidTokenError:
            raise Unauthorized("Invalid or expired token.", 'Bearer error="invalid_token"') from None

    @app.post("/login")
    def login(body: Credentials, response: Response):
        user, password = USERS.get(body.email.strip().lower(), (None, None))
        if user is None or password != body.password:
            return JSONResponse({"error": "Email or password is incorrect."}, status_code=401)
        token = issue_access_token(ring, user, now)
        response.headers["Cache-Control"] = "no-store"  # a response holding a token must never be cached (RFC 6749, 5.1)
        return {"access_token": token, "token_type": "Bearer", "expires_in": LIFETIME}

    # Public keys only: anyone may fetch them, and they can verify tokens but never sign one.
    @app.get("/.well-known/jwks.json")
    def jwks(response: Response):
        response.headers["Cache-Control"] = "public, max-age=300"
        return ring.jwks()

    @app.get("/me")
    def me(claims: Annotated[dict, Depends(bearer_claims)]):
        return {"sub": claims["sub"], "email": claims["email"]}

    return app


app = create_app()  # a fresh RS256 key every start: tokens from the last run stop verifying
