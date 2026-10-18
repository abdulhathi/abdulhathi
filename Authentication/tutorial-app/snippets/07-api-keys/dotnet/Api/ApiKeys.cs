using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

public sealed class ApiKey
{
    public required string Id { get; init; }
    public required string Name { get; init; }   // what the key is for, such as "nightly-export"
    public required string Hash { get; init; }   // SHA-256 of the whole key, in hex. Never the key itself.
    public required string[] Scopes { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int LifetimeDays { get; init; }        // the lifetime it was issued with; a rotation gives the new key the same
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset? LastUsedAt { get; set; }
}

/// <summary>
/// API keys: random, prefixed, shown once, stored only as a SHA-256 hash, and looked up by their id.
/// Format: ak_live_&lt;id&gt;_&lt;secret&gt;   id: 12 hex characters (not secret)   secret: 32 random bytes, base64url
/// </summary>
public sealed partial class ApiKeyStore(TimeProvider clock)
{
    public const string Prefix = "ak_live_";
    public static readonly string[] KnownScopes = ["reports:read", "keys:manage"];
    public const int DefaultTtlDays = 90;
    public static readonly TimeSpan RotationGrace = TimeSpan.FromHours(24); // the old key keeps working this long

    [GeneratedRegex(@"\Aak_live_([0-9a-f]{12})_[A-Za-z0-9_-]{43}\z")]
    private static partial Regex Format();

    private readonly ConcurrentDictionary<string, ApiKey> _keys = new(); // a real app uses a table keyed by id

    // A fast hash is right here: the key holds 256 random bits, so there is no list of likely keys to try.
    public static byte[] HashKey(string key) => SHA256.HashData(Encoding.UTF8.GetBytes(key));

    /// <summary>Makes a new key. The plain key is returned here, once, and never stored.</summary>
    public (ApiKey Record, string Key) Issue(string name, IEnumerable<string> scopes, int ttlDays = DefaultTtlDays)
    {
        while (true)
        {
            var id = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(6)); // RandomNumberGenerator is a CSPRNG
            var key = $"{Prefix}{id}_{Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32))}";
            var now = clock.GetUtcNow();
            var record = new ApiKey
            {
                Id = id, Name = name, Hash = Convert.ToHexStringLower(HashKey(key)), Scopes = [.. scopes],
                CreatedAt = now, ExpiresAt = now.AddDays(ttlDays), LifetimeDays = ttlDays,
            };
            if (_keys.TryAdd(id, record)) return (record, key);
        }
    }

    public ApiKey? Find(string id) => _keys.GetValueOrDefault(id);

    /// <summary>The key's record for a working key, or null and the reason it was refused.</summary>
    public (ApiKey? Key, string? Error) Verify(string presented)
    {
        var actual = HashKey(presented);
        var match = Format().Match(presented);
        var record = match.Success ? Find(match.Groups[1].Value) : null;
        // Look up by id, then compare the hashes in constant time. An unknown id and a wrong secret get the same answer.
        if (record is null || !CryptographicOperations.FixedTimeEquals(actual, Convert.FromHexString(record.Hash)))
            return (null, "Invalid API key.");
        // Only now that the caller has proved they hold the key do we say why it no longer works.
        if (record.RevokedAt is not null) return (null, "This API key has been revoked.");
        if (clock.GetUtcNow() >= record.ExpiresAt) return (null, "This API key has expired.");
        record.LastUsedAt = clock.GetUtcNow(); // shows which keys are unused and safe to delete
        return (record, null);
    }

    public ApiKey? Revoke(string id)
    {
        var record = Find(id);
        if (record is not null) record.RevokedAt ??= clock.GetUtcNow();
        return record;
    }

    /// <summary>A new key with the same name, scopes and lifetime. The old key stays valid for the grace period, then expires.</summary>
    public (ApiKey Record, string Key) Rotate(ApiKey old)
    {
        var fresh = Issue(old.Name, old.Scopes, old.LifetimeDays);
        var graceEnds = clock.GetUtcNow() + RotationGrace;
        if (graceEnds < old.ExpiresAt) old.ExpiresAt = graceEnds;
        return fresh;
    }
}
