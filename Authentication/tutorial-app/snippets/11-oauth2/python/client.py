"""The client side of OAuth 2.0, written out by hand so every step is visible.

In a real app use a maintained library (Authlib's OAuth2Session or its framework integrations), which does the
same steps.
"""
import base64
from dataclasses import dataclass
from urllib.parse import parse_qs, quote, urlencode, urlsplit

import httpx

from pkce import challenge_for, new_verifier, random_token


class OAuthError(Exception):
    def __init__(self, error: str, description: str = ""):
        super().__init__(description)
        self.error, self.description = error, description


@dataclass
class Pending:
    """What the client must remember between sending the user away and the user coming back: keep it in the session."""
    url: str
    state: str
    verifier: str


def _token_response(res: httpx.Response) -> dict:
    body = res.json()
    if res.status_code != 200:
        raise OAuthError(body["error"], body.get("error_description", ""))
    return body


class AuthorizationCodeClient:
    """The authorization code flow with PKCE, for an app that acts for a user."""

    def __init__(self, http: httpx.Client, server: str, issuer: str, client_id: str, redirect_uri: str):
        """server: where to send requests. issuer: the server's issuer identifier, which its responses must carry."""
        self.http, self.server, self.issuer = http, server, issuer
        self.client_id, self.redirect_uri = client_id, redirect_uri

    def start(self, scope: str) -> Pending:
        """Step 1: build the URL to send the browser to, with a fresh state and PKCE verifier."""
        state = random_token(16)  # ties the callback to this browser: CSRF protection
        verifier = new_verifier()  # stays here; only its hash travels through the browser
        query = urlencode({
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": scope,
            "state": state,
            "code_challenge": challenge_for(verifier),
            "code_challenge_method": "S256",
        })
        return Pending(f"{self.server}/authorize?{query}", state, verifier)

    def finish(self, callback_url: str, pending: Pending) -> dict:
        """Step 2: the browser came back to the redirect URI. Check state and iss, then swap the code (and verifier)
        for a token."""
        params = {k: v[0] for k, v in parse_qs(urlsplit(callback_url).query).items()}
        if params.get("state") != pending.state:
            raise OAuthError("invalid_state", "The state does not match this sign-in. Start again.")
        # RFC 9207: this server always sends iss. A missing or different value means the response came from elsewhere
        # (a mix-up attack against a client that talks to several authorization servers).
        if params.get("iss") != self.issuer:
            raise OAuthError("invalid_issuer", "The response did not come from the expected authorization server.")
        if "error" in params:
            raise OAuthError(params["error"], params.get("error_description", ""))
        res = self.http.post(f"{self.server}/token", data={
            "grant_type": "authorization_code",
            "code": params.get("code", ""),
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "code_verifier": pending.verifier,
        })
        return _token_response(res)


def client_credentials(http: httpx.Client, server: str, client_id: str, secret: str, scope: str) -> dict:
    """The client credentials grant, for a service calling an API as itself (no user)."""
    # client_secret_basic: RFC 6749 section 2.3.1 form-encodes the id and secret before Base64.
    basic = base64.b64encode(f"{quote(client_id, safe='')}:{quote(secret, safe='')}".encode()).decode()
    res = http.post(f"{server}/token", headers={"Authorization": f"Basic {basic}"},
                    data={"grant_type": "client_credentials", "scope": scope})
    return _token_response(res)
