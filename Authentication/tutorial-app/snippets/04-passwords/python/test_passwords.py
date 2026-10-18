from argon2 import PasswordHasher

from passwords import hash_password, needs_rehash, password_problem, verify_password

# Tests use a cheap cost so they run fast; the app uses HASHER.
FAST = PasswordHasher(memory_cost=1024, time_cost=1, parallelism=1)


def test_a_hash_verifies_the_right_password_and_rejects_a_wrong_one():
    stored = hash_password("correct horse battery", FAST)
    assert stored.startswith("$argon2id$v=19$m=1024,t=1,p=1$")
    assert verify_password("correct horse battery", stored, FAST)
    assert not verify_password("correct horse batterz", stored, FAST)


def test_the_same_password_hashes_differently_every_time():
    assert hash_password("correct horse battery", FAST) != hash_password("correct horse battery", FAST)


def test_hashes_made_with_weaker_settings_are_flagged_for_rehashing():
    old = hash_password("correct horse battery", FAST)
    assert needs_rehash(old)
    assert not needs_rehash(old, FAST)
    assert needs_rehash("md5$5f4dcc3b5aa765d61d8327deb882cf99")


def test_the_password_policy_checks_length_and_common_passwords_only():
    assert password_problem("short") == "Use at least 12 characters."
    assert password_problem("Password1234") == "That password is too common. Choose another."
    assert password_problem("all lowercase words are fine") is None
