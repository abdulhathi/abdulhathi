import os
import time
from collections.abc import Callable
from typing import Annotated

from argon2 import PasswordHasher
from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from passwords import HASHER
from sessions import IDLE_SECONDS, Session, SessionStore
from tokens import same_token
from users import DEMO_USERS, UserTable

COOKIE = "sid"
INVALID = "Email or password is incorrect."
SIGN_IN = "Sign in first."
BAD_CSRF = "Missing or invalid CSRF token."


class Credentials(BaseModel):
    email: str
    password: str


class Note(BaseModel):
    text: str


class ApiError(Exception):
    def __init__(self, status: int, message: str) -> None:
        self.status = status
        self.message = message


def create_app(
    users: dict[str, str] = DEMO_USERS,
    hasher: PasswordHasher = HASHER,
    now: Callable[[], float] = time.time,
    secure: bool = True,  # the cookie's Secure flag: leave it on except for plain-HTTP development
) -> FastAPI:
    app = FastAPI()
    table = UserTable(users, hasher)
    store = SessionStore(now)
    notes: dict[str, list[str]] = {}  # email -> notes
    flags = {"path": "/", "secure": secure, "httponly": True, "samesite": "lax"}

    @app.exception_handler(ApiError)
    def api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    def current_session(request: Request, response: Response) -> Session:
        """Lets a request through only with a live session. The store checks the timeouts itself: the cookie's
        expiry is only a hint to the browser, and a stolen cookie can be replayed whatever it says."""
        session = store.get(request.cookies.get(COOKIE))
        if session is None:
            raise ApiError(401, SIGN_IN)
        # Send the cookie again, so its expiry in the browser slides with the idle timeout.
        response.set_cookie(COOKIE, session.id, max_age=IDLE_SECONDS, **flags)
        return session

    def csrf_checked(request: Request, session: Annotated[Session, Depends(current_session)]) -> Session:
        """The synchronizer token pattern: the token lives in the session, and every state-changing request must
        send it back in a header. Another site can make the browser send the cookie, but it cannot read the token."""
        if not same_token(request.headers.get("X-CSRF-Token", ""), session.csrf_token):
            raise ApiError(403, BAD_CSRF)
        return session

    @app.post("/login")
    def login(body: Credentials, request: Request, response: Response):
        email = table.check(body.email, body.password)
        if email is None:
            raise ApiError(401, INVALID)
        # A brand-new session id at sign-in, so an id someone planted or saw earlier is worthless (session fixation).
        store.destroy(request.cookies.get(COOKIE))
        session = store.create(email)
        response.set_cookie(COOKIE, session.id, max_age=IDLE_SECONDS, **flags)
        return {"email": email, "message": "Signed in."}

    @app.get("/me")
    def me(session: Annotated[Session, Depends(current_session)]):
        return {"email": session.email}

    @app.get("/csrf")
    def csrf(session: Annotated[Session, Depends(current_session)]):
        return {"csrfToken": session.csrf_token}

    @app.post("/notes", status_code=201)
    def add_note(body: Note, session: Annotated[Session, Depends(csrf_checked)]):
        notes.setdefault(session.email, []).append(body.text)
        return {"notes": notes[session.email]}

    @app.post("/logout")
    def logout(session: Annotated[Session, Depends(csrf_checked)]):
        store.destroy(session.id)  # gone from the store: the old cookie now opens nothing
        # A response of its own, so the refreshed cookie from current_session is dropped; this one deletes it.
        response = JSONResponse({"message": "Signed out."})
        response.delete_cookie(COOKIE, **flags)
        return response

    return app


# Most browsers, and curl, accept a Secure cookie from http://localhost. If yours does not, start with
# COOKIE_SECURE=false while developing. Never in production.
app = create_app(secure=os.environ.get("COOKIE_SECURE") != "false")
