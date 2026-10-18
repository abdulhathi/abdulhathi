import base64

from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from app import create_app

CHALLENGE = 'Basic realm="Auth Lab", charset="UTF-8"'
client = TestClient(create_app(hasher=PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)))  # a cheap cost


def basic(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def get(path: str, authorization: str | None = None):
    return client.get(path, headers={"Authorization": authorization} if authorization else {})


def test_a_request_without_credentials_gets_a_401_challenge():
    r = get("/me")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == CHALLENGE
    assert r.json() == {"error": "Authentication required."}


def test_the_right_username_and_password_are_let_in_with_no_session_cookie():
    r = get("/me", basic("ada", "correct horse battery"))
    assert r.status_code == 200
    assert r.json() == {"username": "ada"}
    assert "set-cookie" not in r.headers  # nothing is remembered: the next request sends the password again


def test_a_wrong_password_and_an_unknown_user_get_the_same_answer():
    for r in (get("/me", basic("ada", "wrong horse battery")), get("/me", basic("nobody", "wrong horse battery"))):
        assert r.status_code == 401
        assert r.headers["www-authenticate"] == CHALLENGE
        assert r.json() == {"error": "Username or password is incorrect."}


def test_a_password_may_contain_colons_only_the_first_colon_splits():
    assert get("/me", basic("ci-bot", "s3cret:with:colons")).json() == {"username": "ci-bot"}


def test_names_and_passwords_are_read_as_utf8():
    r = get("/me", basic("zoë", "grüße aus Köln"))
    assert r.status_code == 200
    assert r.json() == {"username": "zoë"}


def test_both_unicode_spellings_of_a_letter_are_accepted():
    # "ë" as one code point (what users.py stores) or as "e" plus a combining mark: normalized to NFC, they match.
    r = get("/me", basic("zoe\u0308", "gru\u0308\u00dfe aus Ko\u0308ln"))
    assert r.status_code == 200
    assert r.json() == {"username": "zoë"}


def test_a_malformed_header_is_rejected_and_another_scheme_counts_as_no_credentials():
    malformed = (
        "Basic !!!not-base64",
        "Basic " + base64.b64encode(b"no-colon").decode(),
        "Basic " + base64.b64encode("zo\u00eb:gr\u00fc\u00dfe aus K\u00f6ln".encode("latin-1")).decode(),  # not UTF-8
        "Basic YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ",  # base64 without its padding
        "Basic YWRhOmNv cnJlY3QgaG9yc2UgYmF0dGVyeQ==",  # a space inside the base64
    )
    for header in malformed:
        r = get("/me", header)
        assert r.status_code == 401, header
        assert r.headers["www-authenticate"] == CHALLENGE
        assert r.json() == {"error": "Username or password is incorrect."}
    bearer = get("/me", "Bearer abc")
    assert bearer.status_code == 401
    assert bearer.json() == {"error": "Authentication required."}


def test_the_scheme_name_is_case_insensitive():
    assert get("/me", basic("ada", "correct horse battery").replace("Basic", "basic")).status_code == 200


def test_a_public_route_needs_no_credentials():
    r = get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
