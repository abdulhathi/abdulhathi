from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app import create_app
from passwords import hash_password

FAST = PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)
clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC
app = create_app(FAST, now=lambda: clock[0])
client = TestClient(app)
users = app.state.users


def test_sign_up_then_sign_in_with_the_same_password():
    assert client.post("/signup", json={"email": "Ada@Example.com", "password": "correct horse battery"}).status_code == 201
    r = client.post("/login", json={"email": "ada@example.com", "password": "correct horse battery"})
    assert r.status_code == 200
    assert r.json() == {"email": "ada@example.com", "message": "Signed in."}
    assert "correct horse" not in users["ada@example.com"], "never store the password"


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer():
    wrong = client.post("/login", json={"email": "ada@example.com", "password": "wrong horse battery"})
    unknown = client.post("/login", json={"email": "nobody@example.com", "password": "wrong horse battery"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_missing_fields_get_the_normal_answers_not_a_server_error():
    assert client.post("/signup", json={}).status_code == 400
    assert client.post("/login", json={}).status_code == 401


def test_sign_up_rejects_weak_passwords_and_duplicate_emails():
    assert client.post("/signup", json={"email": "bo@example.com", "password": "short"}).status_code == 400
    assert client.post("/signup", json={"email": "ada@example.com", "password": "another long password"}).status_code == 409


def test_five_failures_lock_the_account_for_15_minutes():
    client.post("/signup", json={"email": "cy@example.com", "password": "correct horse battery"})
    for _ in range(5):
        client.post("/login", json={"email": "cy@example.com", "password": "nope nope nope"})
    locked = client.post("/login", json={"email": "cy@example.com", "password": "correct horse battery"})
    assert locked.status_code == 429
    assert locked.headers["retry-after"] == "900"
    clock[0] += 15 * 60
    assert client.post("/login", json={"email": "cy@example.com", "password": "correct horse battery"}).status_code == 200


def test_an_old_weaker_hash_is_upgraded_at_the_next_sign_in():
    users["di@example.com"] = hash_password("correct horse battery", PasswordHasher(memory_cost=512, time_cost=1, parallelism=1))
    assert client.post("/login", json={"email": "di@example.com", "password": "correct horse battery"}).status_code == 200
    assert users["di@example.com"].startswith("$argon2id$v=19$m=1024,t=1,p=1$")
