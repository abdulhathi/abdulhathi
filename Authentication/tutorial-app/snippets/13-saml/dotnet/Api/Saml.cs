using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

/// <summary>
/// The service provider's settings. The IdP's values come from the IdP's metadata; yours go into the IdP's
/// configuration for your app.
/// </summary>
/// <param name="SpEntityId">Who we are: the Audience the IdP must name in every assertion meant for us.</param>
/// <param name="AcsUrl">Where the IdP posts responses: the Destination and Recipient it must use.</param>
/// <param name="IdpEntityId">The only Issuer we accept.</param>
/// <param name="IdpSsoUrl">Where we send the browser to sign in.</param>
/// <param name="IdpCert">The IdP's signing certificate, from its metadata, never from the message.</param>
public sealed record SamlSettings(string SpEntityId, string AcsUrl, string IdpEntityId, string IdpSsoUrl, X509Certificate2 IdpCert)
{
    public static SamlSettings Example(X509Certificate2 idpCert) => new(
        "https://sp.example.com/saml/metadata",
        "https://sp.example.com/saml/acs",
        "https://idp.example.com/saml",
        "https://idp.example.com/saml/sso",
        idpCert);
}

/// <summary>SAML 2.0 names, and the two documents the SP sends out: the AuthnRequest and its metadata.</summary>
public static class Saml
{
    public const string Protocol = "urn:oasis:names:tc:SAML:2.0:protocol"; // samlp: messages (AuthnRequest, Response)
    public const string Assertion = "urn:oasis:names:tc:SAML:2.0:assertion"; // saml: the signed statement about the user
    public const string Metadata = "urn:oasis:names:tc:SAML:2.0:metadata"; // md: who is who, and at which URLs
    public const string PostBinding = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
    public const string EmailFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";
    public const string Success = "urn:oasis:names:tc:SAML:2.0:status:Success";
    public const string Bearer = "urn:oasis:names:tc:SAML:2.0:cm:bearer";

    /// <summary>A SAML ID is an XML name, so it must not start with a digit: "_" and 160 random bits.</summary>
    public static string NewId() => "_" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(20));

    /// <summary>SAML times are UTC xs:dateTime values: 2026-10-17T12:00:00Z.</summary>
    public static string Instant(DateTimeOffset t) => t.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    public static string AuthnRequest(SamlSettings s, string id, DateTimeOffset now) =>
        $"""<samlp:AuthnRequest xmlns:samlp="{Protocol}" xmlns:saml="{Assertion}" ID="{id}" Version="2.0" """ +
        $"""IssueInstant="{Instant(now)}" Destination="{s.IdpSsoUrl}" AssertionConsumerServiceURL="{s.AcsUrl}" """ +
        $"""ProtocolBinding="{PostBinding}">""" +
        $"""<saml:Issuer>{s.SpEntityId}</saml:Issuer>""" +
        $"""<samlp:NameIDPolicy Format="{EmailFormat}" AllowCreate="true"/>""" +
        "</samlp:AuthnRequest>";

    /// <summary>HTTP-Redirect binding: raw DEFLATE, then Base64, then URL-encode it as the SAMLRequest query parameter.</summary>
    public static string RedirectUrl(SamlSettings s, string requestXml)
    {
        using var output = new MemoryStream();
        using (var deflate = new DeflateStream(output, CompressionLevel.Optimal)) // DeflateStream writes raw DEFLATE
            deflate.Write(Encoding.UTF8.GetBytes(requestXml));
        return $"{s.IdpSsoUrl}?SAMLRequest={Uri.EscapeDataString(Convert.ToBase64String(output.ToArray()))}";
    }

    /// <summary>What the IdP's administrator needs to register this service provider.</summary>
    public static string SpMetadata(SamlSettings s) => string.Join("\n",
        $"""<md:EntityDescriptor xmlns:md="{Metadata}" entityID="{s.SpEntityId}">""",
        $"""  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="{Protocol}">""",
        $"""    <md:NameIDFormat>{EmailFormat}</md:NameIDFormat>""",
        $"""    <md:AssertionConsumerService Binding="{PostBinding}" Location="{s.AcsUrl}" index="0" isDefault="true"/>""",
        "  </md:SPSSODescriptor>",
        "</md:EntityDescriptor>");
}
