using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

public class LoginTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly TestIdp Idp = new();
    private readonly HttpClient _client;

    public LoginTests(WebApplicationFactory<Program> factory)
    {
        var clock = new ManualClock(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
        _client = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.AddSingleton(SamlSettings.Example(Idp.Certificate));
            services.AddSingleton<TimeProvider>(clock);
        })).CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    [Fact]
    public async Task Login_redirects_to_the_IdP_with_a_deflated_AuthnRequest()
    {
        var res = await _client.GetAsync("/saml/login");
        Assert.Equal(HttpStatusCode.Found, res.StatusCode);
        var location = res.Headers.Location!;
        Assert.StartsWith("https://idp.example.com/saml/sso?SAMLRequest=", location.ToString());
        var request = TestIdp.AuthnRequestFrom(location);
        Assert.Equal("AuthnRequest", request.LocalName);
        Assert.Matches("^_[0-9a-f]{40}$", request.GetAttribute("ID"));
        Assert.Equal("2026-10-17T12:00:00Z", request.GetAttribute("IssueInstant"));
        Assert.Equal("https://sp.example.com/saml/acs", request.GetAttribute("AssertionConsumerServiceURL"));
        Assert.Equal(Saml.PostBinding, request.GetAttribute("ProtocolBinding"));
        Assert.Equal("https://sp.example.com/saml/metadata", request.GetElementsByTagName("Issuer", Saml.Assertion)[0]!.InnerText);
    }

    [Fact]
    public async Task Metadata_publishes_the_entity_ID_and_the_ACS_URL()
    {
        var res = await _client.GetAsync("/saml/metadata");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.StartsWith("application/samlmetadata+xml", res.Content.Headers.ContentType!.ToString());
        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("entityID=\"https://sp.example.com/saml/metadata\"", body);
        Assert.Contains($"Binding=\"{Saml.PostBinding}\" Location=\"https://sp.example.com/saml/acs\"", body);
    }
}
