import secrets
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from deps import ApiError, current_user, document_for, require_role, require_scope
from documents import SEED, USERS, Document, DocumentStore
from policy import can
from tokens import User, sign_token


class DocumentIn(BaseModel):
    title: str = ""  # the only field a client may set: any other field (tenant, owner, status) is ignored


def title_of(body: DocumentIn | None) -> str:
    return body.title.strip() if body else ""


def print_test_tokens(key: bytes) -> None:
    """Sign-in is covered by earlier chapters. To try this API, print a token per demo user, made with this run's key."""
    print("Test tokens (valid for 1 hour). Paste these lines into your shell:")
    for name, claims in USERS.items():
        print(f"export {name.upper()}={sign_token(key, claims)}")
    print(f"export ADA_READONLY={sign_token(key, USERS['ada'], 'documents:read')}", flush=True)


def create_app(key: bytes | None = None, announce: bool = False) -> FastAPI:
    key = key or secrets.token_bytes(32)  # a fresh random signing key every run

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if announce:
            print_test_tokens(key)
        yield

    # current_user on the whole app: every route needs a valid token (deny by default). FastAPI's /docs and
    # /openapi.json pages are not routes that run these dependencies, so this API turns them off.
    app = FastAPI(dependencies=[Depends(current_user)], lifespan=lifespan, openapi_url=None)
    app.state.key = key
    app.state.store = store = DocumentStore(SEED)

    @app.exception_handler(ApiError)
    def api_error(_: Request, exc: ApiError):
        return JSONResponse({"error": exc.message}, status_code=exc.status, headers=exc.headers)

    @app.get("/documents")
    def list_documents(user: User = Depends(require_scope("documents:read"))):
        # Tenant filter in the query, then the same read rule as GET /documents/{doc_id}.
        return {"documents": [asdict(d) for d in store.list(user.tenant) if can(user, "read", d)]}

    @app.get("/documents/{doc_id}", dependencies=[Depends(require_scope("documents:read"))])
    def read_document(doc: Document = Depends(document_for("read"))):
        return asdict(doc)

    @app.post("/documents", status_code=201,
              dependencies=[Depends(require_scope("documents:write")), Depends(require_role("editor", "admin"))])
    def create_document(response: Response, body: DocumentIn | None = None, user: User = Depends(current_user)):
        if not (title := title_of(body)):
            raise ApiError(400, "Enter a title.")
        # Tenant, owner, department and status come from the token and the server, never from the request body.
        doc = Document(str(uuid.uuid4()), user.tenant, user.id, user.department, title, "draft")
        store.add(doc)
        response.headers["Location"] = f"/documents/{doc.id}"
        return asdict(doc)

    @app.put("/documents/{doc_id}", dependencies=[Depends(require_scope("documents:write"))])
    def update_document(body: DocumentIn | None = None, doc: Document = Depends(document_for("update"))):
        # Checked after the access checks, so a 400 never confirms that an id exists.
        if not (title := title_of(body)):
            raise ApiError(400, "Enter a title.")
        doc.title = title
        return asdict(doc)

    @app.post("/documents/{doc_id}/publish", dependencies=[Depends(require_scope("documents:write"))])
    def publish_document(doc: Document = Depends(document_for("publish"))):
        doc.status = "published"
        return asdict(doc)

    @app.delete("/documents/{doc_id}", status_code=204,
                dependencies=[Depends(require_scope("documents:write")), Depends(require_role("admin"))])
    def delete_document(doc: Document = Depends(document_for("delete")), user: User = Depends(current_user)):
        store.remove(user.tenant, doc.id)
        return Response(status_code=204)

    return app


app = create_app(announce=True)
