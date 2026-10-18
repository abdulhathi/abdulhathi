using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Text.Json;
using System.Xml;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

public class AcsTests : IClassFixture<WebApplicationFactory<Program>>
{
    // The tests play the IdP: they hold its private key, and the app trusts only its certificate.
    private static readonly TestIdp Idp = new();
    private static readonly TestIdp OtherIdp = new("attacker.example.com");
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public AcsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.AddSingleton(SamlSettings.Example(Idp.Certificate));
            services.AddSingleton<TimeProvider>(_clock);
        }));
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    /// <summary>Starts a sign-in at the SP and returns the ID of the AuthnRequest it sent.</summary>
    private async Task<string> StartLogin()
    {
        var res = await _client.GetAsync("/saml/login");
        return TestIdp.AuthnRequestFrom(res.Headers.Location!).GetAttribute("ID");
    }

    /// <summary>What the IdP sends back for a fresh sign-in, signed by the IdP unless another one is given.</summary>
    private async Task<string> Respond(Func<ResponseOptions, ResponseOptions>? change = null, TestIdp? signer = null)
    {
        var options = new ResponseOptions(await StartLogin(), _clock.Now);
        return (signer ?? Idp).SignedResponse(change is null ? options : change(options));
    }

    /// <summary>The browser's auto-submitted form: SAMLResponse is the Base64 of the XML.</summary>
    private Task<HttpResponseMessage> Post(string xml) =>
        _client.PostAsync("/saml/acs", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["SAMLResponse"] = Convert.ToBase64String(Encoding.UTF8.GetBytes(xml)),
        }));

    private async Task AssertRefused(string xml, string error)
    {
        var res = await Post(xml);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(JsonSerializer.Serialize(new { error }), await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_valid_response_signs_the_user_in_mapped_from_NameID_and_attributes()
    {
        var res = await Post(await Respond());
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"nameId":"ada@example.com","email":"ada@example.com","name":"Ada Lovelace","groups":["engineering"]}""",
            await res.Content.ReadAsStringAsync());
        var stored = _factory.Services.GetRequiredService<UserDirectory>().Find("https://idp.example.com/saml", "ada@example.com");
        Assert.Equal("Ada Lovelace", stored?.Name);
    }

    [Fact]
    public async Task A_response_signed_with_another_key_is_refused() =>
        await AssertRefused(await Respond(signer: OtherIdp), "Invalid signature.");

    [Fact]
    public async Task Changing_a_signed_attribute_breaks_the_signature()
    {
        var xml = await Respond();
        var tampered = xml.Replace("<saml:AttributeValue>engineering</saml:AttributeValue>", "<saml:AttributeValue>admins</saml:AttributeValue>");
        Assert.NotEqual(xml, tampered);
        await AssertRefused(tampered, "Invalid signature.");
    }

    [Fact]
    public async Task An_assertion_signed_with_SHA1_is_refused_even_with_the_right_key() =>
        await AssertRefused(Idp.SignedResponse(new ResponseOptions(await StartLogin(), _clock.Now), sha1: true), "Invalid signature.");

    [Fact]
    public async Task An_assertion_from_another_issuer_is_refused() =>
        await AssertRefused(await Respond(o => o with { Issuer = "https://other-idp.example.com/saml" }), "Wrong issuer.");

    [Fact]
    public async Task An_assertion_for_another_service_provider_is_refused() =>
        await AssertRefused(await Respond(o => o with { Audience = "https://other-sp.example.com/saml/metadata" }), "Wrong audience.");

    [Fact]
    public async Task A_response_for_another_ACS_URL_is_refused() =>
        await AssertRefused(await Respond(o => o with { Recipient = "https://other-sp.example.com/saml/acs" }), "Wrong recipient.");

    [Fact]
    public async Task An_expired_assertion_is_refused()
    {
        var xml = await Respond(); // valid for 5 minutes
        _clock.Now += TimeSpan.FromMinutes(10);
        await AssertRefused(xml, "The assertion has expired.");
    }

    [Fact]
    public async Task An_assertion_that_is_not_valid_yet_is_refused() =>
        // Issued five minutes ahead of our clock: more than the one minute of skew we allow.
        await AssertRefused(await Respond(o => o with { Now = _clock.Now.AddMinutes(5) }), "The assertion is not valid yet.");

    [Fact]
    public async Task The_same_assertion_cannot_be_used_twice()
    {
        var xml = await Respond();
        Assert.Equal(HttpStatusCode.OK, (await Post(xml)).StatusCode);
        await AssertRefused(xml, "This assertion was already used.");
    }

    [Fact]
    public async Task A_response_to_a_request_the_SP_never_sent_is_refused() =>
        await AssertRefused(Idp.SignedResponse(new ResponseOptions("_never-sent", _clock.Now)), "InResponseTo does not match a pending request.");

    [Fact]
    public async Task A_wrapped_assertion_is_refused()
    {
        // The attacker has a real, signed assertion for their own account. They add a forged copy for someone else in
        // front of it. The signature still verifies (it covers the original), and a naive SP reads the first assertion.
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.LoadXml(await Respond(o => o with { NameId = "mallory@example.com" }));
        var signed = (XmlElement)doc.GetElementsByTagName("Assertion", Saml.Assertion)[0]!;
        var forged = (XmlElement)signed.CloneNode(true);
        forged.SetAttribute("ID", "_forged");
        forged.RemoveChild(forged.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl)[0]!);
        forged.GetElementsByTagName("NameID", Saml.Assertion)[0]!.InnerText = "admin@example.com";
        doc.DocumentElement!.InsertBefore(forged, signed);
        await AssertRefused(doc.OuterXml, "The response must contain exactly one assertion.");
    }

    [Fact]
    public async Task A_signed_assertion_hidden_inside_the_signature_is_refused()
    {
        // A deeper variant: the forged assertion takes the signed one's place and carries its signature, and the signed
        // assertion moves into a ds:Object inside that signature. The reference still finds it there, so the signature
        // verifies. Counting every Assertion at any depth, not only the Response's children, stops it.
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.LoadXml(await Respond(o => o with { NameId = "mallory@example.com" }));
        var signed = (XmlElement)doc.GetElementsByTagName("Assertion", Saml.Assertion)[0]!;
        var forged = (XmlElement)signed.CloneNode(true);
        forged.SetAttribute("ID", "_forged");
        forged.GetElementsByTagName("NameID", Saml.Assertion)[0]!.InnerText = "admin@example.com";
        doc.DocumentElement!.ReplaceChild(forged, signed);
        signed.RemoveChild(signed.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl)[0]!); // the enveloped transform removed it anyway
        var obj = doc.CreateElement("ds", "Object", SignedXml.XmlDsigNamespaceUrl);
        obj.AppendChild(signed);
        forged.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl)[0]!.AppendChild(obj);
        await AssertRefused(doc.OuterXml, "The response must contain exactly one assertion.");
    }

    [Fact]
    public async Task A_response_with_a_DTD_is_refused_before_anything_else()
    {
        // An external entity would make a careless parser read a file from the server into the NameID (XXE).
        var xml = (await Respond())
            .Replace("<samlp:Response", """<!DOCTYPE samlp:Response [<!ENTITY name SYSTEM "file:///etc/passwd">]><samlp:Response""")
            .Replace(">ada@example.com</saml:NameID>", ">&name;</saml:NameID>");
        var res = await Post(xml);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("""{"error":"Malformed SAML response."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_comment_inside_the_NameID_cannot_shorten_it()
    {
        // Canonicalization drops comments, so the signature still verifies. A reader that takes only the first text node
        // (FirstChild.Value) would see "ada@example.com"; InnerText joins every text node and gives the whole value.
        var xml = await Respond(o => o with { NameId = "ada@example.com.evil.example" });
        var injected = xml.Replace(">ada@example.com.evil.example</saml:NameID>", ">ada@example.com<!---->.evil.example</saml:NameID>");
        Assert.NotEqual(xml, injected);
        var res = await Post(injected);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("ada@example.com.evil.example", (await res.Content.ReadFromJsonAsync<SamlUser>())!.NameId);
    }
}
