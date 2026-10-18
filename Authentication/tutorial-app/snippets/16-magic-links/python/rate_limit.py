"""A sliding-window limit: at most `limit` requests per key in any `window` seconds.

Used twice, keyed by email address and by IP address. In production keep the counts in Redis so every server
instance shares them.
"""
import threading
import time
from collections.abc import Callable


class RateLimiter:
    def __init__(self, limit: int, window: float, now: Callable[[], float] = time.time) -> None:
        self._limit = limit
        self._window = window
        self._now = now
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def take(self, key: str) -> float:
        """Records a request and returns 0, or, when the key is over its limit, the seconds until it may try again."""
        with self._lock:
            now = self._now()
            recent = [t for t in self._hits.get(key, []) if t > now - self._window]
            self._hits[key] = recent
            if len(recent) >= self._limit:
                return recent[0] + self._window - now
            recent.append(now)
            return 0.0
