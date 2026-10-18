using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

public sealed record Rejection(int Status, string Error);

/// <summary>Every active secret: the new one and, while rotating, the old one.</summary>
public sealed record WebhookSecrets(string[] Values);

/// <summary>The receiving side: check the Webhook-Signature header against the raw body, the timestamp, and a replay cache.</summary>
public sealed partial class WebhookVerifier(WebhookSecrets secrets, TimeProvider clock)
{
    public const int ToleranceSeconds = 5 * 60;
    private readonly ConcurrentDictionary<string, long> _seen = new(); // digest of "<t>.<body>" -> when it can be forgotten

    [GeneratedRegex(@"\A[0-9]{1,12}\z")] private static partial Regex Timestamp(); // Unix seconds, of a sane length
    [GeneratedRegex(@"\A[0-9a-f]{64}\z")] private static partial Regex Hex64();

    /// <summary>"t=1792238400,v1=ab12...,v1=cd34..." to (timestamp, signatures), or null if it is not in that shape.</summary>
    public static (long Timestamp, List<string> Signatures)? Parse(string header)
    {
        long? timestamp = null;
        var signatures = new List<string>();
        foreach (var part in header.Split(','))
        {
            var pair = part.Trim().Split('=', 2);
            var value = pair.Length == 2 ? pair[1] : "";
            if (pair[0] == "t" && Timestamp().IsMatch(value)) timestamp = long.Parse(value);
            else if (pair[0] == "v1" && Hex64().IsMatch(value)) signatures.Add(value);
        }
        return timestamp is { } ts && signatures.Count > 0 ? (ts, signatures) : null;
    }

    /// <summary>Returns null when the webhook is genuine and new, or the reason to reject it.</summary>
    public Rejection? Verify(string? header, byte[] body)
    {
        if (string.IsNullOrEmpty(header)) return new(400, "Missing Webhook-Signature header.");
        if (Parse(header) is not { } parsed) return new(400, "Malformed Webhook-Signature header.");
        var (timestamp, signatures) = parsed;

        // A captured request can be replayed, so only accept recent ones (both directions, to allow for clock skew).
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        if (Math.Abs(now - timestamp) > ToleranceSeconds) return new(400, "Timestamp outside the tolerance window.");

        byte[] signed = [.. Encoding.UTF8.GetBytes($"{timestamp}."), .. body];
        var matches = secrets.Values.Any(secret =>
        {
            var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed);
            // Constant time: the time taken says nothing about how many bytes of a forged signature were right.
            return signatures.Any(sig => CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(sig)));
        });
        if (!matches) return new(400, "Signature does not match.");

        // Within the window, the same timestamp and body twice is a replay. Key on what was signed, not on the header:
        // an attacker could resend the header with one of its two v1 values removed.
        foreach (var (key, until) in _seen) if (until < now) _seen.TryRemove(key, out _);
        var digest = Convert.ToHexStringLower(SHA256.HashData(signed));
        return _seen.TryAdd(digest, timestamp + ToleranceSeconds) ? null : new(409, "This delivery was already received.");
    }
}
