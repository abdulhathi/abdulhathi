import hashlib
import hmac
import secrets

from magic_links import MAX_FAILED_CODES, MagicLinks


def test_the_code_is_stored_only_as_an_hmac_with_the_server_key():
    key = secrets.token_bytes(32)
    links = MagicLinks(lambda: 0.0, key)
    _, code = links.issue("ada@example.com", "browser-1")
    stored = links.by_email["ada@example.com"]
    assert stored.code_hash == hmac.digest(key, f"ada@example.com:{code}".encode(), "sha256")
    assert stored.code_hash != hashlib.sha256(f"ada@example.com:{code}".encode()).digest()  # not a plain hash


def test_after_20_wrong_codes_in_a_row_codes_stop_working_until_a_link_is_used():
    links = MagicLinks(lambda: 0.0)

    def wrong_for(code: str) -> str:
        return "111111" if code == "000000" else "000000"

    for _ in range(MAX_FAILED_CODES // 5):
        _, code = links.issue("ada@example.com", "browser-1")  # a new email: 5 more tries each time
        for _ in range(5):
            assert links.check_code("ada@example.com", wrong_for(code)) is False
    token, code = links.issue("ada@example.com", "browser-1")
    assert links.check_code("ada@example.com", code) is False, "even the right code is refused now"
    assert links.consume(token) == "ada@example.com", "the link still works"
    _, code = links.issue("ada@example.com", "browser-1")
    assert links.check_code("ada@example.com", code) is True, "and codes work again"
