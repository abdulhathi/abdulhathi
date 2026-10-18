from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app import create_app

DAY = 24 * 60 * 60
clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC


def start(per_minute: int = 60):
    """An app with a first admin key made straight in the store."""
    app = create_app(now=lambda: clock[0], per_minute=per_minute)
    _, admin = app.state.keys.issue("admin", ["keys:manage"])
    return TestClient(app), app.state.keys, admin


client, store, admin = start()


def bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def with_wrong_secret(key: str) -> str:
    """The same key with its last character changed: the right id, the wrong secret."""
    return key[:-1] + ("B" if key.endswith("A") else "A")


def create_key(c: TestClient = client, admin_key: str = admin, **body) -> dict:
    body = body or {"name": "nightly-export", "scopes": ["reports:read"]}
    return c.post("/keys", headers=bearer(admin_key), json=body).json()


def test_an_admin_creates_a_key_shown_once_that_reads_reports():
    r = client.post("/keys", headers=bearer(admin), json={"name": "nightly-export", "scopes": ["reports:read"], "expiresInDays": 30})
    assert r.status_code == 201
    body = r.json()
    assert body["key"].startswith("ak_live_")
    assert body["expiresAt"] == "2026-11-16T12:00:00Z"
    assert body["note"] == "Copy this key now: it is shown only once."
    assert body["key"] not in repr(store.get(body["id"])), "the store holds only a hash"

    reports = client.get("/reports", headers=bearer(body["key"]))
    assert reports.status_code == 200
    assert reports.json() == {
        "client": "nightly-export",
        "reports": [{"month": "2026-09", "orders": 1520}, {"month": "2026-10", "orders": 1710}],
    }
    assert client.get("/reports", headers={"X-API-Key": body["key"]}).status_code == 200, "X-API-Key works too"


def test_no_key_a_wrong_key_and_a_key_in_the_url_are_refused():
    key = create_key()["key"]
    none = client.get("/reports")
    assert none.status_code == 401
    assert none.headers["www-authenticate"] == "Bearer"
    assert none.json() == {"error": "Send an API key in the Authorization or X-API-Key header."}
    wrong = client.get("/reports", headers=bearer(with_wrong_secret(key)))
    assert wrong.status_code == 401
    assert wrong.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert wrong.json() == {"error": "Invalid API key."}
    in_url = client.get("/reports", params={"api_key": key})
    assert in_url.status_code == 400
    assert in_url.json() == {"error": "Send the API key in a header, never in the URL."}


def test_a_key_without_the_needed_scope_gets_403():
    key = create_key()["key"]
    create = client.post("/keys", headers=bearer(key), json={"name": "sneaky", "scopes": ["keys:manage"]})
    assert create.status_code == 403
    assert create.headers["www-authenticate"] == 'Bearer error="insufficient_scope", scope="keys:manage"'
    assert create.json() == {"error": "This key lacks the keys:manage scope."}
    read = client.get("/reports", headers=bearer(admin))
    assert read.status_code == 403
    assert read.json() == {"error": "This key lacks the reports:read scope."}


def test_creating_a_key_checks_the_name_scopes_and_lifetime():
    unknown = client.post("/keys", headers=bearer(admin), json={"name": "x", "scopes": ["reports:write"]})
    assert unknown.status_code == 400
    assert unknown.json() == {"error": "Scopes must be a non-empty list from: reports:read, keys:manage."}
    assert client.post("/keys", headers=bearer(admin), json={"name": " ", "scopes": ["reports:read"]}).status_code == 400
    assert client.post("/keys", headers=bearer(admin), json={"name": "x", "scopes": ["reports:read"], "expiresInDays": 0}).status_code == 400
    # A wrong type is refused by FastAPI's own validation (422), not turned into a number.
    assert client.post("/keys", headers=bearer(admin), json={"name": "x", "scopes": ["reports:read"], "expiresInDays": True}).status_code == 422


def test_a_key_stops_working_when_it_expires():
    key = create_key(name="short-lived", scopes=["reports:read"], expiresInDays=1)["key"]
    assert client.get("/reports", headers=bearer(key)).status_code == 200
    clock[0] += DAY
    r = client.get("/reports", headers=bearer(key))
    assert r.status_code == 401
    assert r.json() == {"error": "This API key has expired."}
    guess = client.get("/reports", headers=bearer(with_wrong_secret(key)))
    assert guess.json() == {"error": "Invalid API key."}, "only the real key learns that it expired"


def test_a_revoked_key_stops_working_at_once():
    created = create_key()
    revoke = client.post(f"/keys/{created['id']}/revoke", headers=bearer(admin))
    assert revoke.status_code == 200
    assert revoke.json() == {"id": created["id"], "revoked": True}
    r = client.get("/reports", headers=bearer(created["key"]))
    assert r.status_code == 401
    assert r.json() == {"error": "This API key has been revoked."}
    guess = client.get("/reports", headers=bearer(with_wrong_secret(created["key"])))
    assert guess.json() == {"error": "Invalid API key."}, "only the real key learns that it was revoked"
    assert client.post("/keys/000000000000/revoke", headers=bearer(admin)).status_code == 404


def test_rotation_keeps_both_keys_working_until_the_old_one_expires():
    old = create_key()
    r = client.post(f"/keys/{old['id']}/rotate", headers=bearer(admin))
    assert r.status_code == 201
    fresh = r.json()
    assert fresh["key"] != old["key"]
    assert fresh["expiresAt"] == iso(clock[0] + 90 * DAY), "the new key gets the full lifetime"
    assert fresh["oldKeyExpiresAt"] == iso(clock[0] + DAY)
    again = client.post(f"/keys/{old['id']}/rotate", headers=bearer(admin)).json()
    assert again["expiresAt"] == iso(clock[0] + 90 * DAY), "rotating the old key again does not shorten the new one"
    assert client.get("/reports", headers=bearer(old["key"])).status_code == 200, "both work during the overlap"
    assert client.get("/reports", headers=bearer(fresh["key"])).status_code == 200
    clock[0] += DAY
    assert client.get("/reports", headers=bearer(old["key"])).status_code == 401
    assert client.get("/reports", headers=bearer(fresh["key"])).status_code == 200
    client.post(f"/keys/{fresh['id']}/revoke", headers=bearer(admin))
    assert client.post(f"/keys/{fresh['id']}/rotate", headers=bearer(admin)).status_code == 409


def test_each_key_has_its_own_rate_limit():
    limited, _, limited_admin = start(per_minute=3)
    a = create_key(limited, limited_admin)["key"]
    b = create_key(limited, limited_admin)["key"]
    for _ in range(3):
        assert limited.get("/reports", headers=bearer(a)).status_code == 200
    clock[0] += 15
    blocked = limited.get("/reports", headers=bearer(a))
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "45", "seconds until the next window"
    assert blocked.json() == {"error": "Rate limit exceeded. Try again later."}
    assert limited.get("/reports", headers=bearer(b)).status_code == 200, "another key is not affected"
    clock[0] += 45
    assert limited.get("/reports", headers=bearer(a)).status_code == 200, "a new window starts"
