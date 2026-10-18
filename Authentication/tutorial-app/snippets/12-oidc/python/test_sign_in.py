from harness import BASE, Lab, query


def test_a_full_sign_in_code_flow_with_pkce_state_and_nonce_creates_a_session():
    lab = Lab()
    assert lab.browser.get("/me").status_code == 401

    status, authorize = lab.visit("/login")
    assert status == 302
    assert authorize.startswith(f"{BASE}/idp/authorize?")
    request = query(authorize)
    assert request["response_type"] == "code"
    assert request["client_id"] == "web-app"
    assert request["redirect_uri"] == f"{BASE}/callback"
    assert request["scope"] == "openid profile email"
    assert request["code_challenge_method"] == "S256"
    assert all(request[p] for p in ("state", "nonce", "code_challenge"))

    _, callback = lab.visit(authorize)
    assert callback.startswith(f"{BASE}/callback?code=")
    assert lab.visit(callback) == (302, "/me")

    me = lab.browser.get("/me")
    assert me.status_code == 200
    assert me.json() == {"sub": "u-1001", "name": "Ada Example", "email": "ada@example.com"}


def test_the_relying_party_refuses_a_callback_with_the_wrong_state():
    lab = Lab()
    callback = lab.start_sign_in()
    forged = f"{BASE}/callback?code={query(callback)['code']}&state=made-by-an-attacker"
    res = lab.browser.get(forged, follow_redirects=False)
    assert res.status_code == 401
    assert res.json() == {"error": "Sign-in failed."}
    assert lab.browser.get("/me").status_code == 401


def test_sign_out_ends_the_local_session_and_returns_from_the_provider():
    lab = Lab()
    lab.visit(lab.start_sign_in())
    assert lab.browser.get("/me").status_code == 200

    status, end_session = lab.visit("/logout", "POST")
    assert status == 302
    assert end_session.startswith(f"{BASE}/idp/logout?")
    request = query(end_session)
    assert request["post_logout_redirect_uri"] == f"{BASE}/logged-out"
    assert request["id_token_hint"]

    _, back = lab.visit(end_session)
    assert back.startswith(f"{BASE}/logged-out?state=")
    assert lab.visit(back)[1] == "/"
    assert lab.browser.get("/me").status_code == 401
    assert lab.browser.get("/").json() == {"signedIn": False}


def test_a_sign_out_callback_with_the_wrong_state_does_not_redirect():
    lab = Lab()
    lab.visit(lab.start_sign_in())
    lab.visit("/logout", "POST")  # the local session ends here
    res = lab.browser.get("/logged-out?state=made-by-an-attacker", follow_redirects=False)
    assert res.status_code == 400
    assert "location" not in res.headers
    assert res.json() == {"error": "Sign-out state does not match."}
    assert lab.browser.get("/me").status_code == 401
