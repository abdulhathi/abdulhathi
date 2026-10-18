using System.Buffers.Text;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

/// <summary>For contrast: cookie authentication's default, with no session store. The whole ticket travels in the
/// cookie, encrypted and signed by Data Protection, and the server keeps nothing.</summary>
public class ClientSideTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly Api _api;

    public ClientSideTests(WebApplicationFactory<Program> factory)
    {
        var app = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.Configure<PasswordHasherOptions>(o => o.IterationCount = 1_000);
            services.PostConfigure<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme, o => o.SessionStore = null);
        }));
        _api = new Api(app.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = false }));
    }

    private async Task<string> SignIn()
    {
        var res = await _api.Call(HttpMethod.Post, "/login", body: new { email = "ada@example.com", password = "correct horse battery" });
        return Api.Cookie(res, "sid")!;
    }

    [Fact]
    public async Task A_client_side_cookie_cannot_be_read_or_changed_without_the_key()
    {
        var cookie = await SignIn();
        var bytes = Base64Url.DecodeFromChars(cookie.AsSpan("sid=".Length));
        Assert.DoesNotContain("ada@example.com", Encoding.UTF8.GetString(bytes)); // encrypted, unlike a signed cookie
        Assert.Equal(HttpStatusCode.OK, (await _api.Call(HttpMethod.Get, "/me", cookie)).StatusCode);
        var i = cookie.Length / 2;
        var forged = cookie[..i] + (cookie[i] == 'A' ? 'B' : 'A') + cookie[(i + 1)..];
        Assert.Equal(HttpStatusCode.Unauthorized, (await _api.Call(HttpMethod.Get, "/me", forged)).StatusCode);
    }

    [Fact]
    public async Task A_client_side_session_cookie_still_works_after_sign_out()
    {
        var cookie = await SignIn();
        var csrf = await _api.Call(HttpMethod.Get, "/csrf", cookie);
        var token = (await csrf.Content.ReadFromJsonAsync<CsrfResponse>())!.CsrfToken;
        var signOut = await _api.Call(HttpMethod.Post, "/logout", $"{cookie}; {Api.Cookie(csrf, "csrf")}", csrf: token);
        Assert.Equal(HttpStatusCode.OK, signOut.StatusCode);
        var replay = await _api.Call(HttpMethod.Get, "/me", cookie); // a copy taken before sign-out
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal("""{"email":"ada@example.com"}""", await replay.Content.ReadAsStringAsync());
    }
}
