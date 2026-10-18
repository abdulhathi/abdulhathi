import re

from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app import create_app

FAST = PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)
MINUTE = 60
clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC
client = TestClient(create_app(hasher=FAST, now=lambda: clock[0]), base_url="https://testserver")
ADA = {"email": "ada@example.com", "password": "correct horse battery"}
BO = {"email": "bo@example.com", "password": "purple monkey dishwasher"}


def call(method: str, path: str, sid: str | None = None, json: dict | None = None, csrf: str | None = None):
    client.cookies.clear()  # each call sends exactly the cookie the test chooses
    headers = {}
    if sid:
        headers["Cookie"] = f"sid={sid}"
    if csrf:
        headers["X-CSRF-Token"] = csrf
    return client.request(method, path, headers=headers, json=json)


def sid_cookie(r) -> str | None:
    return next((c for c in r.headers.get_list("set-cookie") if c.startswith("sid=")), None)


def sid_from(r) -> str:
    return sid_cookie(r).split(";")[0].removeprefix("sid=")


def sign_in(creds: dict = ADA, sid: str | None = None) -> str:
    r = call("POST", "/login", sid=sid, json=creds)
    assert r.status_code == 200
    return sid_from(r)


def csrf_for(sid: str) -> str:
    return call("GET", "/csrf", sid=sid).json()["csrfToken"]


def test_signing_in_sets_an_httponly_secure_samesite_lax_session_cookie():
    r = call("POST", "/login", json=ADA)
    assert r.status_code == 200
    assert r.json() == {"email": "ada@example.com", "message": "Signed in."}
    cookie = sid_cookie(r)
    for flag in (r"; path=/", r"; httponly", r"; secure", r"; samesite=lax", r"; (expires|max-age)="):
        assert re.search(flag, cookie, re.IGNORECASE), flag
    assert call("GET", "/me", sid=sid_from(r)).json() == {"email": "ada@example.com"}


def test_a_wrong_password_gets_401_no_session_cookie_and_leaves_the_current_session_alone():
    wrong = {"email": "ada@example.com", "password": "wrong horse battery"}
    r = call("POST", "/login", json=wrong)
    assert r.status_code == 401
    assert r.json() == {"error": "Email or password is incorrect."}
    assert sid_cookie(r) is None
    sid = sign_in()
    call("POST", "/login", sid=sid, json=wrong)  # a failed sign-in does not sign anyone out
    assert call("GET", "/me", sid=sid).status_code == 200


def test_without_a_valid_session_me_and_notes_answer_401():
    none = call("GET", "/me")
    assert none.status_code == 401
    assert none.json() == {"error": "Sign in first."}
    assert call("GET", "/me", sid="made-up-session-id").status_code == 401
    # No session is 401 even when the CSRF token is missing too: the session is checked first.
    assert call("POST", "/notes", json={"text": "buy milk"}).status_code == 401


def test_signing_in_issues_a_new_session_id_so_a_planted_one_is_worthless():
    planted = sign_in(BO)  # the attacker's own session
    fresh = sign_in(ADA, sid=planted)  # the victim signs in with it
    assert fresh != planted
    assert call("GET", "/me", sid=planted).status_code == 401
    assert call("GET", "/me", sid=fresh).json() == {"email": "ada@example.com"}


def test_a_state_changing_request_needs_the_csrf_token_from_csrf():
    sid = sign_in()
    missing = call("POST", "/notes", sid=sid, json={"text": "buy milk"})
    assert missing.status_code == 403
    assert missing.json() == {"error": "Missing or invalid CSRF token."}
    assert call("POST", "/notes", sid=sid, json={"text": "buy milk"}, csrf="guess").status_code == 403
    ok = call("POST", "/notes", sid=sid, json={"text": "buy milk"}, csrf=csrf_for(sid))
    assert ok.status_code == 201
    assert ok.json() == {"notes": ["buy milk"]}
    # Signing out changes state too: a forged sign-out without the token is refused.
    assert call("POST", "/logout", sid=sid).status_code == 403
    assert call("GET", "/me", sid=sid).status_code == 200


def test_a_csrf_token_from_another_session_is_rejected():
    ada = sign_in(ADA)
    bo = sign_in(BO)
    assert call("POST", "/notes", sid=ada, json={"text": "hi"}, csrf=csrf_for(bo)).status_code == 403


def test_signing_out_destroys_the_session_on_the_server_so_the_old_cookie_stops_working():
    sid = sign_in()
    out = call("POST", "/logout", sid=sid, csrf=csrf_for(sid))
    assert out.status_code == 200
    assert out.json() == {"message": "Signed out."}
    assert re.match(r'sid=("")?;.*(max-age=0|expires=Thu, 01 Jan 1970)', sid_cookie(out), re.IGNORECASE)  # "delete it"
    assert call("GET", "/me", sid=sid).status_code == 401  # replaying the copied cookie


def test_an_idle_session_expires_after_30_minutes():
    sid = sign_in()
    clock[0] += 31 * MINUTE
    assert call("GET", "/me", sid=sid).status_code == 401


def test_activity_keeps_a_session_alive_but_never_past_8_hours():
    sid = sign_in()
    for _ in range(23):
        clock[0] += 20 * MINUTE  # 7 h 40 min in total
        assert call("GET", "/me", sid=sid).status_code == 200
    clock[0] += 25 * MINUTE  # 8 h 5 min after sign-in
    assert call("GET", "/me", sid=sid).status_code == 401
