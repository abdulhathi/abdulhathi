using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

/// <summary>A clock the tests can move forward, and slow down to widen race windows.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public TimeSpan Delay { get; set; } = TimeSpan.Zero;
    public override DateTimeOffset GetUtcNow()
    {
        if (Delay > TimeSpan.Zero) Thread.Sleep(Delay);
        return Now;
    }
}

public record Tokens(HttpStatusCode Status, string Access, string Refresh, string SetCookie, string Body);

public class RefreshFlowTests : IClassFixture<WebApplicationFactory<Program>>
{
    // IdentityModel checks exp against the system clock, so the fake clock starts at the real time. To expire an
    // access token, a test signs in on a clock set in the past; the refresh-token checks follow the fake clock alone.
    private readonly ManualClock _clock = new(DateTimeOffset.UtcNow);
    private readonly HttpClient _client;

    public RefreshFlowTests(WebApplicationFactory<Program> factory)
    {
        var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(_clock)));
        // No cookie jar: each call sends the refresh cookie by hand, the way a browser would.
        _client = app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
    }

    private async Task<Tokens> Call(string path, string? refresh = null, string? access = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        if (refresh is not null) request.Headers.Add("Cookie", $"refresh_token={refresh}");
        if (access is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        if (path == "/auth/login") request.Content = JsonContent.Create(new { email = "ada@example.com", password = "correct horse battery" });
        var res = await _client.SendAsync(request);
        var setCookie = res.Headers.TryGetValues("Set-Cookie", out var values) ? string.Join("; ", values) : "";
        var body = await res.Content.ReadAsStringAsync();
        var issued = res.StatusCode == HttpStatusCode.OK ? JsonDocument.Parse(body).RootElement.GetProperty("access_token").GetString()! : "";
        return new Tokens(res.StatusCode, issued, Regex.Match(setCookie, "refresh_token=([^;]*)").Groups[1].Value, setCookie, body);
    }

    private Task<Tokens> Login() => Call("/auth/login");
    private Task<Tokens> Refresh(string token) => Call("/auth/refresh", token);
    private Task<HttpResponseMessage> Me(string access)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        return _client.SendAsync(request);
    }

    [Fact]
    public async Task Login_returns_a_10_minute_access_token_and_sets_the_refresh_cookie()
    {
        var res = await _client.PostAsJsonAsync("/auth/login", new { email = "ada@example.com", password = "correct horse battery" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("no-store", res.Headers.CacheControl!.ToString());
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        // No refresh token in the body.
        Assert.Equal(["access_token", "token_type", "expires_in"], body.EnumerateObject().Select(p => p.Name));
        Assert.Equal(600, body.GetProperty("expires_in").GetInt32());
        var cookie = res.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant();
        foreach (var part in new[] { "httponly", "secure", "samesite=strict", "path=/auth", "max-age=604800" })
            Assert.Contains(part, cookie);
        Assert.Equal(HttpStatusCode.OK, (await Me(body.GetProperty("access_token").GetString()!)).StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_a_new_refresh_token_and_a_new_access_token_every_time()
    {
        var first = await Login();
        var second = await Refresh(first.Refresh);
        Assert.Equal(HttpStatusCode.OK, second.Status);
        Assert.NotEqual(first.Refresh, second.Refresh);
        Assert.NotEqual(first.Access, second.Access);
        var third = await Refresh(second.Refresh);
        Assert.Equal(HttpStatusCode.OK, third.Status);
        Assert.NotEqual(second.Refresh, third.Refresh);
        Assert.Equal("""{"sub":"u_1001","email":"ada@example.com"}""", await (await Me(third.Access)).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Reusing_a_spent_refresh_token_revokes_the_whole_family()
    {
        var first = await Login();
        var second = await Refresh(first.Refresh); // the user refreshes; first is now spent
        var replay = await Refresh(first.Refresh); // someone presents first again
        Assert.Equal(HttpStatusCode.Unauthorized, replay.Status);
        Assert.Equal("""{"error":"Refresh token reuse detected. Sign in again."}""", replay.Body);
        Assert.Matches("refresh_token=;", replay.SetCookie); // the cookie is cleared
        var next = await Refresh(second.Refresh); // the newest token died with its family
        Assert.Equal(HttpStatusCode.Unauthorized, next.Status);
        Assert.Equal("""{"error":"Invalid refresh token."}""", next.Body);
    }

    [Fact]
    public async Task Parallel_refreshes_with_one_token_let_exactly_one_win_and_the_rest_count_as_reuse()
    {
        var first = await Login();
        // A clock that takes 5 ms widens the gap between "is it spent?" and "spend it", so without the store's lock
        // several of these requests would succeed.
        _clock.Delay = TimeSpan.FromMilliseconds(5);
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => Refresh(first.Refresh))));
        _clock.Delay = TimeSpan.Zero;
        var winner = Assert.Single(results, r => r.Status == HttpStatusCode.OK);
        Assert.Contains(results, r => r.Body == """{"error":"Refresh token reuse detected. Sign in again."}""");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(winner.Refresh)).Status); // the family was revoked
    }

    [Fact]
    public async Task An_expired_access_token_is_refused_and_refresh_gets_a_new_one()
    {
        _clock.Now = DateTimeOffset.UtcNow.AddMinutes(-11); // signed in 11 minutes ago
        var signedIn = await Login();
        var expired = await Me(signedIn.Access);
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", expired.Headers.WwwAuthenticate.ToString());
        _clock.Now += TimeSpan.FromMinutes(11); // now
        var renewed = await Refresh(signedIn.Refresh);
        Assert.Equal(HttpStatusCode.OK, renewed.Status);
        Assert.Equal(HttpStatusCode.OK, (await Me(renewed.Access)).StatusCode);
    }

    [Fact]
    public async Task A_refresh_token_unused_for_7_days_expires()
    {
        var first = await Login();
        _clock.Now += TimeSpan.FromDays(7) - TimeSpan.FromMinutes(1);
        var second = await Refresh(first.Refresh); // still inside its 7 days
        Assert.Equal(HttpStatusCode.OK, second.Status);
        _clock.Now += TimeSpan.FromDays(7);
        var late = await Refresh(second.Refresh);
        Assert.Equal(HttpStatusCode.Unauthorized, late.Status);
        Assert.Equal("""{"error":"Refresh token expired. Sign in again."}""", late.Body);
    }

    [Fact]
    public async Task The_family_ends_30_days_after_sign_in_however_often_it_refreshes()
    {
        var current = (await Login()).Refresh;
        for (var day = 6; day <= 24; day += 6)
        {
            _clock.Now += TimeSpan.FromDays(6);
            current = (await Refresh(current)).Refresh;
        }
        _clock.Now += TimeSpan.FromDays(5); // day 29
        var lastDay = await Refresh(current);
        Assert.Equal(HttpStatusCode.OK, lastDay.Status);
        Assert.Contains("max-age=86400", lastDay.SetCookie.ToLowerInvariant()); // one day left, not seven
        _clock.Now += TimeSpan.FromDays(1); // day 30
        var ended = await Refresh(lastDay.Refresh);
        Assert.Equal(HttpStatusCode.Unauthorized, ended.Status);
        Assert.Equal("""{"error":"Refresh token expired. Sign in again."}""", ended.Body);
    }

    [Fact]
    public async Task Logout_revokes_the_family_and_clears_the_cookie()
    {
        var signedIn = await Login();
        var output = await Call("/auth/logout", signedIn.Refresh);
        Assert.Equal(HttpStatusCode.NoContent, output.Status);
        Assert.Matches("refresh_token=;", output.SetCookie);
        Assert.Matches(new Regex("max-age=0|1970", RegexOptions.IgnoreCase), output.SetCookie); // Max-Age=0 or a past expiry deletes the cookie
        var after = await Refresh(signedIn.Refresh);
        Assert.Equal(HttpStatusCode.Unauthorized, after.Status);
        Assert.Equal("""{"error":"Invalid refresh token."}""", after.Body);
    }

    [Fact]
    public async Task An_access_token_outlives_logout_unless_its_jti_is_deny_listed()
    {
        var a = await Login();
        await Call("/auth/logout", a.Refresh); // cookie only
        Assert.Equal(HttpStatusCode.OK, (await Me(a.Access)).StatusCode); // a JWT stays valid until it expires

        var b = await Login();
        await Call("/auth/logout", b.Refresh, b.Access); // cookie and access token
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(b.Access)).StatusCode);
    }

    [Fact]
    public async Task Two_sign_ins_are_separate_families_signing_out_of_one_keeps_the_other()
    {
        var laptop = await Login();
        var phone = await Login();
        await Call("/auth/logout", laptop.Refresh);
        Assert.Equal(HttpStatusCode.OK, (await Refresh(phone.Refresh)).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(laptop.Refresh)).Status);
    }

    [Fact]
    public async Task A_missing_or_made_up_refresh_token_is_rejected()
    {
        var missing = await Call("/auth/refresh");
        Assert.Equal(HttpStatusCode.Unauthorized, missing.Status);
        Assert.Equal("""{"error":"Missing refresh token."}""", missing.Body);
        var madeUp = await Refresh("bm90LWEtcmVhbC10b2tlbi1qdXN0LXNvbWUtYnl0ZXM");
        Assert.Equal(HttpStatusCode.Unauthorized, madeUp.Status);
        Assert.Equal("""{"error":"Invalid refresh token."}""", madeUp.Body);
    }
}
