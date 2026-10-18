using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

public class BasicAuthTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Challenge = "Basic realm=\"Auth Lab\", charset=\"UTF-8\"";
    private readonly HttpClient _client;

    public BasicAuthTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
            services.Configure<PasswordHasherOptions>(o => o.IterationCount = 1_000))) // a cheap cost; the app uses 210,000
            .CreateClient();
    }

    private static string Basic(string username, string password) =>
        "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));

    private Task<HttpResponseMessage> Get(string path, string? authorization = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (authorization is not null) request.Headers.TryAddWithoutValidation("Authorization", authorization);
        return _client.SendAsync(request);
    }

    private static string WwwAuthenticate(HttpResponseMessage res) => res.Headers.NonValidated["WWW-Authenticate"].ToString();
    private record ErrorBody(string Error);
    private record Me(string Username);

    [Fact]
    public async Task A_request_without_credentials_gets_a_401_challenge()
    {
        var res = await Get("/me");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(Challenge, WwwAuthenticate(res));
        Assert.Equal("Authentication required.", (await res.Content.ReadFromJsonAsync<ErrorBody>())!.Error);
    }

    [Fact]
    public async Task The_right_username_and_password_are_let_in_with_no_session_cookie()
    {
        var res = await Get("/me", Basic("ada", "correct horse battery"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"username":"ada"}""", await res.Content.ReadAsStringAsync());
        Assert.False(res.Headers.Contains("Set-Cookie")); // nothing is remembered: the next request sends the password again
    }

    [Fact]
    public async Task A_wrong_password_and_an_unknown_user_get_the_same_answer()
    {
        foreach (var res in new[] { await Get("/me", Basic("ada", "wrong horse battery")), await Get("/me", Basic("nobody", "wrong horse battery")) })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal(Challenge, WwwAuthenticate(res));
            Assert.Equal("""{"error":"Username or password is incorrect."}""", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task A_password_may_contain_colons_only_the_first_colon_splits()
    {
        var res = await Get("/me", Basic("ci-bot", "s3cret:with:colons"));
        Assert.Equal("ci-bot", (await res.Content.ReadFromJsonAsync<Me>())!.Username);
    }

    [Fact]
    public async Task Names_and_passwords_are_read_as_UTF8()
    {
        var res = await Get("/me", Basic("zoë", "grüße aus Köln"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("zoë", (await res.Content.ReadFromJsonAsync<Me>())!.Username);
    }

    [Fact]
    public async Task Both_Unicode_spellings_of_a_letter_are_accepted()
    {
        // "ë" as one code point (what Users.cs stores) or as "e" plus a combining mark: normalized to NFC, they match.
        var res = await Get("/me", Basic("zoe\u0308", "gru\u0308\u00dfe aus Ko\u0308ln"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("zoë", (await res.Content.ReadFromJsonAsync<Me>())!.Username);
    }

    [Fact]
    public async Task A_malformed_header_is_rejected_and_another_scheme_counts_as_no_credentials()
    {
        string[] malformed =
        [
            "Basic !!!not-base64",
            "Basic " + Convert.ToBase64String("no-colon"u8.ToArray()),
            "Basic " + Convert.ToBase64String(Encoding.Latin1.GetBytes("zo\u00eb:gr\u00fc\u00dfe aus K\u00f6ln")), // not UTF-8
            "Basic YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ", // base64 without its padding
            "Basic YWRhOmNv cnJlY3QgaG9yc2UgYmF0dGVyeQ==", // a space inside the base64
        ];
        foreach (var header in malformed)
        {
            var res = await Get("/me", header);
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal(Challenge, WwwAuthenticate(res));
            Assert.Equal("Username or password is incorrect.", (await res.Content.ReadFromJsonAsync<ErrorBody>())!.Error);
        }
        var bearer = await Get("/me", "Bearer abc");
        Assert.Equal(HttpStatusCode.Unauthorized, bearer.StatusCode);
        Assert.Equal("Authentication required.", (await bearer.Content.ReadFromJsonAsync<ErrorBody>())!.Error);
    }

    [Fact]
    public async Task The_scheme_name_is_case_insensitive()
    {
        var res = await Get("/me", Basic("ada", "correct horse battery").Replace("Basic", "basic"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task A_public_route_needs_no_credentials()
    {
        var res = await Get("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"status":"ok"}""", await res.Content.ReadAsStringAsync());
    }
}
