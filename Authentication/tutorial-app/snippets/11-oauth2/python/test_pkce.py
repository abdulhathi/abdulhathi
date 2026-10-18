from pkce import VERIFIER_FORMAT, challenge_for, new_verifier


def test_the_s256_challenge_matches_the_rfc_7636_example():
    # RFC 7636 Appendix B.
    assert challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_each_verifier_is_new_43_url_safe_characters():
    a = new_verifier()
    assert len(a) == 43
    assert VERIFIER_FORMAT.fullmatch(a)
    assert a != new_verifier()
