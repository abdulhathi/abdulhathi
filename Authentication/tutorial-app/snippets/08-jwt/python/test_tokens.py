import base64
import json
import re

import jwt
import pytest

from keys import KeyRing, thumbprint
from shared_secret import new_secret, sign_hs256, verify_hs256
from tokens import AUDIENCE, ISSUER, User, issue_access_token


def decode_part(part: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def test_a_jwt_is_three_base64url_parts_and_anyone_can_read_the_payload():
    ring = KeyRing()
    now = 1_792_238_400  # 2026-10-17 12:00 UTC
    token = issue_access_token(ring, User("u_1001", "ada@example.com"), lambda: now)
    parts = token.split(".")
    assert len(parts) == 3
    # No key needed to read it: the payload is encoded, not encrypted.
    assert decode_part(parts[0]) == {"alg": "RS256", "typ": "JWT", "kid": ring.current.kid}
    claims = decode_part(parts[1])
    assert claims["iss"] == ISSUER
    assert claims["sub"] == "u_1001"
    assert claims["aud"] == AUDIENCE
    assert claims["email"] == "ada@example.com"
    assert claims["iat"] == now
    assert claims["nbf"] == claims["iat"]
    assert claims["exp"] - claims["iat"] == 600
    assert re.fullmatch(r"[0-9a-f-]{36}", claims["jti"])


def test_hs256_the_same_secret_signs_and_verifies_any_other_secret_fails():
    secret = new_secret()
    assert len(secret) == 32
    token = sign_hs256("u_1001", secret)
    assert verify_hs256(token, secret)["sub"] == "u_1001"
    with pytest.raises(jwt.InvalidSignatureError):
        verify_hs256(token, new_secret())


# The example RSA key from RFC 7638, section 3.1, and the thumbprint the RFC gives for it.
RFC7638_N = (
    "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhM"
    "stn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5h"
    "ajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw"
)


def test_the_jwks_holds_public_keys_only_each_with_its_kid():
    [jwk] = KeyRing().jwks()["keys"]
    assert list(jwk) == ["kty", "use", "alg", "kid", "n", "e"]  # no d, p, q: nothing private
    assert jwk["kid"] == thumbprint(jwk["n"], jwk["e"])
    assert thumbprint(RFC7638_N, "AQAB") == "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"  # checked against the RFC
