"""The receiving side: check the Webhook-Signature header against the raw body, the timestamp, and a replay cache."""
import hashlib
import hmac
import re
import time
from collections.abc import Callable
from dataclasses import dataclass

TOLERANCE_SECONDS = 5 * 60
_DIGITS = re.compile(r"[0-9]{1,12}")  # Unix seconds, of a sane length (int() refuses over 4300 digits)
_HEX64 = re.compile(r"[0-9a-f]{64}")


@dataclass(frozen=True)
class Rejection:
    status: int
    error: str


def parse_signature_header(header: str) -> tuple[int, list[str]] | None:
    """'t=1792238400,v1=ab12...,v1=cd34...' -> (timestamp, signatures), or None if it is not in that shape."""
    timestamp, signatures = None, []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t" and _DIGITS.fullmatch(value):
            timestamp = int(value)
        elif key == "v1" and _HEX64.fullmatch(value):
            signatures.append(value)
    return (timestamp, signatures) if timestamp is not None and signatures else None


class WebhookVerifier:
    def __init__(self, secrets: list[str], now: Callable[[], float] = time.time) -> None:
        self._secrets = secrets  # every active secret: the new one and, while rotating, the old one
        self._now = now
        self._seen: dict[str, int] = {}  # digest of "<t>.<body>" -> when it can be forgotten (unix seconds)

    def verify(self, header: str | None, body: bytes) -> Rejection | None:
        """Returns None when the webhook is genuine and new, or the reason to reject it."""
        if not header:
            return Rejection(400, "Missing Webhook-Signature header.")
        parsed = parse_signature_header(header)
        if parsed is None:
            return Rejection(400, "Malformed Webhook-Signature header.")
        timestamp, signatures = parsed

        # A captured request can be replayed, so only accept recent ones (both directions, to allow for clock skew).
        now = int(self._now())
        if abs(now - timestamp) > TOLERANCE_SECONDS:
            return Rejection(400, "Timestamp outside the tolerance window.")

        signed = f"{timestamp}.".encode() + body
        expected = [hmac.new(s.encode(), signed, hashlib.sha256).hexdigest() for s in self._secrets]
        # compare_digest takes the same time however many characters of a forged signature were right.
        if not any(hmac.compare_digest(e, sig) for e in expected for sig in signatures):
            return Rejection(400, "Signature does not match.")

        # Within the window, the same timestamp and body twice is a replay. Key on what was signed, not on the header:
        # an attacker could resend the header with one of its two v1 values removed.
        self._seen = {k: until for k, until in self._seen.items() if until >= now}
        digest = hashlib.sha256(signed).hexdigest()
        if digest in self._seen:
            return Rejection(409, "This delivery was already received.")
        self._seen[digest] = timestamp + TOLERANCE_SECONDS
        return None
