import os
import time
from collections.abc import Callable

from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI

from authorization_server import authorization_server
from resource_server import BearerError, bearer_error_handler, resource_server


def create_app(issuer: str = "http://localhost:3000", now: Callable[[], float] = time.time,
               signing_key: rsa.RSAPrivateKey | None = None) -> FastAPI:
    """Two roles in one process so the lab runs with one command: the authorization server (/authorize, /token)
    and the resource server (/api/...). In production they are separate services that share only the token
    format and the key."""
    # The authorization server's signing key, made at start-up (the tests may pass their own). A real one lives in a
    # key vault and is rotated.
    signing_key = signing_key or rsa.generate_private_key(public_exponent=65537, key_size=2048)
    revoked: set[str] = set()  # jti values of revoked access tokens
    app = FastAPI()
    app.include_router(authorization_server(issuer, signing_key, now, revoked))
    app.add_exception_handler(BearerError, bearer_error_handler)
    requires = resource_server(issuer, signing_key.public_key(), now, revoked)

    @app.get("/api/photos")
    def photos(token: dict = requires("photos.read")):
        return {"owner": token["sub"], "photos": ["beach.jpg", "hills.jpg"]}

    @app.get("/api/reports")
    def reports(token: dict = requires("reports.read")):
        return {"client": token["client_id"], "reports": ["daily-sales.csv"]}

    return app


app = create_app(issuer=os.environ.get("ISSUER", "http://localhost:3000"))
