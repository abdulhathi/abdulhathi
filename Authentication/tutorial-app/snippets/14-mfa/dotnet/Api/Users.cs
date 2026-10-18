using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;

public sealed class User(string email, string passwordHash)
{
    public string Email { get; } = email;
    public string PasswordHash { get; set; } = passwordHash;
    public string? TotpSecret { get; set; } // encrypted; set once enrolment is confirmed
    public string? PendingTotpSecret { get; set; } // encrypted; between /mfa/setup and /mfa/confirm
    public long LastTotpStep { get; set; } = -1; // the last 30-second step used, so a code works once
    public List<RecoveryCode>? RecoveryCodes { get; set; } // one salted hash per unused code
    public int CodeFailures { get; set; }
    public DateTimeOffset LockedUntil { get; set; }
}

/// <summary>An in-memory user table; a real app uses a database.</summary>
public sealed class UserStore
{
    private readonly ConcurrentDictionary<string, User> _users = new();
    public User? Find(string email) => _users.GetValueOrDefault(email);
    public bool TryAdd(User user) => _users.TryAdd(user.Email, user);
}

/// <summary>Session tokens (chapter 05 does sessions properly), and pending sign-ins: password checked, code not yet.</summary>
public sealed class SignIns
{
    private readonly ConcurrentDictionary<string, string> _sessions = new();
    private readonly ConcurrentDictionary<string, (string Email, DateTimeOffset ExpiresAt)> _pending = new();

    private static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public string StartSession(string email)
    {
        var token = NewToken();
        _sessions[token] = email;
        return token;
    }

    public string? SessionEmail(string? token) => token is null ? null : _sessions.GetValueOrDefault(token);

    public string StartPending(string email, DateTimeOffset expiresAt)
    {
        var token = NewToken();
        _pending[token] = (email, expiresAt);
        return token;
    }

    /// <summary>The email for a pending token, or null if it is unknown or has expired.</summary>
    public string? PendingEmail(string token, DateTimeOffset now)
    {
        if (!_pending.TryGetValue(token, out var p)) return null;
        if (p.ExpiresAt > now) return p.Email;
        _pending.TryRemove(token, out _);
        return null;
    }

    public void EndPending(string token) => _pending.TryRemove(token, out _);
}
