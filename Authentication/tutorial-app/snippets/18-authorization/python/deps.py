"""FastAPI dependencies, solved in this order on each route: who are you (401), may this token do this (403),
may your role do this (403), and may you do this to this document (404 or 403)."""
from collections.abc import Callable

from fastapi import Depends, Request

from documents import Document, DocumentStore
from policy import Action, can
from tokens import User, verify_token

UNAUTHORIZED = "Missing or invalid token."
FORBIDDEN = "You are not allowed to do that."
NOT_FOUND = "Document not found."


class ApiError(Exception):
    """Turned into {"error": message} by the handler in app.py."""

    def __init__(self, status: int, message: str, headers: dict[str, str] | None = None) -> None:
        self.status, self.message, self.headers = status, message, headers


def current_user(request: Request) -> User:
    """401 unless the request carries a valid bearer token. Added to the whole app: deny by default."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    sent = scheme.lower() == "bearer" and bool(token)
    user = verify_token(request.app.state.key, token) if sent else None
    if user is None:
        # RFC 6750: a bare challenge when no token came, error="invalid_token" when one was refused.
        raise ApiError(401, UNAUTHORIZED, {"WWW-Authenticate": 'Bearer error="invalid_token"' if sent else "Bearer"})
    return user


def require_scope(scope: str) -> Callable[..., User]:
    """Scopes limit what a token may do, whoever the user is (RFC 6750 names the error insufficient_scope)."""

    def check(user: User = Depends(current_user)) -> User:
        if scope not in user.scopes:
            raise ApiError(403, f"This token lacks the {scope} scope.",
                           {"WWW-Authenticate": f'Bearer error="insufficient_scope", scope="{scope}"'})
        return user

    return check


def require_role(*roles: str) -> Callable[..., User]:
    """Role-based access control: the user needs at least one of these roles."""

    def check(user: User = Depends(current_user)) -> User:
        if not any(r in roles for r in user.roles):
            raise ApiError(403, FORBIDDEN)
        return user

    return check


def document_for(action: Action) -> Callable[..., Document]:
    """Loads {doc_id} from the caller's own tenant and checks the policy for this action.

    404 when the caller may not even see the document (another tenant's, or someone else's draft), so its existence
    is not revealed; 403 when they can see it but may not do this to it.
    """

    def load(doc_id: str, request: Request, user: User = Depends(current_user)) -> Document:
        store: DocumentStore = request.app.state.store
        doc = store.get(user.tenant, doc_id)
        if doc is None or not can(user, "read", doc):
            raise ApiError(404, NOT_FOUND)
        if not can(user, action, doc):
            raise ApiError(403, FORBIDDEN)
        return doc

    return load
