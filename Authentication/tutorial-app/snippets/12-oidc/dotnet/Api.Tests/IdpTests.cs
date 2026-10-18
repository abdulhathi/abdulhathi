using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

public class IdpTests : IDisposable
{
    private readonly Lab _lab = new();

    [Fact]
    public async Task Discovery_and_JWKS_describe_the_provider_and_publish_only_public_keys()
    {
        var discovery = JsonDocument.Parse(await _lab.Browser.GetStringAsync("/idp/.well-known/openid-configuration")).RootElement;
        Assert.Equal($"{Lab.Base}/idp", discovery.GetProperty("issuer").GetString());
        Assert.Equal($"{Lab.Base}/idp/jwks", discovery.GetProperty("jwks_uri").GetString());
        Assert.Equal($"{Lab.Base}/idp/logout", discovery.GetProperty("end_session_endpoint").GetString());
        Assert.Equal("[\"S256\"]", discovery.GetProperty("code_challenge_methods_supported").GetRawText());

        var key = JsonDocument.Parse(await _lab.Browser.GetStringAsync("/idp/jwks")).RootElement.GetProperty("keys")[0];
        Assert.Equal("RSA", key.GetProperty("kty").GetString());
        Assert.Equal("RS256", key.GetProperty("alg").GetString());
        Assert.Equal("sig", key.GetProperty("use").GetString());
        Assert.Equal(43, key.GetProperty("kid").GetString()!.Length); // an RFC 7638 thumbprint
        Assert.All(new[] { "d", "p", "q", "dp", "dq", "qi" }, part => Assert.False(key.TryGetProperty(part, out _)));
    }

    [Fact]
    public async Task UserInfo_needs_a_valid_access_token()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/idp/userinfo")).StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/idp/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-real-token");
        var response = await _lab.Browser.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", response.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task The_provider_redirects_only_to_registered_addresses()
    {
        var (status, location) = await _lab.Visit(
            "/idp/authorize?response_type=code&client_id=web-app&redirect_uri=https%3A%2F%2Fevil.example.com%2Fcallback&scope=openid&state=s&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256");
        Assert.Equal(400, status);
        Assert.Equal("", location);

        var logout = await _lab.Browser.GetAsync("/idp/logout?client_id=web-app&post_logout_redirect_uri=https%3A%2F%2Fevil.example.com%2F");
        Assert.Equal(HttpStatusCode.BadRequest, logout.StatusCode);
        Assert.Equal("""{"error":"invalid_request","error_description":"post_logout_redirect_uri is not registered."}""",
            await logout.Content.ReadAsStringAsync());
    }

    public void Dispose() => _lab.Dispose();
}
