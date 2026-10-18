"""The sending side of a webhook: sign the exact bytes you send, with a timestamp inside the signature.

Header: Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">[,v1=<another secret's signature>]
"""
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Callable

import httpx


def new_secret() -> str:
    """A new shared secret, generated once and given to the receiver over a safe channel (a settings page, a vault)."""
    return f"whsec_{secrets.token_urlsafe(32)}"


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """HMAC-SHA256 over "<timestamp>.<body>", in hex. The timestamp is signed too, so it cannot be changed."""
    return hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()


def signature_header(secret_list: list[str], timestamp: int, body: bytes) -> str:
    """One v1 signature per active secret, so the receiver can rotate secrets without missing a delivery."""
    return ",".join([f"t={timestamp}", *(f"v1={sign(s, timestamp, body)}" for s in secret_list)])


def deliver(client: httpx.Client, url: str, event: dict, secret_list: list[str], now: Callable[[], float] = time.time) -> httpx.Response:
    """Sends one webhook: serialize once, sign those exact bytes, and POST them."""
    body = json.dumps(event, separators=(",", ":")).encode()
    timestamp = int(now())
    headers = {"Content-Type": "application/json", "Webhook-Signature": signature_header(secret_list, timestamp, body)}
    return client.post(url, content=body, headers=headers)
