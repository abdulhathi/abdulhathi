using System.Net;
using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

public class ResourceServerTests : IDisposable
{
    private readonly Lab _lab = new();

    private Task<HttpResponseMessage> Get(string path, string? token = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (token is not null) request.Headers.Authorization = new("Bearer", token);
        return _lab.Http.SendAsync(request);
    }

    [Fact]
    public async Task The_resource_server_refuses_a_missing_forged_or_expired_token()
    {
        var missing = await Get("/api/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        Assert.Equal("Bearer", missing.Headers.WwwAuthenticate.ToString());

        // Every claim is right, but it is signed with the attacker's own key.
        var now = _lab.Clock.GetUtcNow().UtcDateTime;
        var forged = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            TokenType = "at+jwt", Issuer = Lab.Issuer, Audience = "photo-api", IssuedAt = now, Expires = now.AddMinutes(10),
            Claims = new Dictionary<string, object> { ["sub"] = "report-job", ["client_id"] = "report-job", ["scope"] = "reports.read" },
            SigningCredentials = new SigningCredentials(new RsaSecurityKey(RSA.Create(2048)), SecurityAlgorithms.RsaSha256),
        });
        var bad = await Get("/api/reports", forged);
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", bad.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"invalid_token","error_description":"The access token is invalid or expired."}""", await bad.Content.ReadAsStringAsync());

        var token = (await ClientCredentials.RequestAsync(_lab.Http, "report-job", "report-job-secret", "reports.read")).AccessToken;
        Assert.Equal(HttpStatusCode.OK, (await Get("/api/reports", token)).StatusCode);
        _lab.Clock.Now += TimeSpan.FromSeconds(601); // the token lives 600 seconds
        Assert.Equal(HttpStatusCode.Unauthorized, (await Get("/api/reports", token)).StatusCode);
    }

    [Fact]
    public async Task The_resource_server_refuses_a_token_for_another_API_of_another_type_or_from_another_issuer()
    {
        // This time the test holds the authorization server's real key, so only the claim under test is wrong.
        var key = new RsaSecurityKey(RSA.Create(2048));
        using var lab = new Lab(key);
        var now = lab.Clock.GetUtcNow().UtcDateTime;
        string Sign(string aud = "photo-api", string typ = "at+jwt", string iss = Lab.Issuer) =>
            new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
            {
                TokenType = typ, Issuer = iss, Audience = aud, IssuedAt = now, Expires = now.AddMinutes(10),
                Claims = new Dictionary<string, object>
                {
                    ["sub"] = "report-job", ["client_id"] = "report-job", ["scope"] = "reports.read", ["jti"] = "test-token",
                },
                SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
            });
        async Task<HttpResponseMessage> Reports(string token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/reports");
            request.Headers.Authorization = new("Bearer", token);
            return await lab.Http.SendAsync(request);
        }

        Assert.Equal(HttpStatusCode.OK, (await Reports(Sign())).StatusCode); // all claims right
        foreach (var wrong in new[] { Sign(aud: "billing-api"), Sign(typ: "JWT"), Sign(iss: "https://evil.example.com") })
        {
            var response = await Reports(wrong);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("Bearer error=\"invalid_token\"", response.Headers.WwwAuthenticate.ToString());
        }
    }

    [Fact]
    public async Task The_resource_server_refuses_a_token_without_the_needed_scope()
    {
        var token = (await ClientCredentials.RequestAsync(_lab.Http, "report-job", "report-job-secret", "reports.read")).AccessToken;
        var response = await Get("/api/photos", token);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Bearer error=\"insufficient_scope\", scope=\"photos.read\"", response.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"insufficient_scope","error_description":"This call needs the photos.read scope."}""", await response.Content.ReadAsStringAsync());
    }

    public void Dispose() => _lab.Dispose();
}
