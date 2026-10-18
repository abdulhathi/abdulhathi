"""A server-side session store. The browser holds only a random id; everything else stays on the server.

In memory for this lab. In production use Redis (one key per session, with an expiry) or a database table, so every
server instance sees the same sessions and a restart does not sign everyone out.
"""
import time
from collections.abc import Callable
from dataclasses import dataclass

from tokens import random_token

IDLE_SECONDS = 30 * 60  # signed out after 30 minutes without a request
ABSOLUTE_SECONDS = 8 * 60 * 60  # and 8 hours after sign-in, however active


@dataclass
class Session:
    id: str
    email: str
    csrf_token: str
    created_at: float  # when the user signed in: for the absolute timeout
    last_seen_at: float  # the latest request: for the idle timeout


class SessionStore:
    def __init__(self, now: Callable[[], float] = time.time) -> None:
        self._now = now
        self._sessions: dict[str, Session] = {}

    def create(self, email: str) -> Session:
        t = self._now()
        session = Session(id=random_token(), email=email, csrf_token=random_token(), created_at=t, last_seen_at=t)
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str | None) -> Session | None:
        """The live session with this id, or None. An expired session is deleted, not just ignored."""
        session = self._sessions.get(session_id or "")
        if session is None:
            return None
        t = self._now()
        if t - session.last_seen_at > IDLE_SECONDS or t - session.created_at > ABSOLUTE_SECONDS:
            self.destroy(session.id)
            return None
        session.last_seen_at = t
        return session

    def destroy(self, session_id: str | None) -> None:
        self._sessions.pop(session_id or "", None)
