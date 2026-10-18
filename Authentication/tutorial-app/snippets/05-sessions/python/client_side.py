"""For contrast: a client-side session with Starlette's SessionMiddleware.

The whole session travels in the cookie as base64-encoded JSON, signed by itsdangerous (HMAC with a timestamp) so it
cannot be changed. But anyone holding the cookie can read it, and the server keeps nothing, so it cannot tell a
signed-out cookie from a live one.
"""
import secrets

from argon2 import PasswordHasher
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from passwords import HASHER
from users import DEMO_USERS, UserTable


class Credentials(BaseModel):
    email: str
    password: str


def create_client_side_app(users: dict[str, str] = DEMO_USERS, hasher: PasswordHasher = HASHER) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        SessionMiddleware, secret_key=secrets.token_urlsafe(32), session_cookie="session",
        max_age=30 * 60, same_site="lax", https_only=True,
    )
    table = UserTable(users, hasher)

    @app.post("/login")
    def login(body: Credentials, request: Request):
        email = table.check(body.email, body.password)
        if email is None:
            return JSONResponse({"error": "Email or password is incorrect."}, status_code=401)
        request.session.clear()
        request.session["email"] = email
        return {"email": email, "message": "Signed in."}

    @app.get("/me")
    def me(request: Request):
        email = request.session.get("email")  # empty when the signature does not match
        if email is None:
            return JSONResponse({"error": "Sign in first."}, status_code=401)
        return {"email": email}

    @app.post("/logout")
    def logout(request: Request):
        request.session.clear()  # asks the browser to forget the cookie; any copy still works
        return {"message": "Signed out."}

    return app
