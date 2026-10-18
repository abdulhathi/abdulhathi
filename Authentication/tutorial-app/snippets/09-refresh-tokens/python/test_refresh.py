import base64
import json

from refresh import DAY, FAMILY_TTL, REFRESH_TTL, RefreshStore, Rotated, hash_token

START = 1_792_238_400.0  # 2026-10-17 12:00 UTC


def test_refresh_tokens_are_256_random_bits_and_only_their_sha256_hash_is_stored():
    store = RefreshStore(lambda: START)
    token = store.issue("u_1001").token
    assert len(base64.urlsafe_b64decode(token + "=")) == 32
    assert store.issue("u_1001").token != token
    assert next(iter(store.tokens)) == hash_token(token)
    assert token not in json.dumps({k: vars(v) for k, v in store.tokens.items()}), "the token itself is never stored"


def test_a_rotated_token_stays_in_its_family_and_never_outlives_it():
    clock = [START]
    store = RefreshStore(lambda: clock[0])
    current = store.issue("u_1001")
    assert current.expires_at == START + REFRESH_TTL
    family_id = next(iter(store.families))
    for day in range(6, 25, 6):
        clock[0] = START + day * DAY
        rotated = store.rotate(current.token)
        assert isinstance(rotated, Rotated)
        assert store.tokens[hash_token(rotated.refresh.token)].family_id == family_id
        current = rotated.refresh
    # Day 24 + 7 days would pass the family's 30-day end, so the last token stops there.
    assert current.expires_at == START + FAMILY_TTL
