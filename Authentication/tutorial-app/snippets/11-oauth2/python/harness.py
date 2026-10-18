"""Shared by the tests: the app with a clock the test can move forward, and a few helpers."""
from urllib.parse import parse_qs, urlsplit

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from fastapi.testclient import TestClient

from app import create_app

ISSUER = "http://localhost:3000"
SERVER = "http://testserver"  # TestClient's base URL


class Lab:
    """The app with a clock the test can move forward (and, if given, the server's own signing key)."""

    def __init__(self, signing_key: RSAPrivateKey | None = None) -> None:
        self.clock = 1_792_238_400.0  # 2026-10-17 12:00 UTC
        self.http = TestClient(create_app(ISSUER, now=lambda: self.clock, signing_key=signing_key))

    def advance(self, seconds: float) -> None:
        self.clock += seconds

    def visit(self, url: str) -> tuple[int, str]:
        """Plays the browser: opens the URL and reports where the server redirects it, without following."""
        res = self.http.get(url, follow_redirects=False)
        return res.status_code, res.headers.get("location", "")


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
