from dataclasses import replace
from urllib.parse import urlencode, urlsplit

import pytest

from client import AuthorizationCodeClient, OAuthError
from harness import ISSUER, SERVER, Lab, bearer, query
from pkce import new_verifier

REDIRECT = "http://localhost:4000/callback"


def photo_app(lab: Lab, redirect_uri: str = REDIRECT) -> AuthorizationCodeClient:
    return AuthorizationCodeClient(lab.http, SERVER, ISSUER, "photo-app", redirect_uri)


def authorize(lab: Lab, client: AuthorizationCodeClient):
    """Runs step 1 and returns the pending values plus the callback URL the browser was sent to."""
    pending = client.start("photos.read")
    return pending, lab.visit(pending.url)[1]


def test_the_code_flow_with_pkce_returns_a_token_that_reads_the_users_photos():
    lab = Lab()
    client = photo_app(lab)
    pending = client.start("photos.read")
    status, location = lab.visit(pending.url)
    assert status == 302
    assert location.startswith(f"{REDIRECT}?code=")
    assert query(location)["state"] == pending.state
    assert query(location)["iss"] == ISSUER

    tokens = client.finish(location, pending)
    assert tokens["token_type"] == "Bearer"
    assert tokens["expires_in"] == 600
    assert tokens["scope"] == "photos.read"
    api = lab.http.get("/api/photos", headers=bearer(tokens["access_token"]))
    assert api.status_code == 200
    assert api.json() == {"owner": "u-1001", "photos": ["beach.jpg", "hills.jpg"]}


def test_a_wrong_code_verifier_is_refused_and_the_code_is_used_up():
    lab = Lab()
    client = photo_app(lab)
    pending, callback = authorize(lab, client)
    with pytest.raises(OAuthError) as e:
        client.finish(callback, replace(pending, verifier=new_verifier()))
    assert (e.value.error, e.value.description) == ("invalid_grant", "code_verifier does not match the code_challenge.")
    # Even the right verifier fails now: one failed try burns the code, so verifiers cannot be guessed.
    with pytest.raises(OAuthError) as e:
        client.finish(callback, pending)
    assert (e.value.error, e.value.description) == ("invalid_grant", "The code is invalid, expired or already used.")


def test_a_code_works_only_once_and_using_it_again_revokes_the_token_it_gave():
    lab = Lab()
    client = photo_app(lab)
    pending, callback = authorize(lab, client)
    token = client.finish(callback, pending)["access_token"]
    assert lab.http.get("/api/photos", headers=bearer(token)).status_code == 200

    with pytest.raises(OAuthError) as e:
        client.finish(callback, pending)
    assert (e.value.error, e.value.description) == ("invalid_grant", "The code is invalid, expired or already used.")
    # The code leaked (someone else may hold the first token), so that token no longer works.
    api = lab.http.get("/api/photos", headers=bearer(token))
    assert api.status_code == 401
    assert api.headers["www-authenticate"] == 'Bearer error="invalid_token"'


def test_a_code_works_only_for_the_client_it_was_issued_to():
    lab = Lab()
    pending, callback = authorize(lab, photo_app(lab))
    # album-app is another registered public client. It presents photo-app's code, redirect URI and even its verifier.
    form = {"grant_type": "authorization_code", "code": query(callback)["code"], "redirect_uri": REDIRECT,
            "code_verifier": pending.verifier}
    res = lab.http.post("/token", data={**form, "client_id": "album-app"})
    assert res.status_code == 400
    assert res.json() == {"error": "invalid_grant", "error_description": "The code was issued to another client."}
    # The attempt used the code up, so not even photo-app can redeem it now.
    assert lab.http.post("/token", data={**form, "client_id": "photo-app"}).json()["error"] == "invalid_grant"


def test_a_code_expires_after_60_seconds():
    lab = Lab()
    client = photo_app(lab)
    pending, callback = authorize(lab, client)
    lab.advance(61)
    with pytest.raises(OAuthError) as e:
        client.finish(callback, pending)
    assert e.value.error == "invalid_grant"


def test_the_redirect_uri_must_match_exactly_at_authorize_and_at_token():
    lab = Lab()
    lookalikes = [
        "http://localhost:4000/callback/",
        "http://localhost:4000/callback?next=/admin",
        "http://localhost:4001/callback",
        "https://evil.example.com/callback",
    ]
    for uri in lookalikes:
        status, location = lab.visit(photo_app(lab, uri).start("photos.read").url)
        assert status == 400, uri
        assert location == "", "never redirect to an address that is not registered"

    pending, callback = authorize(lab, photo_app(lab))
    res = lab.http.post("/token", data={
        "grant_type": "authorization_code",
        "code": query(callback)["code"],
        "redirect_uri": "http://localhost:4000/other",
        "client_id": "photo-app",
        "code_verifier": pending.verifier,
    })
    assert res.status_code == 400
    assert res.json() == {"error": "invalid_grant", "error_description": "redirect_uri does not match the authorization request."}


def test_the_client_rejects_a_callback_whose_state_does_not_match():
    lab = Lab()
    client = photo_app(lab)
    pending, callback = authorize(lab, client)
    # A forged link: a real code, but a state this browser never made (a login CSRF attempt).
    forged = f"{REDIRECT}?{urlencode({'code': query(callback)['code'], 'state': 'made-by-an-attacker'})}"
    with pytest.raises(OAuthError) as e:
        client.finish(forged, pending)
    assert e.value.error == "invalid_state"


def test_the_client_rejects_a_callback_with_a_missing_or_different_iss():
    lab = Lab()
    client = photo_app(lab)
    pending, callback = authorize(lab, client)
    for change in ({"iss": None}, {"iss": "https://evil.example.com"}):
        params = {**query(callback), **change}
        with pytest.raises(OAuthError) as e:
            client.finish(f"{REDIRECT}?{urlencode({k: v for k, v in params.items() if v})}", pending)
        assert e.value.error == "invalid_issuer"


def test_the_authorization_server_requires_pkce_with_s256_and_an_allowed_scope():
    lab = Lab()
    for change in ({"code_challenge": None}, {"code_challenge_method": "plain"}):
        url = photo_app(lab).start("photos.read").url
        params = {**query(url), **change}
        status, location = lab.visit(f"{SERVER}/authorize?{urlencode({k: v for k, v in params.items() if v})}")
        assert status == 302  # the client and redirect_uri are fine, so the error goes back to the client
        back = query(location)
        assert back["error"] == "invalid_request"
        assert back["error_description"] == "PKCE with S256 is required."
        assert back["state"] == params["state"]
        assert back["iss"] == ISSUER
    _, location = lab.visit(photo_app(lab).start("reports.read").url)
    assert query(location)["error"] == "invalid_scope"
    assert urlsplit(location).path == "/callback"
