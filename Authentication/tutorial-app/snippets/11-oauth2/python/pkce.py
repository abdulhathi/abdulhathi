"""PKCE (RFC 7636) and the random values OAuth needs. Used by both the client and the authorization server."""
import base64
import hashlib
import hmac
import re
import secrets

# RFC 7636 section 4.1: 43 to 128 characters from the unreserved set.
VERIFIER_FORMAT = re.compile(r"[A-Za-z0-9\-._~]{43,128}")


def random_token(nbytes: int = 32) -> str:
    """A random, URL-safe string: 32 bytes give 43 characters. Used for codes, state and verifiers."""
    return secrets.token_urlsafe(nbytes)


def new_verifier() -> str:
    """The code_verifier: a fresh secret for every authorization request, kept by the client until the callback."""
    return random_token(32)


def challenge_for(verifier: str) -> str:
    """The S256 code_challenge: BASE64URL(SHA-256(code_verifier)), sent in the authorization request."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def safe_equal(a: str, b: str) -> bool:
    """Compares two strings in constant time."""
    return hmac.compare_digest(a.encode(), b.encode())
