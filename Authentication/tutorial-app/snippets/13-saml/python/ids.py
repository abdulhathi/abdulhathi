"""A set of IDs that each expire.

The SP keeps two: the AuthnRequest IDs it sent and is waiting on, and the assertion IDs it has already accepted (the
replay cache). In production keep them in Redis or the database, so every server instance shares them.
"""
import threading
import time
from collections.abc import Callable


class ExpiringIds:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._ids: dict[str, float] = {}
        # FastAPI runs plain `def` endpoints in a thread pool, so two requests can arrive here at once. Without the lock,
        # both copies of a replayed response could pass take() before either removes the ID.
        self._lock = threading.Lock()

    def add(self, id_: str, expires_at: float) -> None:
        with self._lock:
            now = self._now()
            for key in [k for k, until in self._ids.items() if until <= now]:
                del self._ids[key]  # forget expired ones
            self._ids[id_] = expires_at

    def has(self, id_: str) -> bool:
        with self._lock:
            until = self._ids.get(id_)
            return until is not None and until > self._now()

    def take(self, id_: str) -> bool:
        """True once for an ID that is present and not expired; it is removed, so a second call is False."""
        with self._lock:
            until = self._ids.pop(id_, None)
            return until is not None and until > self._now()
