import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app import create_app

MINUTE = 60
DAY = 24 * 60 * MINUTE
# PyJWT checks exp and iat against the system clock, so the fake clock starts at the real time each test. To expire
# an access token, a test signs in on a clock set in the past; the refresh-token checks follow the fake clock alone.
clock = [time.time()]
client = TestClient(create_app(now=lambda: clock[0]))


@pytest.fixture(autouse=True)
def reset_clock():
    clock[0] = time.time()


@dataclass
class Tokens:
    status: int
    access: str
    refresh: str
    set_cookie: str
    body: dict


def call(path: str, refresh: str | None = None, access: str | None = None, via: TestClient = client) -> Tokens:
    """Sends the refresh cookie by hand, the way a browser would (the test client never sends a Secure cookie over http)."""
    headers = {}
    if refresh is not None:
        headers["Cookie"] = f"refresh_token={refresh}"
    if access:
        headers["Authorization"] = f"Bearer {access}"
    body = {"email": "ada@example.com", "password": "correct horse battery"} if path == "/auth/login" else None
    r = via.post(path, headers=headers, json=body)
    set_cookie = r.headers.get("set-cookie", "")
    json = {} if r.status_code == 204 else r.json()
    match = re.search(r"refresh_token=([^;]*)", set_cookie)
    return Tokens(r.status_code, json.get("access_token", ""), match.group(1) if match else "", set_cookie, json)


def login() -> Tokens:
    return call("/auth/login")


def refresh(token: str) -> Tokens:
    return call("/auth/refresh", token)


def me(access: str):
    return client.get("/me", headers={"Authorization": f"Bearer {access}"})


def test_login_returns_a_10_minute_access_token_and_sets_the_refresh_cookie():
    r = client.post("/auth/login", json={"email": "ada@example.com", "password": "correct horse battery"})
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    assert list(r.json()) == ["access_token", "token_type", "expires_in"]  # no refresh token in the body
    assert r.json()["expires_in"] == 600
    cookie = r.headers["set-cookie"].lower()
    for part in ["httponly", "secure", "samesite=strict", "path=/auth", "max-age=604800"]:
        assert part in cookie, f"cookie has {part}"
    assert me(r.json()["access_token"]).status_code == 200


def test_refresh_rotates_a_new_refresh_token_and_a_new_access_token_every_time():
    first = login()
    second = refresh(first.refresh)
    assert second.status == 200
    assert second.refresh != first.refresh
    assert second.access != first.access
    third = refresh(second.refresh)
    assert third.status == 200
    assert third.refresh != second.refresh
    assert me(third.access).json() == {"sub": "u_1001", "email": "ada@example.com"}


def test_reusing_a_spent_refresh_token_revokes_the_whole_family():
    first = login()
    second = refresh(first.refresh)  # the user refreshes; first is now spent
    replay = refresh(first.refresh)  # someone presents first again
    assert replay.status == 401
    assert replay.body == {"error": "Refresh token reuse detected. Sign in again."}
    assert re.search(r'refresh_token=(""|);', replay.set_cookie)  # the cookie is cleared
    following = refresh(second.refresh)  # the newest token died with its family
    assert following.status == 401
    assert following.body == {"error": "Invalid refresh token."}


def test_parallel_refreshes_with_one_token_let_exactly_one_win_and_the_rest_count_as_reuse():
    # FastAPI runs these endpoints on a thread pool. A clock that takes 5 ms widens the gap between "is it spent?" and
    # "spend it", so without the store's lock several of these requests would succeed.
    def slow_clock() -> float:
        time.sleep(0.005)
        return time.time()

    racing = TestClient(create_app(now=slow_clock))
    first = call("/auth/login", via=racing)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: call("/auth/refresh", first.refresh, via=racing), range(8)))
    winners = [r for r in results if r.status == 200]
    assert len(winners) == 1
    assert {"error": "Refresh token reuse detected. Sign in again."} in [r.body for r in results]
    assert call("/auth/refresh", winners[0].refresh, via=racing).status == 401  # the family was revoked


def test_an_expired_access_token_is_refused_and_refresh_gets_a_new_one():
    clock[0] = time.time() - 11 * MINUTE  # signed in 11 minutes ago
    signed_in = login()
    expired = me(signed_in.access)
    assert expired.status_code == 401
    assert expired.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    clock[0] += 11 * MINUTE  # now
    renewed = refresh(signed_in.refresh)
    assert renewed.status == 200
    assert me(renewed.access).status_code == 200


def test_a_refresh_token_unused_for_7_days_expires():
    first = login()
    clock[0] += 7 * DAY - MINUTE
    second = refresh(first.refresh)  # still inside its 7 days
    assert second.status == 200
    clock[0] += 7 * DAY
    late = refresh(second.refresh)
    assert late.status == 401
    assert late.body == {"error": "Refresh token expired. Sign in again."}


def test_the_family_ends_30_days_after_sign_in_however_often_it_refreshes():
    current = login().refresh
    for _ in range(4):  # days 6, 12, 18 and 24
        clock[0] += 6 * DAY
        current = refresh(current).refresh
    clock[0] += 5 * DAY  # day 29
    last_day = refresh(current)
    assert last_day.status == 200
    assert "max-age=86400" in last_day.set_cookie.lower()  # one day left, not seven
    clock[0] += DAY  # day 30
    ended = refresh(last_day.refresh)
    assert ended.status == 401
    assert ended.body == {"error": "Refresh token expired. Sign in again."}


def test_logout_revokes_the_family_and_clears_the_cookie():
    signed_in = login()
    out = call("/auth/logout", signed_in.refresh)
    assert out.status == 204
    assert re.search(r'refresh_token=(""|);', out.set_cookie)
    assert re.search(r"max-age=0|1970", out.set_cookie, re.I)  # Max-Age=0 or a past expiry deletes the cookie
    after = refresh(signed_in.refresh)
    assert after.status == 401
    assert after.body == {"error": "Invalid refresh token."}


def test_an_access_token_outlives_logout_unless_its_jti_is_deny_listed():
    a = login()
    call("/auth/logout", a.refresh)  # cookie only
    assert me(a.access).status_code == 200, "a JWT stays valid until it expires"

    b = login()
    call("/auth/logout", b.refresh, b.access)  # cookie and access token
    assert me(b.access).status_code == 401


def test_two_sign_ins_are_separate_families_signing_out_of_one_keeps_the_other():
    laptop = login()
    phone = login()
    call("/auth/logout", laptop.refresh)
    assert refresh(phone.refresh).status == 200
    assert refresh(laptop.refresh).status == 401


def test_a_missing_or_made_up_refresh_token_is_rejected():
    missing = call("/auth/refresh")
    assert missing.status == 401
    assert missing.body == {"error": "Missing refresh token."}
    made_up = refresh("bm90LWEtcmVhbC10b2tlbi1qdXN0LXNvbWUtYnl0ZXM")
    assert made_up.status == 401
    assert made_up.body == {"error": "Invalid refresh token."}
