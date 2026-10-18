using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class KeyTests
{
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));

    [Fact]
    public void A_new_key_has_the_prefix_its_id_and_a_long_random_secret()
    {
        var store = new ApiKeyStore(_clock);
        var (record, key) = store.Issue("nightly-export", ["reports:read"]);
        Assert.Matches(@"^ak_live_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$", key);
        Assert.StartsWith($"ak_live_{record.Id}_", key);
        Assert.NotEqual(key, store.Issue("nightly-export", ["reports:read"]).Key);
    }

    [Fact]
    public void Only_a_SHA256_hash_of_the_key_is_stored()
    {
        var (record, key) = new ApiKeyStore(_clock).Issue("nightly-export", ["reports:read"]);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key))), record.Hash);
        Assert.DoesNotContain(key[^43..], System.Text.Json.JsonSerializer.Serialize(record));
    }

    [Fact]
    public void Verify_gives_one_answer_for_a_wrong_secret_or_an_unknown_id()
    {
        var store = new ApiKeyStore(_clock);
        var (record, key) = store.Issue("nightly-export", ["reports:read"]);
        Assert.Same(record, store.Verify(key).Key);
        Assert.Equal(_clock.Now, record.LastUsedAt);
        var wrongSecret = key[..^1] + (key.EndsWith('A') ? "B" : "A");
        var unknownId = key.Replace(record.Id, "000000000000");
        foreach (var bad in new[] { wrongSecret, unknownId, "not-a-key" })
            Assert.Equal((null, "Invalid API key."), store.Verify(bad));
    }

    [Fact]
    public void The_fixed_window_allows_the_limit_then_waits_for_the_next_window()
    {
        var limiter = new FixedWindowLimiter(_clock, Options.Create(new RateLimitOptions { PerMinute = 2 }));
        Assert.Equal(TimeSpan.Zero, limiter.Hit("k1"));
        Assert.Equal(TimeSpan.Zero, limiter.Hit("k1"));
        _clock.Now += TimeSpan.FromSeconds(15);
        Assert.Equal(TimeSpan.FromSeconds(45), limiter.Hit("k1")); // the time left in this window
        Assert.Equal(TimeSpan.Zero, limiter.Hit("k2")); // each key has its own count
        _clock.Now += TimeSpan.FromSeconds(45);
        Assert.Equal(TimeSpan.Zero, limiter.Hit("k1"));
    }
}
