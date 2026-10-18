import base64
import re

from tokens import random_token


def test_session_ids_and_csrf_tokens_are_256_random_bits():
    a = random_token()
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", a)
    assert len(base64.urlsafe_b64decode(a + "=")) == 32
    assert random_token() != a
