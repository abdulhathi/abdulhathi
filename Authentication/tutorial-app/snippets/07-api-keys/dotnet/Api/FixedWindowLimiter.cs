using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

public sealed class RateLimitOptions
{
    public int PerMinute { get; set; } = 60;
}

/// <summary>
/// A fixed-window rate limit: at most PerMinute requests per key in each one-minute window.
/// Simple and cheap. Its weakness: a client can send up to 2 x limit around a window boundary.
/// In production keep the counts in Redis (INCR plus EXPIRE), so every server instance shares them.
/// </summary>
public sealed class FixedWindowLimiter(TimeProvider clock, IOptions<RateLimitOptions> options)
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private sealed class Counter { public long Start; public int Count; }
    private readonly ConcurrentDictionary<string, Counter> _windows = new();

    /// <summary>Counts one request. Returns zero if it may go ahead, or the time until the next window.</summary>
    public TimeSpan Hit(string key)
    {
        var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
        var start = now - now % (long)Window.TotalMilliseconds;
        var counter = _windows.GetOrAdd(key, _ => new Counter { Start = start });
        lock (counter)
        {
            if (counter.Start != start) (counter.Start, counter.Count) = (start, 0);
            if (counter.Count >= options.Value.PerMinute) return TimeSpan.FromMilliseconds(start + Window.TotalMilliseconds - now);
            counter.Count++;
            return TimeSpan.Zero;
        }
    }
}
