import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pyotp
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app import create_app
from secret_box import SecretBox

FAST = PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)
KEY = os.urandom(32)
PASSWORD = "correct horse battery"
clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC: a fake clock the tests move forward
app = create_app(KEY, now=lambda: clock[0], hasher=FAST)
client = TestClient(app)
users = app.state.users


def phone(secret: str) -> str:
    """pyotp plays the authenticator app on the user's phone."""
    return pyotp.TOTP(secret).at(datetime.fromtimestamp(clock[0], UTC))


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def sign_up_and_in(email: str) -> str:
    client.post("/signup", json={"email": email, "password": PASSWORD})
    return client.post("/login", json={"email": email, "password": PASSWORD}).json()["token"]


def enrol(email: str) -> tuple[str, list[str]]:
    """Signs up, turns MFA on, and returns the secret and recovery codes."""
    token = sign_up_and_in(email)
    secret = client.post("/mfa/setup", headers=bearer(token)).json()["secret"]
    codes = client.post("/mfa/confirm", json={"code": phone(secret)}, headers=bearer(token)).json()["recoveryCodes"]
    return secret, codes


def pending_for(email: str) -> str:
    return client.post("/login", json={"email": email, "password": PASSWORD}).json()["pendingToken"]


def test_without_mfa_the_password_alone_signs_you_in():
    token = sign_up_and_in("ada@example.com")
    assert client.get("/me", headers=bearer(token)).json() == {"email": "ada@example.com", "mfa": False}
    assert client.post("/login", json={"email": "ada@example.com", "password": "wrong horse battery"}).status_code == 401


def test_mfa_set_up_needs_a_session():
    r = client.post("/mfa/setup")
    assert r.status_code == 401
    assert r.json() == {"error": "Sign in first."}


def test_set_up_returns_a_secret_and_its_otpauth_uri_and_a_wrong_first_code_does_not_turn_mfa_on():
    token = sign_up_and_in("bo@example.com")
    setup = client.post("/mfa/setup", headers=bearer(token)).json()
    assert len(setup["secret"]) == 32 and set(setup["secret"]) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    assert setup["otpauthUri"] == (
        f"otpauth://totp/Auth%20Lab:bo%40example.com?secret={setup['secret']}"
        "&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30"
    )
    wrong = client.post("/mfa/confirm", json={"code": "000000"}, headers=bearer(token))
    assert wrong.status_code == 400
    assert wrong.json() == {"error": "That code is not valid."}
    assert "mfaRequired" not in client.post("/login", json={"email": "bo@example.com", "password": PASSWORD}).json()


def test_confirming_with_a_valid_code_turns_mfa_on_and_returns_10_recovery_codes():
    _, codes = enrol("cy@example.com")
    assert len(codes) == 10
    body = client.post("/login", json={"email": "cy@example.com", "password": PASSWORD}).json()
    assert body["mfaRequired"] is True
    assert "token" not in body, "the password alone no longer gives a session"


def test_with_mfa_on_sign_in_needs_the_password_and_then_a_code():
    secret, _ = enrol("di@example.com")
    clock[0] += 30  # the next 30-second step: the confirming code is used up
    r = client.post("/login/mfa", json={"pendingToken": pending_for("di@example.com"), "code": phone(secret)})
    assert r.status_code == 200
    assert client.get("/me", headers=bearer(r.json()["token"])).json() == {"email": "di@example.com", "mfa": True}


def test_a_code_cannot_be_used_twice_not_the_confirming_code_not_a_sign_in_code():
    secret, _ = enrol("ed@example.com")
    replay = client.post("/login/mfa", json={"pendingToken": pending_for("ed@example.com"), "code": phone(secret)})
    assert replay.status_code == 401
    clock[0] += 30
    code = phone(secret)
    assert client.post("/login/mfa", json={"pendingToken": pending_for("ed@example.com"), "code": code}).status_code == 200
    assert client.post("/login/mfa", json={"pendingToken": pending_for("ed@example.com"), "code": code}).status_code == 401


def test_a_recovery_code_works_once():
    _, codes = enrol("fay@example.com")
    first = client.post("/login/mfa", json={"pendingToken": pending_for("fay@example.com"), "code": codes[0]})
    assert first.status_code == 200
    assert first.json()["recoveryCodesLeft"] == 9
    again = client.post("/login/mfa", json={"pendingToken": pending_for("fay@example.com"), "code": codes[0]})
    assert again.status_code == 401


