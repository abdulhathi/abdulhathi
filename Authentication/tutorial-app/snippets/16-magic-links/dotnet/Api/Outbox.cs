public record Email(string To, string Subject, string Text);

/// <summary>
/// A fake mailer: it keeps every email in memory so the tests can read the link and code, and the dev server prints
/// each one. A real app hands the email to a provider (SES, SendGrid, Postmark, an SMTP relay) through a queue, so the
/// HTTP response does not wait for it.
/// </summary>
public sealed class Outbox(Action<Email>? onSend = null)
{
    private readonly List<Email> _sent = [];

    public IReadOnlyList<Email> Sent
    {
        get { lock (_sent) return [.. _sent]; }
    }

    public void Send(Email email)
    {
        lock (_sent) _sent.Add(email);
        onSend?.Invoke(email);
    }

    /// <summary>The newest email to this address.</summary>
    public Email? Last(string to)
    {
        lock (_sent) return _sent.LastOrDefault(email => email.To == to);
    }
}
