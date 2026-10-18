using System.IO.Compression;
using System.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Web;
using System.Xml;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public sealed record ResponseOptions(string InResponseTo, DateTimeOffset Now)
{
    public string NameId { get; init; } = "ada@example.com";
    public Dictionary<string, string[]>? Attributes { get; init; }
    public string Issuer { get; init; } = "https://idp.example.com/saml";
    public string Audience { get; init; } = "https://sp.example.com/saml/metadata";
    public string Recipient { get; init; } = "https://sp.example.com/saml/acs"; // used for both Destination and Recipient
    public TimeSpan Lifetime { get; init; } = TimeSpan.FromMinutes(5);
}

/// <summary>
/// A tiny identity provider for the tests. It makes its own RSA key and self-signed certificate in memory, reads
/// AuthnRequests, and builds and signs SAML Responses.
/// </summary>
public sealed class TestIdp
{
    private readonly RSA _key = RSA.Create(2048);
    public X509Certificate2 Certificate { get; }

    public TestIdp(string commonName = "idp.example.com")
    {
        var request = new CertificateRequest($"CN={commonName}", _key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        // Self-signed: SAML trusts this exact certificate, not a CA.
        Certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(365));
    }

    /// <summary>Decodes the AuthnRequest from the SP's redirect, as the IdP does: Base64, then raw INFLATE.</summary>
    public static XmlElement AuthnRequestFrom(Uri location)
    {
        var encoded = HttpUtility.ParseQueryString(location.Query)["SAMLRequest"]!;
        using var inflate = new DeflateStream(new MemoryStream(Convert.FromBase64String(encoded)), CompressionMode.Decompress);
        var doc = new XmlDocument();
        doc.Load(inflate);
        return doc.DocumentElement!;
    }

    private static string Esc(string s) => SecurityElement.Escape(s);

    public static string ResponseXml(ResponseOptions o)
    {
        var attributes = o.Attributes ?? new() { ["email"] = [o.NameId], ["name"] = ["Ada Lovelace"], ["groups"] = ["engineering"] };
        var issued = Saml.Instant(o.Now);
        var expires = Saml.Instant(o.Now + o.Lifetime);
        var attributeXml = string.Concat(attributes.Select(a =>
            $"""<saml:Attribute Name="{Esc(a.Key)}">""" +
            string.Concat(a.Value.Select(v => $"<saml:AttributeValue>{Esc(v)}</saml:AttributeValue>")) +
            "</saml:Attribute>"));
        return
            $"""<samlp:Response xmlns:samlp="{Saml.Protocol}" xmlns:saml="{Saml.Assertion}" ID="{Saml.NewId()}" Version="2.0" IssueInstant="{issued}" Destination="{Esc(o.Recipient)}" InResponseTo="{Esc(o.InResponseTo)}">""" +
            $"<saml:Issuer>{Esc(o.Issuer)}</saml:Issuer>" +
            $"""<samlp:Status><samlp:StatusCode Value="{Saml.Success}"/></samlp:Status>""" +
            $"""<saml:Assertion ID="{Saml.NewId()}" Version="2.0" IssueInstant="{issued}">""" +
            $"<saml:Issuer>{Esc(o.Issuer)}</saml:Issuer>" +
            "<saml:Subject>" +
            $"""<saml:NameID Format="{Saml.EmailFormat}">{Esc(o.NameId)}</saml:NameID>""" +
            $"""<saml:SubjectConfirmation Method="{Saml.Bearer}">""" +
            $"""<saml:SubjectConfirmationData InResponseTo="{Esc(o.InResponseTo)}" Recipient="{Esc(o.Recipient)}" NotOnOrAfter="{expires}"/>""" +
            "</saml:SubjectConfirmation>" +
            "</saml:Subject>" +
            $"""<saml:Conditions NotBefore="{issued}" NotOnOrAfter="{expires}">""" +
            $"<saml:AudienceRestriction><saml:Audience>{Esc(o.Audience)}</saml:Audience></saml:AudienceRestriction>" +
            "</saml:Conditions>" +
            $"""<saml:AuthnStatement AuthnInstant="{issued}" SessionIndex="{Saml.NewId()}">""" +
            "<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>" +
            "</saml:AuthnStatement>" +
            $"<saml:AttributeStatement>{attributeXml}</saml:AttributeStatement>" +
            "</saml:Assertion>" +
            "</samlp:Response>";
    }

    /// <summary>
    /// Signs the assertion the way IdPs do: enveloped, exclusive canonicalization, RSA-SHA256 (or SHA-1, as old IdPs
    /// did), after its Issuer.
    /// </summary>
    public string Sign(string xml, bool sha1 = false)
    {
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.LoadXml(xml);
        var assertion = (XmlElement)doc.GetElementsByTagName("Assertion", Saml.Assertion)[0]!;
        var signedXml = new SignedXml(doc) { SigningKey = _key };
        signedXml.SignedInfo!.CanonicalizationMethod = SignedXml.XmlDsigExcC14NTransformUrl;
        signedXml.SignedInfo.SignatureMethod = sha1 ? SignedXml.XmlDsigRSASHA1Url : SignedXml.XmlDsigRSASHA256Url;
        var reference = new Reference("#" + assertion.GetAttribute("ID")) { DigestMethod = sha1 ? SignedXml.XmlDsigSHA1Url : SignedXml.XmlDsigSHA256Url };
        reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        reference.AddTransform(new XmlDsigExcC14NTransform());
        signedXml.AddReference(reference);
        // The certificate goes into KeyInfo; the SP must ignore it and use the certificate from metadata.
        signedXml.KeyInfo = new KeyInfo();
        signedXml.KeyInfo.AddClause(new KeyInfoX509Data(Certificate));
        signedXml.ComputeSignature();
        assertion.InsertAfter(doc.ImportNode(signedXml.GetXml(), true), assertion.GetElementsByTagName("Issuer", Saml.Assertion)[0]);
        return doc.OuterXml;
    }

    public string SignedResponse(ResponseOptions o, bool sha1 = false) => Sign(ResponseXml(o), sha1);
}
