"""A fixed-window rate limit: at most `limit` requests per key in each window (one minute by default).

Simple and cheap. Its weakness: a client can send up to 2 x limit around a window boundary.
In production keep the counts in Redis (INCR plus EXPIRE), so every server instance shares them.
"""
import time
from collections.abc import Callable


class FixedWindowLimiter:
    def __init__(self, limit: int, window: float = 60, now: Callable[[], float] = time.time) -> None:
        self._limit = limit
        self._window = window
        self._now = now
        self._windows: dict[str, tuple[float, int]] = {}  # key -> (window start, count)

    def hit(self, key: str) -> float:
        """Counts one request. Returns 0 if it may go ahead, or the seconds until the next window."""
        now = self._now()
        start = now - (now % self._window)
        window_start, count = self._windows.get(key, (start, 0))
        if window_start != start:
            count = 0
        if count >= self._limit:
            return start + self._window - now
        self._windows[key] = (start, count + 1)
        return 0
