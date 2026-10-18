/// <summary>
/// A set of IDs that each expire. The SP keeps two: the AuthnRequest IDs it sent and is waiting on, and the assertion
/// IDs it has already accepted (the replay cache). In production keep them in Redis or the database, so every server
/// instance shares them.
/// </summary>
public sealed class ExpiringIds(TimeProvider clock)
{
    private readonly Dictionary<string, DateTimeOffset> _ids = [];

    public void Add(string id, DateTimeOffset expiresAt)
    {
        lock (_ids)
        {
            foreach (var (key, until) in _ids.ToList())
                if (until <= clock.GetUtcNow()) _ids.Remove(key); // forget expired ones
            _ids[id] = expiresAt;
        }
    }

    public bool Has(string id)
    {
        lock (_ids) return _ids.TryGetValue(id, out var until) && until > clock.GetUtcNow();
    }

    /// <summary>True once for an ID that is present and not expired; it is removed, so a second call is false.</summary>
    public bool Take(string id)
    {
        lock (_ids) return Has(id) & _ids.Remove(id);
    }
}

/// <summary>The SP's memory between requests.</summary>
public sealed class SamlState(TimeProvider clock)
{
    public ExpiringIds Pending { get; } = new(clock); // AuthnRequest IDs we sent and have not had an answer to
    public ExpiringIds Used { get; } = new(clock); // assertion IDs we already accepted: the replay cache
}
