using System.Collections.Concurrent;

/// <summary>
/// Locks an account for 15 minutes after 5 failed sign-ins in a row. A success clears the count.
/// In production keep this in Redis or the database, so every server instance sees the same counts.
/// </summary>
public sealed class LoginLimiter(TimeProvider clock)
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan LockFor = TimeSpan.FromMinutes(15);

    private sealed class Entry { public int Failures; public DateTimeOffset LockedUntil; }
    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    /// <summary>How long until this account may try again; zero if it may try now.</summary>
    public TimeSpan RetryAfter(string key)
    {
        if (!_entries.TryGetValue(key, out var e)) return TimeSpan.Zero;
        var left = e.LockedUntil - clock.GetUtcNow();
        return left > TimeSpan.Zero ? left : TimeSpan.Zero;
    }

    public void Fail(string key)
    {
        var e = _entries.GetOrAdd(key, _ => new Entry());
        lock (e)
        {
            e.Failures++;
            if (e.Failures >= MaxFailures)
            {
                e.LockedUntil = clock.GetUtcNow() + LockFor;
                e.Failures = 0;
            }
        }
    }

    public void Succeed(string key) => _entries.TryRemove(key, out _);
}
