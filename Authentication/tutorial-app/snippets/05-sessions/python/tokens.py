import hmac
import secrets


def random_token() -> str:
    """256 random bits as 43 URL-safe characters: used for session ids and CSRF tokens."""
    return secrets.token_urlsafe(32)


def same_token(sent: str, expected: str) -> bool:
    """Compares two tokens in constant time. The length is not secret (every token is 43 characters)."""
    return bool(expected) and hmac.compare_digest(sent.encode(), expected.encode())
