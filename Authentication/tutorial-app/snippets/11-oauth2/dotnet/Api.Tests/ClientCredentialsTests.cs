using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

public class ClientCredentialsTests : IDisposable
{
    private readonly Lab _lab = new();

    private Task<HttpResponseMessage> PostToken(Dictionary<string, string> form) => _lab.Http.PostAsync("/token", new FormUrlEncodedContent(form));

    [Fact]
    public async Task Client_credentials_a_service_gets_a_token_for_its_own_scope()
    {
        var tokens = await ClientCredentials.RequestAsync(_lab.Http, "report-job", "report-job-secret", "reports.read");
        Assert.Equal("reports.read", tokens.Scope);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/reports");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        var api = await _lab.Http.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, api.StatusCode);
        Assert.Equal("""{"client":"report-job","reports":["daily-sales.csv"]}""", await api.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Client_credentials_a_wrong_secret_a_broken_Basic_header_a_scope_it_was_not_given_or_a_public_client_is_refused()
    {
        var wrong = await PostToken(new() { ["grant_type"] = "client_credentials", ["client_id"] = "report-job", ["client_secret"] = "wrong-secret" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("Basic realm=\"token\"", wrong.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"invalid_client","error_description":"Client authentication failed."}""", await wrong.Content.ReadAsStringAsync());

        // "report-job:%zz" is not valid form encoding: an error answer, not a crash.
        using var broken = new HttpRequestMessage(HttpMethod.Post, "/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "client_credentials" }),
        };
        broken.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String("report-job:%zz"u8.ToArray()));
        var brokenResponse = await _lab.Http.SendAsync(broken);
        Assert.Equal(HttpStatusCode.Unauthorized, brokenResponse.StatusCode);
        Assert.Equal("invalid_client", (await brokenResponse.Content.ReadFromJsonAsync<Dictionary<string, string>>())!["error"]);

        var scope = await Assert.ThrowsAsync<OAuthException>(() => ClientCredentials.RequestAsync(_lab.Http, "report-job", "report-job-secret", "photos.read"));
        Assert.Equal("invalid_scope", scope.Error);

        // photo-app is public: it has no secret, so it may not get tokens as itself.
        var pub = await PostToken(new() { ["grant_type"] = "client_credentials", ["client_id"] = "photo-app" });
        Assert.Equal(HttpStatusCode.BadRequest, pub.StatusCode);
        Assert.Equal("unauthorized_client", (await pub.Content.ReadFromJsonAsync<Dictionary<string, string>>())!["error"]);
    }

    [Fact]
    public async Task The_password_grant_is_not_supported()
    {
        var response = await PostToken(new()
        {
            ["grant_type"] = "password", ["client_id"] = "photo-app", ["username"] = "ada@example.com", ["password"] = "correct horse battery",
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal("""{"error":"unsupported_grant_type","error_description":"Use authorization_code or client_credentials."}""",
            await response.Content.ReadAsStringAsync());
    }

    public void Dispose() => _lab.Dispose();
}
