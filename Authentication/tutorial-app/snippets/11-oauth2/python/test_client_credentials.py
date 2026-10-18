import base64

import pytest

from client import OAuthError, client_credentials
from harness import SERVER, Lab, bearer


def test_client_credentials_a_service_gets_a_token_for_its_own_scope():
    lab = Lab()
    tokens = client_credentials(lab.http, SERVER, "report-job", "report-job-secret", "reports.read")
    assert tokens["scope"] == "reports.read"
    api = lab.http.get("/api/reports", headers=bearer(tokens["access_token"]))
    assert api.status_code == 200
    assert api.json() == {"client": "report-job", "reports": ["daily-sales.csv"]}


def test_client_credentials_a_wrong_secret_a_broken_basic_header_a_scope_it_was_not_given_or_a_public_client_is_refused():
    lab = Lab()
    wrong = lab.http.post("/token", data={"grant_type": "client_credentials", "client_id": "report-job", "client_secret": "wrong-secret"})
    assert wrong.status_code == 401
    assert wrong.headers["www-authenticate"] == 'Basic realm="token"'
    assert wrong.json() == {"error": "invalid_client", "error_description": "Client authentication failed."}

    # "report-job:%zz" is not valid form encoding: an error answer, not a crash.
    broken = lab.http.post("/token", headers={"Authorization": f"Basic {base64.b64encode(b'report-job:%zz').decode()}"},
                           data={"grant_type": "client_credentials"})
    assert broken.status_code == 401
    assert broken.json()["error"] == "invalid_client"

    with pytest.raises(OAuthError) as e:
        client_credentials(lab.http, SERVER, "report-job", "report-job-secret", "photos.read")
    assert e.value.error == "invalid_scope"

    # photo-app is public: it has no secret, so it may not get tokens as itself.
    public = lab.http.post("/token", data={"grant_type": "client_credentials", "client_id": "photo-app"})
    assert public.status_code == 400
    assert public.json()["error"] == "unauthorized_client"


def test_the_password_grant_is_not_supported():
    lab = Lab()
    res = lab.http.post("/token", data={"grant_type": "password", "client_id": "photo-app",
                                        "username": "ada@example.com", "password": "correct horse battery"})
    assert res.status_code == 400
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {"error": "unsupported_grant_type", "error_description": "Use authorization_code or client_credentials."}
