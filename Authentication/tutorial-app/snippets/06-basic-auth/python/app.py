from typing import Annotated

from argon2 import PasswordHasher
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasicCredentials

from basic import INVALID, REQUIRED, Unauthorized, basic
from passwords import HASHER
from users import DEMO_USERS, UserTable


def create_app(users: dict[str, str] = DEMO_USERS, hasher: PasswordHasher = HASHER) -> FastAPI:
    app = FastAPI()
    table = UserTable(users, hasher)

    @app.exception_handler(Unauthorized)
    def challenge(_request: Request, exc: Unauthorized) -> JSONResponse:
        """401 with a challenge: browsers show their sign-in dialog, and clients know which scheme to use."""
        return JSONResponse({"error": exc.message}, status_code=401, headers=basic.make_authenticate_headers())

    def current_user(credentials: Annotated[HTTPBasicCredentials | None, Depends(basic)]) -> str:
        """Lets the request through only with a valid username and password, and returns who it was."""
        if credentials is None:
            raise Unauthorized(REQUIRED)
        if not table.check(credentials.username, credentials.password):
            raise Unauthorized(INVALID)
        return credentials.username

    @app.get("/health")
    def health():
        return {"status": "ok"}  # public: no credentials needed

    @app.get("/me")
    def me(username: Annotated[str, Depends(current_user)]):
        return {"username": username}

    return app


# Basic sends the password with every request, readable by anyone on the path: serve it over HTTPS only.
# Plain HTTP is acceptable here only because nothing leaves your machine.
app = create_app()
