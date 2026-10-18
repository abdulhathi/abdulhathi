"""Shared by the tests: the app in memory and a "browser" that keeps cookies and does not follow redirects."""
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient

from app import create_app

BASE = "http://testserver"  # TestClient's base URL


class Lab:
    def __init__(self) -> None:
        # The relying party's back-channel calls (discovery, JWKS, token, UserInfo) go to this same app, in memory.
        transport = httpx.ASGITransport(app=None)
        self.app = create_app(BASE, idp_transport=transport)
        transport.app = self.app
        self.browser = TestClient(self.app)

    @property
    def idp(self):
        return self.app.state.idp

    @property
    def last_sign_in_error(self) -> str:
        return self.app.state.sign_in_errors[-1]

    def visit(self, url: str, method: str = "GET") -> tuple[int, str]:
        res = self.browser.request(method, url, follow_redirects=False)
        return res.status_code, res.headers.get("location", "")

    def start_sign_in(self) -> str:
        """/login, then the provider's /authorize: returns the callback URL the provider sent the browser to."""
        _, authorize = self.visit("/login")
        return self.visit(authorize)[1]


def query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
