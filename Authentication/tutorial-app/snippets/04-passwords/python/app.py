import math
import time
from collections.abc import Callable

from argon2 import PasswordHasher
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from limiter import LoginLimiter
from passwords import HASHER, hash_password, needs_rehash, password_problem, verify_password


class Credentials(BaseModel):
    # Defaults, so a missing field gets the normal 400 or 401 instead of FastAPI's 422.
    email: str = ""
    password: str = ""


INVALID = {"error": "Email or password is incorrect."}


def create_app(hasher: PasswordHasher = HASHER, now: Callable[[], float] = time.time) -> FastAPI:
    app = FastAPI()
    users: dict[str, str] = {}  # email -> password hash; a real app uses a database table
    limiter = LoginLimiter(now)
    # Checked when the email is unknown, so both paths take the same time.
    dummy_hash = hash_password("not-a-real-password", hasher)
    app.state.users = users

    @app.post("/signup", status_code=201)
    def signup(body: Credentials):
        email = body.email.strip().lower()
        if "@" not in email:
            return JSONResponse({"error": "Enter a valid email address."}, status_code=400)
        if problem := password_problem(body.password):
            return JSONResponse({"error": problem}, status_code=400)
        if email in users:
            return JSONResponse({"error": "That email is already registered."}, status_code=409)
        users[email] = hash_password(body.password, hasher)
        return {"email": email}

    @app.post("/login")
    def login(body: Credentials):
        email = body.email.strip().lower()
        if (wait := limiter.retry_after(email)) > 0:
            return JSONResponse(
                {"error": "Too many failed attempts. Try again later."},
                status_code=429,
                headers={"Retry-After": str(math.ceil(wait))},
            )
        stored = users.get(email)
        ok = verify_password(body.password, stored or dummy_hash, hasher)
        if stored is None or not ok:
            limiter.fail(email)
            return JSONResponse(INVALID, status_code=401)  # same answer for "no such user" and "wrong password"
        limiter.succeed(email)
        if needs_rehash(stored, hasher):
            users[email] = hash_password(body.password, hasher)
        return {"email": email, "message": "Signed in."}

    return app


app = create_app()
