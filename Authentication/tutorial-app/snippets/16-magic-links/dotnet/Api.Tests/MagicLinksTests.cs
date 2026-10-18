using System.Security.Cryptography;
using System.Text;

public class MagicLinksTests
{
    private static readonly TimeProvider Clock = new ManualClock(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));

    [Fact]
    public void The_code_is_stored_only_as_an_HMAC_with_the_server_key()
    {
        var key = RandomNumberGenerator.GetBytes(32);
        var links = new MagicLinks(Clock, key);
        var (_, code) = links.Issue("ada@example.com", "browser-1");
        var stored = links.ByEmail["ada@example.com"];
        var message = Encoding.UTF8.GetBytes($"ada@example.com:{code}");
        Assert.Equal(HMACSHA256.HashData(key, message), stored.CodeHash);
        Assert.NotEqual(SHA256.HashData(message), stored.CodeHash); // not a plain hash
    }

    [Fact]
    public void After_20_wrong_codes_in_a_row_codes_stop_working_until_a_link_is_used()
    {
        var links = new MagicLinks(Clock);
        static string WrongFor(string code) => code == "000000" ? "111111" : "000000";
        for (var i = 0; i < MagicLinks.MaxFailedCodes / 5; i++)
        {
            var (_, wrongCode) = links.Issue("ada@example.com", "browser-1"); // a new email: 5 more tries each time
            for (var j = 0; j < 5; j++) Assert.False(links.CheckCode("ada@example.com", WrongFor(wrongCode)));
        }
        var (token, code) = links.Issue("ada@example.com", "browser-1");
        Assert.False(links.CheckCode("ada@example.com", code)); // even the right code is refused now
        Assert.Equal("ada@example.com", links.Consume(token)); // the link still works
        var (_, next) = links.Issue("ada@example.com", "browser-1");
        Assert.True(links.CheckCode("ada@example.com", next)); // and codes work again
    }
}
