using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class MagicLinkTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string BadLink = """{"error":"This link is not valid or has expired. Ask for a new one."}""";
    private const string BadCode = """{"error":"That code is not valid or has expired."}""";
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly Outbox _outbox = new(); // quiet: the tests read it instead of printing
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client; // keeps cookies, like a browser

    // xUnit makes a new instance for every test, so each test gets a fresh app.
    public MagicLinkTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.AddSingleton<TimeProvider>(_clock);
            services.AddSingleton(_outbox);
        }));
        _client = _factory.CreateClient();
    }

    private Task<HttpResponseMessage> Ask(string email) => _client.PostAsJsonAsync("/auth/email", new { email });

    /// <summary>The link token and code from the newest email to this address.</summary>
    private (string Token, string Code) Inbox(string email)
    {
        var text = _outbox.Last(email)!.Text;
        return (Regex.Match(text, @"token=([\w-]+)").Groups[1].Value, Regex.Match(text, @"code: (\d{6})").Groups[1].Value);
    }

    private static bool SetsCookie(HttpResponseMessage res, string name) =>
        res.Headers.TryGetValues("Set-Cookie", out var values) && values.Any(v => v.StartsWith($"{name}="));

    private static Task<HttpResponseMessage> PostForm(HttpClient client, string path, string token) =>
        client.PostAsync(path, new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token }));

    [Fact]
    public async Task The_emailed_link_signs_you_in_once()
    {
        Assert.Equal(HttpStatusCode.Accepted, (await Ask("ada@example.com")).StatusCode);
        var (token, _) = Inbox("ada@example.com");
        var signedIn = await _client.GetAsync($"/auth/verify?token={token}");
        Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);
        Assert.Equal("""{"email":"ada@example.com","message":"Signed in."}""", await signedIn.Content.ReadAsStringAsync());
        Assert.Equal("""{"email":"ada@example.com"}""", await _client.GetStringAsync("/me"));
        var again = await _client.GetAsync($"/auth/verify?token={token}");
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Equal(BadLink, await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task An_expired_link_or_code_fails()
    {
        await Ask("ada@example.com");
        var (token, code) = Inbox("ada@example.com");
        _clock.Now += TimeSpan.FromMinutes(15);
        var res = await _client.GetAsync($"/auth/verify?token={token}");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(BadLink, await res.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code })).StatusCode);
    }

    [Fact]
    public async Task The_same_link_used_twice_at_once_signs_in_only_once()
    {
        await Ask("ada@example.com");
        var (token, _) = Inbox("ada@example.com");
        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => PostForm(_factory.CreateClient(), "/auth/verify", token)));
        Assert.Equal([200, 400, 400, 400, 400, 400, 400, 400, 400, 400], results.Select(r => (int)r.StatusCode).Order());
    }

    [Fact]
    public async Task The_link_starts_with_the_configured_base_URL_whatever_the_Host_header_says()
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/auth/email") { Content = JsonContent.Create(new { email = "ada@example.com" }) };
        request.Headers.Host = "evil.example";
        Assert.Equal(HttpStatusCode.Accepted, (await _client.SendAsync(request)).StatusCode);
        var text = _outbox.Last("ada@example.com")!.Text;
        Assert.Matches(new Regex(@"^http://localhost:3000/auth/verify\?token=", RegexOptions.Multiline), text);
        Assert.DoesNotContain("evil.example", text);
    }

    [Fact]
    public async Task An_unknown_email_gets_the_same_answer_and_no_email_is_sent()
    {
        var known = await Ask("ada@example.com");
        var unknown = await Ask("nobody@example.com");
        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.True(SetsCookie(known, "signin_browser") && SetsCookie(unknown, "signin_browser"));
        Assert.Single(_outbox.Sent);
        Assert.Null(_outbox.Last("nobody@example.com"));
    }

    [Fact]
    public async Task Only_a_SHA256_hash_of_the_link_token_is_stored()
    {
        await Ask("ada@example.com");
        var (token, code) = Inbox("ada@example.com");
        var links = _factory.Services.GetRequiredService<MagicLinks>();
        var stored = links.ByToken[MagicLinks.Sha256(token)];
        Assert.Equal("ada@example.com", stored.Email);
        var everything = JsonSerializer.Serialize(links.ByToken);
        Assert.DoesNotContain(token, everything);
        Assert.DoesNotContain($"\"{code}\"", everything);
    }

    [Fact]
    public async Task A_link_opened_in_another_browser_shows_a_confirmation_page_and_only_the_POST_uses_it()
    {
        await Ask("ada@example.com");
        var (token, _) = Inbox("ada@example.com");
        var other = _factory.CreateClient(); // no cookie: a link scanner, or another device
        var page = await other.GetAsync($"/auth/verify?token={token}");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Equal("text/html", page.Content.Headers.ContentType!.MediaType);
        Assert.Equal("no-referrer", page.Headers.GetValues("Referrer-Policy").Single());
        Assert.Equal("frame-ancestors 'none'", page.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Contains("""<form method="post" action="/auth/verify">""", await page.Content.ReadAsStringAsync());
        var someoneElse = _factory.CreateClient(); // a browser cookie, but not the one that asked
        await someoneElse.PostAsJsonAsync("/auth/email", new { email = "nobody@example.com" });
        Assert.Contains("Continue signing in", await someoneElse.GetStringAsync($"/auth/verify?token={token}"));
        var confirmed = await PostForm(other, "/auth/verify", token);
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        Assert.True(SetsCookie(confirmed, "session"));
        Assert.Equal(HttpStatusCode.BadRequest, (await PostForm(other, "/auth/verify", token)).StatusCode);
    }

    [Fact]
    public async Task Asking_again_replaces_the_previous_link()
    {
        await Ask("ada@example.com");
        var (old, _) = Inbox("ada@example.com");
        await Ask("ada@example.com");
        var (fresh, _) = Inbox("ada@example.com");
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync($"/auth/verify?token={old}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _client.GetAsync($"/auth/verify?token={fresh}")).StatusCode);
    }

    [Fact]
    public async Task The_emailed_code_signs_you_in_once()
    {
        await Ask("ada@example.com");
        var (_, code) = Inbox("ada@example.com");
        var res = await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True(SetsCookie(res, "session"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code })).StatusCode);
    }

    [Fact]
    public async Task A_code_posted_by_an_HTML_form_is_refused_so_another_site_cannot_sign_you_in()
    {
        await Ask("ada@example.com");
        var (_, code) = Inbox("ada@example.com");
        var form = new FormUrlEncodedContent(new Dictionary<string, string> { ["email"] = "ada@example.com", ["code"] = code });
        var res = await _client.PostAsync("/auth/code", form); // what a hostile page can send
        Assert.NotEqual(HttpStatusCode.OK, res.StatusCode);
        Assert.False(SetsCookie(res, "session"));
        Assert.Equal(HttpStatusCode.OK, (await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code })).StatusCode);
    }

    [Fact]
    public async Task Five_wrong_codes_use_the_code_up()
    {
        await Ask("ada@example.com");
        var (_, code) = Inbox("ada@example.com");
        var wrong = code == "000000" ? "111111" : "000000";
        for (var i = 0; i < 5; i++)
        {
            var res = await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code = wrong });
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal(BadCode, await res.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.PostAsJsonAsync("/auth/code", new { email = "ada@example.com", code })).StatusCode);
    }

    [Fact]
    public async Task An_email_address_can_ask_for_3_emails_in_15_minutes()
    {
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.Accepted, (await Ask("ada@example.com")).StatusCode);
        var limited = await Ask("ada@example.com");
        Assert.Equal((HttpStatusCode)429, limited.StatusCode);
        Assert.Equal("900", limited.Headers.GetValues("Retry-After").Single());
        Assert.Equal("""{"error":"Too many requests. Try again later."}""", await limited.Content.ReadAsStringAsync());
        Assert.Equal(3, _outbox.Sent.Count);
        _clock.Now += TimeSpan.FromMinutes(15);
        Assert.Equal(HttpStatusCode.Accepted, (await Ask("ada@example.com")).StatusCode);
    }

    [Fact]
    public async Task An_IP_address_can_ask_for_10_emails_in_15_minutes()
    {
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.Accepted, (await Ask($"user{i}@example.com")).StatusCode);
        Assert.Equal((HttpStatusCode)429, (await Ask("user10@example.com")).StatusCode);
    }
}
