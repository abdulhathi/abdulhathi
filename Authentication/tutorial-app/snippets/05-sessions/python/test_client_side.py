import base64
import json

from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from client_side import create_client_side_app

client = TestClient(create_client_side_app(hasher=PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)), base_url="https://testserver")


def send(method: str, path: str, cookie: str | None = None, body: dict | None = None):
    client.cookies.clear()
    return client.request(method, path, headers={"Cookie": f"session={cookie}"} if cookie else {}, json=body)


def sign_in() -> str:
    r = send("POST", "/login", body={"email": "ada@example.com", "password": "correct horse battery"})
    return r.headers["set-cookie"].split(";")[0].removeprefix("session=")


def test_a_client_side_cookie_can_be_read_by_anyone_but_not_changed_without_the_key():
    cookie = sign_in()
    payload, timestamp, signature = cookie.split(".")  # base64 JSON, then the itsdangerous timestamp and signature
    assert json.loads(base64.b64decode(payload)) == {"email": "ada@example.com"}
    assert send("GET", "/me", cookie).status_code == 200
    forged = base64.b64encode(b'{"email": "bo@example.com"}').decode() + f".{timestamp}.{signature}"
    assert send("GET", "/me", forged).status_code == 401


def test_a_client_side_session_cookie_still_works_after_sign_out():
    cookie = sign_in()
    assert send("POST", "/logout", cookie).status_code == 200
    replay = send("GET", "/me", cookie)  # a copy taken before sign-out
    assert replay.status_code == 200
    assert replay.json() == {"email": "ada@example.com"}
