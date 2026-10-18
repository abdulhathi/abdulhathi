import base64
import hashlib
import hmac
import json
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient

from app import create_app
from keys import SigningKey, new_signing_key
from tokens import AUDIENCE, ISSUER

# PyJWT checks exp, nbf and iat against the system clock, so these tests move the issuer's clock instead:
# a token issued 640 seconds ago is the same as checking a fresh token 640 seconds from now.
clock = [time.time()]
app = create_app(now=lambda: clock[0])
client = TestClient(app)
ring = app.state.ring


@pytest.fixture(autouse=True)
def reset_clock():
    clock[0] = time.time()


def login() -> str:
    r = client.post("/login", json={"email": "ada@example.com", "password": "correct horse battery"})
    return r.json()["access_token"]


def me(token: str):
    return client.get("/me", headers={"Authorization": f"Bearer {token}"})


def good_claims() -> dict:
    """Claims that pass every check; each test changes one thing."""
    t = int(time.time())
    return {"iss": ISSUER, "sub": "u_1001", "aud": AUDIENCE, "email": "ada@example.com",
            "iat": t, "nbf": t, "exp": t + 600, "jti": str(uuid.uuid4())}


def sign(claims: dict, key: SigningKey | None = None) -> str:
    key = key or ring.current
    return jwt.encode(claims, key.private_key, algorithm="RS256", headers={"kid": key.kid})


def b64(value) -> str:
    return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()


def forge(header: dict, claims: dict, signature=lambda signing_input: "") -> str:
    """Builds a token by hand, the way an attacker would."""
    signing_input = f"{b64(header)}.{b64(claims)}"
    return f"{signing_input}.{signature(signing_input)}"


def test_sign_in_then_call_me_with_the_bearer_token():
    signed_in = client.post("/login", json={"email": "ada@example.com", "password": "correct horse battery"})
    assert signed_in.headers["cache-control"] == "no-store"
    assert signed_in.json()["token_type"] == "Bearer"
    assert signed_in.json()["expires_in"] == 600
    r = me(signed_in.json()["access_token"])
    assert r.status_code == 200
    assert r.json() == {"sub": "u_1001", "email": "ada@example.com"}


def test_a_wrong_or_missing_password_gets_401_and_no_token():
    for body in [{"email": "ada@example.com", "password": "wrong horse battery"}, {"email": "ada@example.com"}, {}]:
        r = client.post("/login", json=body)
        assert r.status_code == 401
        assert r.json() == {"error": "Email or password is incorrect."}


def test_no_token_or_another_scheme_gets_401_and_www_authenticate_bearer():
    for headers in [{}, {"Authorization": "Basic YWRhOnNlY3JldA=="}]:
        r = client.get("/me", headers=headers)
        assert r.status_code == 401
        assert r.headers["www-authenticate"] == "Bearer"
        assert r.json() == {"error": "Missing bearer token."}


def test_expiry_and_not_before_are_checked_with_30_seconds_of_clock_skew():
    clock[0] = time.time() - 620  # expired 20 s ago: inside the skew
    assert me(login()).status_code == 200
    clock[0] = time.time() - 640  # expired 40 s ago
    expired = me(login())
    assert expired.status_code == 401
    assert expired.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert expired.json() == {"error": "Invalid or expired token."}
    t = int(time.time())
    assert me(sign({**good_claims(), "nbf": t + 20})).status_code == 200
    assert me(sign({**good_claims(), "nbf": t + 60})).status_code == 401


def test_a_token_for_another_audience_is_rejected():
    assert me(sign({**good_claims(), "aud": "https://other-api.example.com"})).status_code == 401


def test_a_token_from_another_issuer_is_rejected():
    assert me(sign({**good_claims(), "iss": "https://evil.example.com"})).status_code == 401


def test_a_token_missing_a_required_claim_is_rejected():
    for name in ["exp", "sub", "jti"]:
        claims = good_claims()
        del claims[name]
        assert me(sign(claims)).status_code == 401, f"without {name}"


def test_changing_the_payload_breaks_the_signature():
    header, _, signature = login().split(".")
    tampered = f"{header}.{b64({**good_claims(), 'sub': 'u_1002'})}.{signature}"
    assert me(tampered).status_code == 401


def test_alg_none_is_rejected():
    # It even names one of our keys; the algorithm allowlist refuses it before any key is used.
    assert me(forge({"alg": "none", "typ": "JWT", "kid": ring.current.kid}, good_claims())).status_code == 401


def test_hs256_signed_with_the_public_key_algorithm_confusion_is_rejected():
    # The attacker knows the public key (it is published) and uses it as an HMAC secret.
    public_pem = ring.current.public_key.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)

    def hmac_with_public_key(signing_input: str) -> str:
        digest = hmac.new(public_pem, signing_input.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()

    token = forge({"alg": "HS256", "typ": "JWT", "kid": ring.current.kid}, good_claims(), hmac_with_public_key)
    assert me(token).status_code == 401


def test_a_token_signed_with_an_unknown_key_kid_is_rejected():
    stranger = new_signing_key()  # a valid RS256 key, but not one of ours
    assert me(sign(good_claims(), stranger)).status_code == 401


def test_a_token_that_points_to_its_own_key_set_jku_is_rejected():
    # The attacker signs with their own key, names our kid, and says where to fetch "their" keys. The verifier never
    # follows jku: it checks the signature with our key for that kid, and the signature does not match.
    stranger = new_signing_key()
    headers = {"kid": ring.current.kid, "jku": "https://evil.example.com/jwks.json"}
    token = jwt.encode(good_claims(), stranger.private_key, algorithm="RS256", headers=headers)
    assert me(token).status_code == 401


def test_rotation_old_tokens_keep_working_until_their_key_is_retired():
    old_token = login()
    old_kid = ring.current.kid
    ring.rotate()
    new_token = login()
    assert jwt.get_unverified_header(new_token)["kid"] != old_kid
    jwks = client.get("/.well-known/jwks.json").json()
    assert [k["kid"] for k in jwks["keys"]] == [old_kid, ring.current.kid]
    assert me(old_token).status_code == 200
    assert me(new_token).status_code == 200

    ring.retire(old_kid)  # after the old key's last token has expired
    assert me(old_token).status_code == 401
    assert me(new_token).status_code == 200


def test_another_api_can_verify_a_token_with_only_the_published_jwks():
    token = login()
    jwks = jwt.PyJWKSet.from_dict(client.get("/.well-known/jwks.json").json())
    key = jwks[jwt.get_unverified_header(token)["kid"]]
    claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER, audience=AUDIENCE)
    assert claims["sub"] == "u_1001"
