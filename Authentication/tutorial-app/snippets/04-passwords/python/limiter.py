"""Locks an account for 15 minutes after 5 failed sign-ins in a row. A success clears the count.

In production keep this in Redis or the database, so every server instance sees the same counts.
"""
import time
from collections.abc import Callable
from dataclasses import dataclass

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60


@dataclass
class _Entry:
    failures: int = 0
    locked_until: float = 0.0


class LoginLimiter:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._entries: dict[str, _Entry] = {}

    def retry_after(self, key: str) -> float:
        """Seconds until this account may try again, or 0 if it may try now."""
        e = self._entries.get(key)
        return max(0.0, e.locked_until - self._now()) if e else 0.0

    def fail(self, key: str) -> None:
        e = self._entries.setdefault(key, _Entry())
        e.failures += 1
        if e.failures >= MAX_FAILURES:
            e.locked_until = self._now() + LOCK_SECONDS
            e.failures = 0

    def succeed(self, key: str) -> None:
        self._entries.pop(key, None)
