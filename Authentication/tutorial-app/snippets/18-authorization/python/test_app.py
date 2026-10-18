import json
import secrets
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import create_app
from documents import USERS
from tokens import AUDIENCE, FULL_ACCESS, ISSUER, sign_token

KEY = secrets.token_bytes(32)

# Every route that names a document, and every route that writes.
ROUTES_WITH_ID = [("GET", "/documents/d1", None), ("PUT", "/documents/d1", {"title": "Mine now"}),
                  ("POST", "/documents/d1/publish", None), ("DELETE", "/documents/d1", None)]
WRITES = [("POST", "/documents", {"title": "Team notes"}), *ROUTES_WITH_ID[1:]]


@pytest.fixture
def client():
    return TestClient(create_app(KEY))  # a fresh app, with fresh demo data, for every test


def token(name: str, scope: str | None = None) -> str:
    return sign_token(KEY, USERS[name], scope) if scope else sign_token(KEY, USERS[name])


def call(client, method: str, path: str, bearer: str | None = None, body=None):
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    return client.request(method, path, headers=headers, json=body)


def as_(client, name: str, method: str, path: str, body=None):
    return call(client, method, path, token(name), body)


def ids(res) -> list[str]:
    return [d["id"] for d in res.json()["documents"]]


def test_a_request_without_a_valid_token_is_401(client):
    for method, path, body in [("GET", "/documents", None), *WRITES]:
        r = call(client, method, path, None, body)
        assert r.status_code == 401, f"{method} {path}"
        assert r.headers["www-authenticate"] == "Bearer"
        assert r.json() == {"error": "Missing or invalid token."}
    other_key = sign_token(secrets.token_bytes(32), USERS["ada"])
    expired = sign_token(KEY, USERS["ada"], exp=int(time.time()) - 60)  # no clock skew allowed
    for bearer in ("not-a-token", other_key, expired):
        r = call(client, "GET", "/documents", bearer)
        assert r.status_code == 401
        assert r.headers["www-authenticate"] == 'Bearer error="invalid_token"'
        assert r.json() == {"error": "Missing or invalid token."}


def test_a_signed_token_still_needs_this_audience_an_expiry_and_every_claim_the_rules_read(client):
    full = {**USERS["ada"], "scope": FULL_ACCESS, "iss": ISSUER, "aud": AUDIENCE, "exp": int(time.time()) + 3600}

    def without(name: str) -> dict:
        return {k: v for k, v in full.items() if k != name}

    assert call(client, "GET", "/documents", jwt.encode(full, KEY, algorithm="HS256")).status_code == 200, "the complete token works"
    for claims in ({**full, "aud": "another-api"}, without("exp"), without("tenant"), without("roles")):
        r = call(client, "GET", "/documents", jwt.encode(claims, KEY, algorithm="HS256"))
        assert r.status_code == 401, json.dumps(claims)
        assert r.headers["www-authenticate"] == 'Bearer error="invalid_token"'


def test_each_user_lists_only_the_documents_they_may_read_in_their_own_tenant(client):
    assert ids(as_(client, "bo", "GET", "/documents")) == ["d2"]
    assert ids(as_(client, "ada", "GET", "/documents")) == ["d1", "d2", "d3"]
    assert ids(as_(client, "eve", "GET", "/documents")) == ["d4"]


def test_another_tenants_document_is_404_on_every_route_even_for_an_admin_exactly_like_a_missing_one(client):
    missing = as_(client, "eve", "GET", "/documents/nope")
    assert missing.status_code == 404
    for method, path, body in ROUTES_WITH_ID:
        r = as_(client, "eve", method, path, body)  # eve is an admin, but of the south tenant
        assert r.status_code == 404, f"{method} {path}"
        assert r.json() == missing.json()
    assert as_(client, "di", "GET", "/documents/d4").status_code == 404
    own = as_(client, "ada", "GET", "/documents/d1")
    assert own.status_code == 200, "still there for its own tenant"
    assert own.json() == {"id": "d1", "tenant": "north", "owner": "ada", "department": "sales",
                          "title": "Sales plan", "status": "draft"}, "and unchanged"


def test_a_viewer_cannot_see_someone_elses_draft_on_any_route_but_can_read_published_documents(client):
    for method, path, body in ROUTES_WITH_ID[:3]:
        assert as_(client, "bo", method, path, body).status_code == 404, f"{method} {path}"
    published = as_(client, "bo", "GET", "/documents/d2")
    assert published.status_code == 200
    assert published.json()["title"] == "Price list"


