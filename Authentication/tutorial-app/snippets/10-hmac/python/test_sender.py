import re

from sender import new_secret, sign, signature_header

T = 1_792_238_400  # 2026-10-17 12:00:00 UTC


def test_the_signature_is_hmac_sha256_of_timestamp_dot_body_in_hex():
    # The same value as: printf '%s' '1792238400.{"id":"evt_1","type":"order.paid"}' | openssl dgst -sha256 -hmac whsec_test_vector
    assert sign("whsec_test_vector", T, b'{"id":"evt_1","type":"order.paid"}') == (
        "c0ed66f2141a653db1d8b65b667377f0673d6c075b3b5b95d4b08bf33b568407"
    )


def test_the_header_has_the_timestamp_and_one_v1_signature_per_active_secret():
    a, b = new_secret(), new_secret()
    assert re.fullmatch(r"whsec_[A-Za-z0-9_-]{43}", a)
    assert a != b
    body = b'{"id":"evt_2"}'
    assert signature_header([a, b], T, body) == f"t={T},v1={sign(a, T, body)},v1={sign(b, T, body)}"
