from harness import BASE, Lab


def test_discovery_and_jwks_describe_the_provider_and_publish_only_public_keys():
    lab = Lab()
    discovery = lab.browser.get("/idp/.well-known/openid-configuration").json()
    assert discovery["issuer"] == f"{BASE}/idp"
    assert discovery["jwks_uri"] == f"{BASE}/idp/jwks"
    assert discovery["end_session_endpoint"] == f"{BASE}/idp/logout"
    assert discovery["code_challenge_methods_supported"] == ["S256"]

    key = lab.browser.get("/idp/jwks").json()["keys"][0]
    assert (key["kty"], key["alg"], key["use"]) == ("RSA", "RS256", "sig")
    assert len(key["kid"]) == 43  # an RFC 7638 thumbprint
    assert not {"d", "p", "q", "dp", "dq", "qi"} & key.keys()


def test_userinfo_needs_a_valid_access_token():
    lab = Lab()
    assert lab.browser.get("/idp/userinfo").status_code == 401
    res = lab.browser.get("/idp/userinfo", headers={"Authorization": "Bearer not-a-real-token"})
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == 'Bearer error="invalid_token"'


def test_the_provider_redirects_only_to_registered_addresses():
    lab = Lab()
    status, location = lab.visit(
        "/idp/authorize?response_type=code&client_id=web-app&redirect_uri=https%3A%2F%2Fevil.example.com%2Fcallback"
        "&scope=openid&state=s&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256")
    assert status == 400
    assert location == ""

    logout = lab.browser.get("/idp/logout?client_id=web-app&post_logout_redirect_uri=https%3A%2F%2Fevil.example.com%2F",
                             follow_redirects=False)
    assert logout.status_code == 400
    assert logout.json() == {"error": "invalid_request", "error_description": "post_logout_redirect_uri is not registered."}