def test_only_editors_and_admins_can_create_documents_rbac(client):
    viewer = as_(client, "bo", "POST", "/documents", {"title": "Team notes"})
    assert viewer.status_code == 403
    assert viewer.json() == {"error": "You are not allowed to do that."}
    editor = as_(client, "ada", "POST", "/documents", {"title": "Team notes"})
    assert editor.status_code == 201
    doc = editor.json()
    assert editor.headers["location"] == f"/documents/{doc['id']}"
    assert {**doc, "id": "x"} == {"id": "x", "tenant": "north", "owner": "ada", "department": "sales",
                                  "title": "Team notes", "status": "draft"}


def test_tenant_owner_and_status_come_from_the_token_never_from_the_request_body(client):
    doc = as_(client, "ada", "POST", "/documents",
              {"title": "Sneaky", "tenant": "south", "owner": "eve", "status": "published"}).json()
    assert (doc["tenant"], doc["owner"], doc["status"]) == ("north", "ada", "draft")
    assert as_(client, "eve", "GET", f"/documents/{doc['id']}").status_code == 404


def test_a_title_is_required_and_it_is_checked_only_after_the_access_checks(client):
    for body in (None, {}, {"title": "   "}):
        for method, path in (("POST", "/documents"), ("PUT", "/documents/d1")):
            r = as_(client, "ada", method, path, body)
            assert r.status_code == 400, f"{method} {path} {body}"
            assert r.json() == {"error": "Enter a title."}
    assert as_(client, "bo", "PUT", "/documents/d1", {}).status_code == 404  # a draft bo cannot see
    assert as_(client, "eve", "PUT", "/documents/d1", {}).status_code == 404  # another tenant's


def test_only_the_owner_or_an_admin_can_update_a_document(client):
    assert as_(client, "cy", "PUT", "/documents/d1", {"title": "Mine now"}).status_code == 403  # can read it, not the owner
    assert as_(client, "bo", "PUT", "/documents/d2", {"title": "Mine now"}).status_code == 403  # can read it, not the owner
    assert as_(client, "bo", "PUT", "/documents/d1", {"title": "Mine now"}).status_code == 404  # cannot even read it
    owner = as_(client, "ada", "PUT", "/documents/d1", {"title": "Sales plan v2"})
    assert owner.status_code == 200
    assert owner.json()["title"] == "Sales plan v2"
    assert as_(client, "di", "PUT", "/documents/d1", {"title": "Sales plan v3"}).status_code == 200


def test_editors_may_publish_only_in_their_own_department_abac(client):
    other_department = as_(client, "cy", "POST", "/documents/d1/publish")
    assert other_department.status_code == 403
    assert other_department.json() == {"error": "You are not allowed to do that."}
    same_department = as_(client, "ada", "POST", "/documents/d1/publish")
    assert same_department.status_code == 200
    assert same_department.json()["status"] == "published"
    assert as_(client, "di", "POST", "/documents/d3/publish").status_code == 200  # an admin


def test_a_read_only_token_cannot_write_even_for_an_editor_scopes(client):
    read_only = token("ada", "documents:read")
    assert call(client, "GET", "/documents/d1", read_only).status_code == 200
    for method, path, body in WRITES:
        r = call(client, method, path, read_only, body)
        assert r.status_code == 403, f"{method} {path}"
        assert r.headers["www-authenticate"] == 'Bearer error="insufficient_scope", scope="documents:write"'
        assert r.json() == {"error": "This token lacks the documents:write scope."}
    write_only = call(client, "GET", "/documents", token("ada", "documents:write"))
    assert write_only.status_code == 403
    assert write_only.headers["www-authenticate"] == 'Bearer error="insufficient_scope", scope="documents:read"'


def test_only_admins_can_delete_and_only_in_their_own_tenant(client):
    # The role check runs before the lookup and gives the same answer for every id, so it reveals nothing.
    for doc_id in ("d1", "d4", "nope"):
        r = as_(client, "ada", "DELETE", f"/documents/{doc_id}")  # ada owns d1, but is not an admin
        assert r.status_code == 403, doc_id
        assert r.json() == {"error": "You are not allowed to do that."}
    assert as_(client, "di", "DELETE", "/documents/d1").status_code == 204
    assert as_(client, "ada", "GET", "/documents/d1").status_code == 404
