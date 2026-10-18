// A fake mailer: it keeps every email in memory so the tests can read the link and code, and the dev server prints
// each one. A real app hands the email to a provider (SES, SendGrid, Postmark, an SMTP relay) through a queue,
// so the HTTP response does not wait for it.
export type Email = { to: string; subject: string; text: string };

export class Outbox {
  readonly sent: Email[] = [];
  private readonly onSend?: (email: Email) => void;
  constructor(onSend?: (email: Email) => void) {
    this.onSend = onSend;
  }

  send(email: Email): void {
    this.sent.push(email);
    this.onSend?.(email);
  }

  /** The newest email to this address. */
  last(to: string): Email | undefined {
    return this.sent.findLast((email) => email.to === to);
  }
}
