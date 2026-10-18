public class RateLimiterTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-10-17T12:00:00Z");

    [Fact]
    public void Allows_the_limit_then_refuses_until_the_oldest_request_leaves_the_window()
    {
        var clock = new ManualClock(Start);
        var limiter = new RateLimiter(3, TimeSpan.FromSeconds(60), clock);
        foreach (var seconds in new[] { 0, 10, 20 })
        {
            clock.Now = Start.AddSeconds(seconds);
            Assert.Equal(TimeSpan.Zero, limiter.Take("ada@example.com"));
        }
        clock.Now = Start.AddSeconds(30);
        Assert.Equal(TimeSpan.FromSeconds(30), limiter.Take("ada@example.com")); // the request at 0 leaves the window at 60
        clock.Now = Start.AddSeconds(60);
        Assert.Equal(TimeSpan.Zero, limiter.Take("ada@example.com"));
        Assert.Equal(TimeSpan.FromSeconds(10), limiter.Take("ada@example.com"));
    }

    [Fact]
    public void Each_key_has_its_own_count()
    {
        var limiter = new RateLimiter(1, TimeSpan.FromSeconds(60), new ManualClock(Start));
        Assert.Equal(TimeSpan.Zero, limiter.Take("ada@example.com"));
        Assert.Equal(TimeSpan.Zero, limiter.Take("bo@example.com"));
        Assert.Equal(TimeSpan.FromSeconds(60), limiter.Take("ada@example.com"));
    }
}
