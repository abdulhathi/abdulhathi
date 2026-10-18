/// <summary>
/// A sliding-window limit: at most <c>limit</c> requests per key in any <c>window</c>. Used twice, keyed by email
/// address and by IP address. In production keep the counts in Redis so every server instance shares them.
/// </summary>
public sealed class RateLimiter(int limit, TimeSpan window, TimeProvider clock)
{
    private readonly Dictionary<string, List<DateTimeOffset>> _hits = new();
    private readonly Lock _gate = new();

    /// <summary>Records a request and returns zero, or, when the key is over its limit, how long until it may try again.</summary>
    public TimeSpan Take(string key)
    {
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            var recent = (_hits.GetValueOrDefault(key) ?? []).Where(t => t > now - window).ToList();
            _hits[key] = recent;
            if (recent.Count >= limit) return recent[0] + window - now;
            recent.Add(now);
            return TimeSpan.Zero;
        }
    }
}
