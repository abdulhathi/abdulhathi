import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from client import client_credentials
from harness import ISSUER, SERVER, Lab, bearer


def test_the_resource_server_refuses_a_missing_forged_or_expired_token():
    lab = Lab()
    missing = lab.http.get("/api/reports")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"

    # Every claim is right, but it is signed with the attacker's own key.
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    iat = int(lab.clock)
    forged = jwt.encode(
        {"iss": ISSUER, "sub": "report-job", "aud": "photo-api", "client_id": "report-job", "scope": "reports.read",
         "iat": iat, "exp": iat + 600},
        attacker_key, algorithm="RS256", headers={"typ": "at+jwt"},
    )
    bad = lab.http.get("/api/reports", headers=bearer(forged))
    assert bad.status_code == 401
    assert bad.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert bad.json() == {"error": "invalid_token", "error_description": "The access token is invalid or expired."}

    token = client_credentials(lab.http, SERVER, "report-job", "report-job-secret", "reports.read")["access_token"]
    assert lab.http.get("/api/reports", headers=bearer(token)).status_code == 200
    lab.advance(601)  # the token lives 600 seconds
    assert lab.http.get("/api/reports", headers=bearer(token)).status_code == 401


def test_the_resource_server_refuses_a_token_for_another_api_of_another_type_or_from_another_issuer():
    # This time the test holds the authorization server's real key, so only the claim under test is wrong.
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    lab = Lab(signing_key=key)
    iat = int(lab.clock)

    def sign(aud="photo-api", typ="at+jwt", iss=ISSUER) -> str:
        claims = {"iss": iss, "sub": "report-job", "aud": aud, "client_id": "report-job", "scope": "reports.read",
                  "iat": iat, "exp": iat + 600, "jti": "test-token"}
        return jwt.encode(claims, key, algorithm="RS256", headers={"typ": typ})

    assert lab.http.get("/api/reports", headers=bearer(sign())).status_code == 200  # all claims right
    for wrong in ({"aud": "billing-api"}, {"typ": "JWT"}, {"iss": "https://evil.example.com"}):
        res = lab.http.get("/api/reports", headers=bearer(sign(**wrong)))
        assert res.status_code == 401, wrong
        assert res.headers["www-authenticate"] == 'Bearer error="invalid_token"'


def test_the_resource_server_refuses_a_token_without_the_needed_scope():
    lab = Lab()
    token = client_credentials(lab.http, SERVER, "report-job", "report-job-secret", "reports.read")["access_token"]
    res = lab.http.get("/api/photos", headers=bearer(token))
    assert res.status_code == 403
    assert res.headers["www-authenticate"] == 'Bearer error="insufficient_scope", scope="photos.read"'
    assert res.json() == {"error": "insufficient_scope", "error_description": "This call needs the photos.read scope."}