def test_the_pending_sign_in_expires_after_5_minutes():
    secret, _ = enrol("gus@example.com")
    pending_token = pending_for("gus@example.com")
    clock[0] += 5 * 60
    r = client.post("/login/mfa", json={"pendingToken": pending_token, "code": phone(secret)})
    assert r.status_code == 401
    assert r.json() == {"error": "Sign in again."}


def test_five_wrong_codes_lock_code_entry_for_15_minutes():
    secret, _ = enrol("hal@example.com")
    pending_token = pending_for("hal@example.com")
    for _ in range(5):
        assert client.post("/login/mfa", json={"pendingToken": pending_token, "code": "000000"}).status_code == 401
    clock[0] += 30
    locked = client.post("/login/mfa", json={"pendingToken": pending_token, "code": phone(secret)})
    assert locked.status_code == 429
    assert locked.headers["retry-after"] == "870"
    clock[0] += 15 * 60
    r = client.post("/login/mfa", json={"pendingToken": pending_for("hal@example.com"), "code": phone(secret)})
    assert r.status_code == 200


def test_a_pending_token_is_not_a_session_and_it_works_only_once():
    secret, _ = enrol("jo@example.com")
    pending_token = pending_for("jo@example.com")
    assert client.get("/me", headers=bearer(pending_token)).status_code == 401
    clock[0] += 30
    assert client.post("/login/mfa", json={"pendingToken": pending_token, "code": phone(secret)}).status_code == 200
    clock[0] += 30
    again = client.post("/login/mfa", json={"pendingToken": pending_token, "code": phone(secret)})  # a fresh, valid code
    assert again.status_code == 401
    assert again.json() == {"error": "Sign in again."}


def test_wrong_recovery_codes_count_too_and_signing_in_again_does_not_reset_the_count():
    secret, _ = enrol("kim@example.com")
    for _ in range(3):
        assert client.post("/login/mfa", json={"pendingToken": pending_for("kim@example.com"), "code": "000000"}).status_code == 401
    pending_token = pending_for("kim@example.com")
    for _ in range(2):
        assert client.post("/login/mfa", json={"pendingToken": pending_token, "code": "aaaaa-aaaaa"}).status_code == 401
    clock[0] += 30
    r = client.post("/login/mfa", json={"pendingToken": pending_for("kim@example.com"), "code": phone(secret)})
    assert r.status_code == 429


# Requests sent at the same moment: each check-then-update must run as one, or a code could be spent twice.
def at_once(bodies: list[dict]) -> list[int]:
    with ThreadPoolExecutor(len(bodies)) as pool:
        return sorted(pool.map(lambda body: client.post("/login/mfa", json=body).status_code, bodies))


def test_the_same_code_sent_several_times_at_once_works_only_once():
    secret, codes = enrol("lu@example.com")
    clock[0] += 30
    code = phone(secret)
    assert at_once([{"pendingToken": pending_for("lu@example.com"), "code": code} for _ in range(3)]) == [200, 401, 401]
    assert at_once([{"pendingToken": pending_for("lu@example.com"), "code": codes[0]} for _ in range(3)]) == [200, 401, 401]


def test_a_pending_token_works_once_even_for_two_requests_at_once():
    secret, codes = enrol("max@example.com")
    clock[0] += 30
    pending_token = pending_for("max@example.com")
    both = at_once([{"pendingToken": pending_token, "code": codes[0]}, {"pendingToken": pending_token, "code": phone(secret)}])
    assert both == [200, 401]


def test_wrong_codes_sent_at_once_still_lock_code_entry_after_five():
    enrol("ned@example.com")
    pending_token = pending_for("ned@example.com")
    assert at_once([{"pendingToken": pending_token, "code": "aaaaa-aaaaa"}] * 8) == [401] * 5 + [429] * 3


def test_the_totp_secret_is_stored_encrypted():
    secret, _ = enrol("ivy@example.com")
    stored = users["ivy@example.com"]
    assert stored.totp_secret.startswith("v1.")
    assert secret not in repr(stored)
    opened = SecretBox(KEY).open(stored.totp_secret, "ivy@example.com")  # only with the key
    assert opened == pyotp.TOTP(secret).byte_secret()
