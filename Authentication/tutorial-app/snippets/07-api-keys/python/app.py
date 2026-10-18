import math
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, StrictInt

from keys import DEFAULT_TTL_DAYS, SCOPES, ApiKey, KeyStore
from limiter import FixedWindowLimiter

REPORTS = [{"month": "2026-09", "orders": 1520}, {"month": "2026-10", "orders": 1710}]
NO_SUCH_KEY = "No such key."

# Both schemes read a header and show up in the /docs "Authorize" dialog. auto_error=False: we answer ourselves.
bearer = HTTPBearer(auto_error=False)
x_api_key = APIKeyHeader(name="X-API-Key", auto_error=False)
# RFC 6750 challenges: a bare "Bearer" when no key was sent, error="invalid_token" when the key was refused.
NO_KEY = {"WWW-Authenticate": "Bearer"}
BAD_KEY = {"WWW-Authenticate": 'Bearer error="invalid_token"'}


class Refused(Exception):
    """Ends the request with {"error": message} and the given status."""

    def __init__(self, status: int, message: str, headers: dict[str, str] | None = None) -> None:
        self.status, self.message, self.headers = status, message, headers


class NewKey(BaseModel):
    name: str = ""
    scopes: list[str] = []
    # StrictInt: refuse "30" and true instead of quietly turning them into 30 and 1 day.
    expires_in_days: StrictInt = Field(DEFAULT_TTL_DAYS, alias="expiresInDays")


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _shown(record: ApiKey, key: str) -> dict:
    """The one response that ever contains the key."""
    return {"id": record.id, "key": key, "name": record.name, "scopes": record.scopes,
            "expiresAt": _iso(record.expires_at), "note": "Copy this key now: it is shown only once."}


def create_app(now: Callable[[], float] = time.time, per_minute: int = 60) -> FastAPI:
    app = FastAPI()
    store = KeyStore(now)
    limiter = FixedWindowLimiter(per_minute, 60, now)
    app.state.keys = store

    @app.exception_handler(Refused)
    async def refused(_: Request, exc: Refused):
        return JSONResponse({"error": exc.message}, status_code=exc.status, headers=exc.headers)

    def require_scope(scope: str):
        """A dependency: a valid key, within its rate limit, that holds `scope`. Returns the key's record."""

        async def check(
            request: Request,
            auth: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
            header: Annotated[str | None, Depends(x_api_key)],
        ) -> ApiKey:
            # A key in the URL ends up in access logs, browser history and Referer headers. Refuse it loudly.
            if "api_key" in request.query_params:
                raise Refused(400, "Send the API key in a header, never in the URL.")
            presented = auth.credentials if auth else header
            if not presented:
                raise Refused(401, "Send an API key in the Authorization or X-API-Key header.", NO_KEY)
            key, error = store.verify(presented)
            if key is None:
                raise Refused(401, error or "Invalid API key.", BAD_KEY)
            if (wait := limiter.hit(key.id)) > 0:  # counted per key, not per IP address
                raise Refused(429, "Rate limit exceeded. Try again later.", {"Retry-After": str(math.ceil(wait))})
            if scope not in key.scopes:
                challenge = f'Bearer error="insufficient_scope", scope="{scope}"'
                raise Refused(403, f"This key lacks the {scope} scope.", {"WWW-Authenticate": challenge})
            return key

        return check

    # What a client application calls with its key.
    @app.get("/reports")
    async def reports(key: Annotated[ApiKey, Depends(require_scope("reports:read"))]):
        return {"client": key.name, "reports": REPORTS}

    # Everything under /keys is for admins: one dependency protects the whole group.
    admin = APIRouter(prefix="/keys", dependencies=[Depends(require_scope("keys:manage"))])

    @admin.post("", status_code=201)
    async def create_key(body: NewKey):
        name = body.name.strip()
        if not 1 <= len(name) <= 100:
            raise Refused(400, "Give the key a name of 1 to 100 characters.")
        if not body.scopes or any(s not in SCOPES for s in body.scopes):
            raise Refused(400, f"Scopes must be a non-empty list from: {', '.join(SCOPES)}.")
        if not 1 <= body.expires_in_days <= 365:
            raise Refused(400, "expiresInDays must be a whole number from 1 to 365.")
        record, key = store.issue(name, list(dict.fromkeys(body.scopes)), body.expires_in_days)
        return _shown(record, key)

    @admin.post("/{key_id}/revoke")
    async def revoke(key_id: str):
        if (record := store.revoke(key_id)) is None:
            raise Refused(404, NO_SUCH_KEY)
        return {"id": record.id, "revoked": True}

    # Rotation: a new key now, and the old one keeps working for 24 hours while the client switches over.
    @admin.post("/{key_id}/rotate", status_code=201)
    async def rotate(key_id: str):
        if (old := store.get(key_id)) is None:
            raise Refused(404, NO_SUCH_KEY)
        if old.revoked_at is not None:
            raise Refused(409, "That key is revoked. Create a new key instead.")
        record, key = store.rotate(old)
        return {**_shown(record, key), "oldKeyExpiresAt": _iso(old.expires_at)}

    app.include_router(admin)
    return app
