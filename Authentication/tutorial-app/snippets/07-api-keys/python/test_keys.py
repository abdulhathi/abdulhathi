import hashlib
import re

from keys import KeyStore
from limiter import FixedWindowLimiter

clock = [1_792_238_400.0]  # 2026-10-17 12:00 UTC


def now() -> float:
    return clock[0]


def test_a_new_key_has_the_prefix_its_id_and_a_long_random_secret():
    store = KeyStore(now)
    record, key = store.issue("nightly-export", ["reports:read"])
    assert re.fullmatch(r"ak_live_[0-9a-f]{12}_[A-Za-z0-9_-]{43}", key)
    assert key.startswith(f"ak_live_{record.id}_")
    assert store.issue("nightly-export", ["reports:read"])[1] != key


def test_only_a_sha256_hash_of_the_key_is_stored():
    record, key = KeyStore(now).issue("nightly-export", ["reports:read"])
    assert record.hash == hashlib.sha256(key.encode()).hexdigest()
    assert key[-43:] not in repr(record), "never store the secret"


def test_verify_gives_one_answer_for_a_wrong_secret_or_an_unknown_id():
    store = KeyStore(now)
    record, key = store.issue("nightly-export", ["reports:read"])
    assert store.verify(key) == (record, None)
    assert record.last_used_at == clock[0]
    wrong_secret = key[:-1] + ("B" if key.endswith("A") else "A")
    unknown_id = key.replace(record.id, "000000000000")
    for bad in (wrong_secret, unknown_id, "not-a-key"):
        assert store.verify(bad) == (None, "Invalid API key.")


def test_the_fixed_window_allows_the_limit_then_waits_for_the_next_window():
    limiter = FixedWindowLimiter(2, 60, now)
    assert limiter.hit("k1") == 0
    assert limiter.hit("k1") == 0
    clock[0] += 15
    assert limiter.hit("k1") == 45, "the time left in this window"
    assert limiter.hit("k2") == 0, "each key has its own count"
    clock[0] += 45
    assert limiter.hit("k1") == 0
