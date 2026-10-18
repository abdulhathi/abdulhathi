import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import astuple
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import create_app
from magic_links import sha256

BAD_LINK = {"error": "This link is not valid or has expired. Ask for a new one."}
BAD_CODE = {"error": "That code is not valid or has expired."}


class Clock:
    """A fake clock the tests move forward."""

    def __init__(self) -> None:
        self.now = 1_792_238_400.0  # 2026-10-17 12:00 UTC

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def lab():
    """A fresh app with its own fake clock and outbox. The TestClient keeps cookies, like a browser."""
    clock = Clock()
    app = create_app(users={"ada@example.com"}, now=clock)
    return SimpleNamespace(app=app, client=TestClient(app), clock=clock, links=app.state.links, outbox=app.state.outbox)


def ask(lab, email: str):
    return lab.client.post("/auth/email", json={"email": email})


def inbox(lab, email: str) -> tuple[str, str]:
    """The link token and code from the newest email to this address."""
    text = lab.outbox.last(email).text
    return re.search(r"token=([\w-]+)", text)[1], re.search(r"code: (\d{6})", text)[1]


def test_the_emailed_link_signs_you_in_once(lab):
    assert ask(lab, "ada@example.com").status_code == 202
    token, _ = inbox(lab, "ada@example.com")
    signed_in = lab.client.get(f"/auth/verify?token={token}")
    assert signed_in.status_code == 200
    assert signed_in.json() == {"email": "ada@example.com", "message": "Signed in."}
    assert lab.client.get("/me").json() == {"email": "ada@example.com"}
    again = lab.client.get(f"/auth/verify?token={token}")
    assert again.status_code == 400
    assert again.json() == BAD_LINK


def test_an_expired_link_or_code_fails(lab):
    ask(lab, "ada@example.com")
    token, code = inbox(lab, "ada@example.com")
    lab.clock.now += 15 * 60
    r = lab.client.get(f"/auth/verify?token={token}")
    assert r.status_code == 400
    assert r.json() == BAD_LINK
    assert lab.client.post("/auth/code", json={"email": "ada@example.com", "code": code}).status_code == 401


def test_the_same_link_used_twice_at_once_signs_in_only_once(lab):
    ask(lab, "ada@example.com")
    token, _ = inbox(lab, "ada@example.com")
    with ThreadPoolExecutor(10) as pool:  # FastAPI runs these endpoints on a thread pool, so they really overlap
        statuses = list(pool.map(lambda _: lab.client.post("/auth/verify", data={"token": token}).status_code, range(10)))
    assert sorted(statuses) == [200] + [400] * 9


def test_the_link_starts_with_the_configured_base_url_whatever_the_host_header_says(lab):
    r = lab.client.post("/auth/email", json={"email": "ada@example.com"}, headers={"Host": "evil.example"})
    assert r.status_code == 202
    text = lab.outbox.last("ada@example.com").text
    assert re.search(r"^http://localhost:3000/auth/verify\?token=", text, re.MULTILINE)
    assert "evil.example" not in text


def test_an_unknown_email_gets_the_same_answer_and_no_email_is_sent(lab):
    known = ask(lab, "ada@example.com")
    unknown = ask(lab, "nobody@example.com")
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert "signin_browser" in known.cookies and "signin_browser" in unknown.cookies
    assert len(lab.outbox.sent) == 1
    assert lab.outbox.last("nobody@example.com") is None


def test_only_a_sha256_hash_of_the_link_token_is_stored(lab):
    ask(lab, "ada@example.com")
    token, code = inbox(lab, "ada@example.com")
    stored = lab.links.by_token[sha256(token)]
    assert stored.email == "ada@example.com"
    assert token not in repr(lab.links.by_token)
    assert code not in astuple(stored)


def test_a_link_opened_in_another_browser_shows_a_confirmation_page_and_only_the_post_uses_it(lab):
    ask(lab, "ada@example.com")
    token, _ = inbox(lab, "ada@example.com")
    other = TestClient(lab.app)  # no cookie: a link scanner, or another device
    page = other.get(f"/auth/verify?token={token}")
    assert page.status_code == 200
    assert page.headers["content-type"].startswith("text/html")
    assert page.headers["referrer-policy"] == "no-referrer"
    assert page.headers["content-security-policy"] == "frame-ancestors 'none'"
    assert '<form method="post" action="/auth/verify">' in page.text
    someone_else = TestClient(lab.app)  # a browser cookie, but not the one that asked
    someone_else.post("/auth/email", json={"email": "nobody@example.com"})
    assert "Continue signing in" in someone_else.get(f"/auth/verify?token={token}").text
    confirmed = other.post("/auth/verify", data={"token": token})
    assert confirmed.status_code == 200
    assert "session" in confirmed.cookies
    assert other.post("/auth/verify", data={"token": token}).status_code == 400


def test_asking_again_replaces_the_previous_link(lab):
    ask(lab, "ada@example.com")
    old, _ = inbox(lab, "ada@example.com")
    ask(lab, "ada@example.com")
    fresh, _ = inbox(lab, "ada@example.com")
    assert lab.client.get(f"/auth/verify?token={old}").status_code == 400
    assert lab.client.get(f"/auth/verify?token={fresh}").status_code == 200


def test_the_emailed_code_signs_you_in_once(lab):
    ask(lab, "ada@example.com")
    _, code = inbox(lab, "ada@example.com")
    r = lab.client.post("/auth/code", json={"email": "ada@example.com", "code": code})
    assert r.status_code == 200
    assert "session" in r.cookies
    assert lab.client.post("/auth/code", json={"email": "ada@example.com", "code": code}).status_code == 401


def test_a_code_posted_by_an_html_form_is_refused_so_another_site_cannot_sign_you_in(lab):
    ask(lab, "ada@example.com")
    _, code = inbox(lab, "ada@example.com")
    other = TestClient(lab.app)
    r = other.post("/auth/code", data={"email": "ada@example.com", "code": code})  # what a hostile page can send
    assert r.status_code != 200
    assert "session" not in r.cookies
    assert other.post("/auth/code", json={"email": "ada@example.com", "code": code}).status_code == 200


def test_five_wrong_codes_use_the_code_up(lab):
    ask(lab, "ada@example.com")
    _, code = inbox(lab, "ada@example.com")
    wrong = "111111" if code == "000000" else "000000"
    for _ in range(5):
        r = lab.client.post("/auth/code", json={"email": "ada@example.com", "code": wrong})
        assert r.status_code == 401
        assert r.json() == BAD_CODE
    assert lab.client.post("/auth/code", json={"email": "ada@example.com", "code": code}).status_code == 401


def test_an_email_address_can_ask_for_3_emails_in_15_minutes(lab):
    for _ in range(3):
        assert ask(lab, "ada@example.com").status_code == 202
    limited = ask(lab, "ada@example.com")
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "900"
    assert limited.json() == {"error": "Too many requests. Try again later."}
    assert len(lab.outbox.sent) == 3
    lab.clock.now += 15 * 60
    assert ask(lab, "ada@example.com").status_code == 202


def test_an_ip_address_can_ask_for_10_emails_in_15_minutes(lab):
    for i in range(10):
        assert ask(lab, f"user{i}@example.com").status_code == 202
    assert ask(lab, "user10@example.com").status_code == 429
