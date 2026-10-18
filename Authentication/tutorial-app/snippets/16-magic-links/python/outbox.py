"""A fake mailer: it keeps every email in memory so the tests can read the link and code, and the dev server prints
each one. A real app hands the email to a provider (SES, SendGrid, Postmark, an SMTP relay) through a queue, so the
HTTP response does not wait for it."""
from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class Email:
    to: str
    subject: str
    text: str


class Outbox:
    def __init__(self, on_send: Callable[[Email], None] | None = None) -> None:
        self.sent: list[Email] = []
        self._on_send = on_send

    def send(self, email: Email) -> None:
        self.sent.append(email)
        if self._on_send:
            self._on_send(email)

    def last(self, to: str) -> Email | None:
        """The newest email to this address."""
        return next((email for email in reversed(self.sent) if email.to == to), None)
