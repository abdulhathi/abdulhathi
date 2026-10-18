using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

public class SessionTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly object Ada = new { email = "ada@example.com", password = "correct horse battery" };
    private static readonly object Bo = new { email = "bo@example.com", password = "purple monkey dishwasher" };
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly Api _api;

    public SessionTests(WebApplicationFactory<Program> factory)
    {
        var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.Configure<PasswordHasherOptions>(o => o.IterationCount = 1_000);
            services.AddSingleton<TimeProvider>(_clock);
        }));
        // HTTPS like production; cookies are handled by hand so each test sends exactly the ones it means to.
        _api = new Api(app.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false }));
    }

    private async Task<string> SignIn(object credentials, string? cookies = null)
    {
        var res = await _api.Call(HttpMethod.Post, "/login", cookies, credentials);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return Api.Cookie(res, "sid")!;
    }

    /// <summary>A session's CSRF token, and the cookies to send with it (antiforgery adds a cookie of its own).</summary>
    private async Task<(string Token, string Cookies)> CsrfFor(string session)
    {
        var res = await _api.Call(HttpMethod.Get, "/csrf", session);
        var token = (await res.Content.ReadFromJsonAsync<CsrfResponse>())!.CsrfToken;
        return (token, $"{session}; {Api.Cookie(res, "csrf")}");
    }

    private async Task<HttpStatusCode> Me(string session) => (await _api.Call(HttpMethod.Get, "/me", session)).StatusCode;

    [Fact]
    public async Task Signing_in_sets_an_HttpOnly_Secure_SameSite_Lax_session_cookie()
    {
        var res = await _api.Call(HttpMethod.Post, "/login", body: Ada);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"email":"ada@example.com","message":"Signed in."}""", await res.Content.ReadAsStringAsync());
        var cookie = Api.SetCookie(res, "sid")!;
        foreach (var flag in new[] { "; path=/", "; httponly", "; secure", "; samesite=lax", "; (expires|max-age)=" })
            Assert.Matches(new Regex(flag, RegexOptions.IgnoreCase), cookie);
        var me = await _api.Call(HttpMethod.Get, "/me", Api.Cookie(res, "sid"));
        Assert.Equal("""{"email":"ada@example.com"}""", await me.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_wrong_password_gets_401_no_session_cookie_and_leaves_the_current_session_alone()
    {
        var wrong = new { email = "ada@example.com", password = "wrong horse battery" };
        var res = await _api.Call(HttpMethod.Post, "/login", body: wrong);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"Email or password is incorrect."}""", await res.Content.ReadAsStringAsync());
        Assert.Null(Api.SetCookie(res, "sid"));
        var sid = await SignIn(Ada);
        await _api.Call(HttpMethod.Post, "/login", sid, wrong); // a failed sign-in does not sign anyone out
        Assert.Equal(HttpStatusCode.OK, await Me(sid));
    }

    [Fact]
    public async Task Without_a_valid_session_me_and_notes_answer_401()
    {
        var none = await _api.Call(HttpMethod.Get, "/me");
        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal("""{"error":"Sign in first."}""", await none.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, await Me("sid=made-up-session-id"));
        // No session is 401 even when the CSRF token is missing too: the session is checked first.
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.Call(HttpMethod.Post, "/notes", body: new { text = "buy milk" })).StatusCode);
    }

    [Fact]
    public async Task Signing_in_issues_a_new_session_id_so_a_planted_one_is_worthless()
    {
        var planted = await SignIn(Bo); // the attacker's own session
        var fresh = await SignIn(Ada, planted); // the victim signs in with it
        Assert.NotEqual(fresh, planted); // always true here: the cookie is re-encrypted. The next line is the real check
        Assert.Equal(HttpStatusCode.Unauthorized, await Me(planted)); // without the fix: 200 and Ada's email
        var me = await _api.Call(HttpMethod.Get, "/me", fresh);
        Assert.Equal("""{"email":"ada@example.com"}""", await me.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_state_changing_request_needs_the_CSRF_token_from_csrf()
    {
        var sid = await SignIn(Ada);
        var missing = await _api.Call(HttpMethod.Post, "/notes", sid, new { text = "buy milk" });
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        Assert.Equal("""{"error":"Missing or invalid CSRF token."}""", await missing.Content.ReadAsStringAsync());
        var (token, cookies) = await CsrfFor(sid);
        Assert.Equal(HttpStatusCode.Forbidden, (await _api.Call(HttpMethod.Post, "/notes", cookies, new { text = "buy milk" }, "guess")).StatusCode);
        var ok = await _api.Call(HttpMethod.Post, "/notes", cookies, new { text = "buy milk" }, token);
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        Assert.Equal("""{"notes":["buy milk"]}""", await ok.Content.ReadAsStringAsync());
        // Signing out changes state too: a forged sign-out without the token is refused.
        Assert.Equal(HttpStatusCode.Forbidden, (await _api.Call(HttpMethod.Post, "/logout", cookies)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, await Me(sid));
    }

    [Fact]
    public async Task A_CSRF_token_from_another_session_is_rejected()
    {
        var (_, ada) = await CsrfFor(await SignIn(Ada));
        var (boToken, _) = await CsrfFor(await SignIn(Bo));
        Assert.Equal(HttpStatusCode.Forbidden, (await _api.Call(HttpMethod.Post, "/notes", ada, new { text = "hi" }, boToken)).StatusCode);
    }

    [Fact]
    public async Task Signing_out_destroys_the_session_on_the_server_so_the_old_cookie_stops_working()
    {
        var sid = await SignIn(Ada);
        var (token, cookies) = await CsrfFor(sid);
        var res = await _api.Call(HttpMethod.Post, "/logout", cookies, csrf: token);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"message":"Signed out."}""", await res.Content.ReadAsStringAsync());
        Assert.Matches(new Regex("""^sid=("")?;.*(max-age=0|expires=Thu, 01 Jan 1970)""", RegexOptions.IgnoreCase), Api.SetCookie(res, "sid")!); // "delete it"
        Assert.Equal(HttpStatusCode.Unauthorized, await Me(sid)); // replaying the copied cookie
    }

    [Fact]
    public async Task An_idle_session_expires_after_30_minutes()
    {
        var sid = await SignIn(Ada);
        _clock.Now += TimeSpan.FromMinutes(31);
        Assert.Equal(HttpStatusCode.Unauthorized, await Me(sid));
    }

    [Fact]
    public async Task Activity_keeps_a_session_alive_but_never_past_8_hours()
    {
        var sid = await SignIn(Ada);
        for (var i = 0; i < 23; i++)
        {
            _clock.Now += TimeSpan.FromMinutes(20); // 7 h 40 min in total
            Assert.Equal(HttpStatusCode.OK, await Me(sid));
        }
        _clock.Now += TimeSpan.FromMinutes(25); // 8 h 5 min after sign-in
        Assert.Equal(HttpStatusCode.Unauthorized, await Me(sid));
    }
}
