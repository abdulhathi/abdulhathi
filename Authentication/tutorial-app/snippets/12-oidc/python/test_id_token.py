"""Each test makes the provider get one thing wrong in the ID token; the sign-in must fail, with no session."""
from harness import Lab


def sign_in_with(misbehave: str) -> str:
    lab = Lab()
    lab.idp.misbehave = misbehave
    res = lab.browser.get(lab.start_sign_in(), follow_redirects=False)
    assert res.status_code == 401
    assert res.json() == {"error": "Sign-in failed."}
    assert lab.browser.get("/me").status_code == 401
    return lab.last_sign_in_error


def test_an_id_token_with_the_wrong_nonce_is_refused():
    assert "'nonce'" in sign_in_with("wrong-nonce")


def test_an_id_token_for_another_audience_is_refused():
    assert "'aud'" in sign_in_with("wrong-audience")


def test_an_expired_id_token_is_refused():
    assert sign_in_with("expired").startswith("ExpiredTokenError")


def test_an_id_token_from_another_issuer_is_refused():
    assert "'iss'" in sign_in_with("wrong-issuer")


def test_an_id_token_signed_with_an_unknown_key_is_refused():
    # The provider may have rotated keys, so Authlib fetches the JWKS again before giving up.
    assert sign_in_with("unknown-kid").startswith("InvalidKeyIdError")


def test_an_id_token_with_a_forged_signature_is_refused():
    # The kid is the provider's, the claims are all right, the signature is not.
    assert sign_in_with("bad-signature").startswith("BadSignatureError")
