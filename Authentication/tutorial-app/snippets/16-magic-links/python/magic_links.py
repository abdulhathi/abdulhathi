"""Pending email sign-ins.

Each one holds a link token and a 6-digit code, and the database keeps neither: only a SHA-256 hash of the token
(256 random bits cannot be guessed, so a fast hash is enough) and a keyed hash (HMAC) of the code (a million possible
codes would fall to a plain hash in a second, so the key, kept outside the database, is what protects it).
"""
import hashlib
import hmac
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

TTL_SECONDS = 15 * 60
MAX_CODE_ATTEMPTS = 5
# Wrong codes in a row for one address, across all its emails. Without this, an attacker who keeps asking for emails
# gets 5 more guesses with each one, for ever. NIST SP 800-63B allows at most 100; lower is better.
MAX_FAILED_CODES = 20


@dataclass
class Pending:
    email: str
    token_hash: str
    code_hash: bytes
    browser_hash: str  # which browser asked: see same_browser()
    expires_at: float
    attempts: int = 0


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


class MagicLinks:
    def __init__(self, now: Callable[[], float] = time.time, code_key: bytes | None = None) -> None:
        self.by_token: dict[str, Pending] = {}  # like a table with a unique index on token_hash
        self.by_email: dict[str, Pending] = {}  # the latest request for each email, for codes
        self._failed_codes: dict[str, int] = {}  # email -> wrong codes in a row
        self._now = now
        self._code_key = code_key or secrets.token_bytes(32)  # with several servers, share one key from configuration
        self._lock = threading.Lock()  # endpoints run on a thread pool; a database would use a transaction

    def issue(self, email: str, browser: str) -> tuple[str, str]:
        """A new link token and code for this email. Any earlier ones stop working."""
        token = secrets.token_urlsafe(32)  # 256 bits
        code = f"{secrets.randbelow(1_000_000):06d}"
        pending = Pending(email, sha256(token), self._hmac(email, code), sha256(browser), self._now() + TTL_SECONDS)
        with self._lock:
            if old := self.by_email.get(email):
                self._remove(old)
            self.by_token[pending.token_hash] = pending
            self.by_email[email] = pending
        return token, code

    def peek(self, token: str) -> Pending | None:
        """The pending sign-in for a link, if it is still valid, without using it up (for the confirmation page)."""
        pending = self.by_token.get(sha256(token))
        return pending if pending and pending.expires_at > self._now() else None

    def consume(self, token: str) -> str | None:
        """Uses up a link: returns its email the first time, and None ever after."""
        with self._lock:
            pending = self.by_token.get(sha256(token))
            if pending is None:
                return None
            # Removed before anything else, inside the lock, so a second request finds nothing. In SQL this is one
            # statement: DELETE FROM magic_links WHERE token_hash = $1 AND expires_at > now() RETURNING email.
            self._remove(pending)
            if pending.expires_at <= self._now():
                return None
            self._failed_codes.pop(pending.email, None)  # the real user signed in: codes work again
        return pending.email

    def check_code(self, email: str, code: str) -> bool:
        """Checks an emailed code. A right code is used up; five wrong ones use it up too. After MAX_FAILED_CODES wrong
        codes in a row, codes stop working for this address until it signs in with a link (links still work)."""
        with self._lock:
            pending = self.by_email.get(email)
            if pending is None or pending.expires_at <= self._now():
                return False
            failed = self._failed_codes.get(email, 0)
            if failed >= MAX_FAILED_CODES:
                return False
            if hmac.compare_digest(self._hmac(email, "".join(code.split())), pending.code_hash):
                self._remove(pending)
                self._failed_codes.pop(email, None)
                return True
            self._failed_codes[email] = failed + 1
            pending.attempts += 1
            if pending.attempts >= MAX_CODE_ATTEMPTS:
                self._remove(pending)
            return False

    def same_browser(self, pending: Pending, browser: str | None) -> bool:
        """True when the request comes from the browser that asked for the email (it carries that browser's cookie)."""
        return browser is not None and sha256(browser) == pending.browser_hash

    def _hmac(self, email: str, code: str) -> bytes:
        return hmac.digest(self._code_key, f"{email}:{code}".encode(), "sha256")

    def _remove(self, pending: Pending) -> None:
        self.by_token.pop(pending.token_hash, None)
        if self.by_email.get(pending.email) is pending:
            del self.by_email[pending.email]
