using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Text;
using System.Xml;

public sealed class SamlException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>What the assertion says, once every check has passed.</summary>
public sealed record Login(string AssertionId, string InResponseTo, DateTimeOffset NotOnOrAfter, string NameId, Dictionary<string, string[]> Attributes);

/// <summary>
/// Everything a service provider must check in a SAML Response before it believes a word of it. The checks that need
/// memory (replay, InResponseTo) are in Program.cs; these need only the message and the clock.
/// </summary>
public static class ResponseValidator
{
    public static readonly TimeSpan ClockSkew = TimeSpan.FromMinutes(1); // clocks may be a minute apart, no more

    private static SamlException Fail(string message) => new(401, message);

    private static IEnumerable<XmlElement> Children(XmlElement? el, string ns, string name) =>
        el?.ChildNodes.OfType<XmlElement>().Where(e => e.NamespaceURI == ns && e.LocalName == name) ?? [];
    private static XmlElement? Child(XmlElement? el, string ns, string name) => Children(el, ns, name).FirstOrDefault();
    private static string Text(XmlElement? el) => el?.InnerText.Trim() ?? ""; // InnerText joins every text node, skipping comments
    private static DateTimeOffset? Time(XmlElement? el, string attribute)
    {
        try { return el?.GetAttribute(attribute) is { Length: > 0 } value ? XmlConvert.ToDateTimeOffset(value) : null; }
        catch (FormatException) { return null; } // unreadable counts as absent
    }

    private static XmlDocument Parse(string samlResponse)
    {
        try
        {
            var xml = Encoding.UTF8.GetString(Convert.FromBase64String(samlResponse));
            // No DTDs, no external resolver: SAML never needs them, and they enable XXE and "billion laughs".
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
            var doc = new XmlDocument { PreserveWhitespace = true, XmlResolver = null };
            using var reader = XmlReader.Create(new StringReader(xml), settings);
            doc.Load(reader);
            return doc;
        }
        catch (Exception e) when (e is FormatException or XmlException)
        {
            throw new SamlException(400, "Malformed SAML response.");
        }
    }

    /// <summary>
    /// Checks the XML signature on the assertion with the IdP's certificate. SignedXml finds the element a reference
    /// points to by ID and refuses an ID that appears twice; the checks here make sure that element is this assertion.
    /// </summary>
    private static void VerifySignature(XmlDocument doc, XmlElement assertion, X509Certificate2 idpCert)
    {
        var id = assertion.GetAttribute("ID");
        var signatures = Children(assertion, SignedXml.XmlDsigNamespaceUrl, "Signature").ToList();
        if (id == "" || signatures.Count != 1) throw Fail("Invalid signature.");
        var signedXml = new SignedXml(doc);
        try
        {
            signedXml.LoadXml(signatures[0]);
            var references = signedXml.SignedInfo!.References.Cast<Reference>().ToList();
            var expected =
                signedXml.SignatureMethod == SignedXml.XmlDsigRSASHA256Url && // no SHA-1
                signedXml.SignedInfo.CanonicalizationMethod == SignedXml.XmlDsigExcC14NTransformUrl && // exclusive c14n
                references.Count == 1 &&
                references[0].Uri == "#" + id && // the one reference is this very assertion
                references[0].DigestMethod == SignedXml.XmlDsigSHA256Url &&
                references[0].TransformChain.Count == 2 &&
                references[0].TransformChain[0].Algorithm == SignedXml.XmlDsigEnvelopedSignatureTransformUrl &&
                references[0].TransformChain[1].Algorithm == SignedXml.XmlDsigExcC14NTransformUrl;
            // CheckSignature(certificate, true) uses this certificate's key: the one from the IdP's metadata. It ignores
            // any certificate inside the message's KeyInfo, which an attacker can choose.
            if (!expected || !signedXml.CheckSignature(idpCert, verifySignatureOnly: true)) throw Fail("Invalid signature.");
            if (signedXml.GetIdElement(doc, id) != assertion) throw Fail("Invalid signature.");
        }
        catch (CryptographicException)
        {
            throw Fail("Invalid signature."); // a malformed signature, or a reference that resolves to two elements
        }
    }

    public static Login Validate(string samlResponse, SamlSettings s, DateTimeOffset now)
    {
        var doc = Parse(samlResponse);
        var response = doc.DocumentElement;
        if (response is null || response.NamespaceURI != Saml.Protocol || response.LocalName != "Response")
            throw new SamlException(400, "Malformed SAML response.");

        // 1. The IdP must report success (a failed sign-in comes back as a Response too).
        var status = Child(Child(response, Saml.Protocol, "Status"), Saml.Protocol, "StatusCode");
        if (status?.GetAttribute("Value") != Saml.Success) throw Fail("The identity provider did not report success.");

        // 2. Exactly one assertion in the whole document, directly inside the Response. A second, hidden one is how
        //    signature wrapping works: the signature covers one assertion while a naive reader reads the other.
        var found = doc.GetElementsByTagName("Assertion", Saml.Assertion).OfType<XmlElement>()
            .Concat(doc.GetElementsByTagName("EncryptedAssertion", Saml.Assertion).OfType<XmlElement>()).ToList();
        if (found.Count != 1 || found[0].ParentNode != response) throw Fail("The response must contain exactly one assertion.");
        var assertion = found[0];

        // 3. The signature over this assertion. Everything below reads only from inside it.
        VerifySignature(doc, assertion, s.IdpCert);

        // 4. Issued by the IdP we trust.
        if (Text(Child(assertion, Saml.Assertion, "Issuer")) != s.IdpEntityId) throw Fail("Wrong issuer.");

        // 5. About someone, confirmed by bearer: whoever presents it at the right address, before it expires.
        var subject = Child(assertion, Saml.Assertion, "Subject");
        var nameId = Text(Child(subject, Saml.Assertion, "NameID"));
        var bearer = Children(subject, Saml.Assertion, "SubjectConfirmation").FirstOrDefault(c => c.GetAttribute("Method") == Saml.Bearer);
        var data = Child(bearer, Saml.Assertion, "SubjectConfirmationData");
        if (nameId == "" || data is null) throw Fail("The assertion has no bearer subject.");

        // 6. Sent to our ACS URL. Compare with your configured public URL, never with the Host header of this request.
        var destination = response.GetAttribute("Destination");
        if (data.GetAttribute("Recipient") != s.AcsUrl || (destination != "" && destination != s.AcsUrl)) throw Fail("Wrong recipient.");

        // 7. Meant for us: every AudienceRestriction must name our entity ID.
        var conditions = Child(assertion, Saml.Assertion, "Conditions");
        var restrictions = Children(conditions, Saml.Assertion, "AudienceRestriction").ToList();
        if (restrictions.Count == 0 || !restrictions.All(r => Children(r, Saml.Assertion, "Audience").Any(a => Text(a) == s.SpEntityId)))
            throw Fail("Wrong audience.");

        // 8. Inside its validity window, with a little clock skew. The earliest NotOnOrAfter wins; none at all is expired.
        if (Time(conditions, "NotBefore") is { } notBefore && now + ClockSkew < notBefore) throw Fail("The assertion is not valid yet.");
        if (Time(data, "NotOnOrAfter") is not { } notOnOrAfter) throw Fail("The assertion has expired.");
        if (Time(conditions, "NotOnOrAfter") is { } conditionsEnd && conditionsEnd < notOnOrAfter) notOnOrAfter = conditionsEnd;
        if (now - ClockSkew >= notOnOrAfter) throw Fail("The assertion has expired.");

        // 9. An answer to a request: the signed InResponseTo, which the unsigned Response must not contradict.
        var inResponseTo = data.GetAttribute("InResponseTo");
        var outer = response.GetAttribute("InResponseTo");
        if (inResponseTo == "" || (outer != "" && outer != inResponseTo)) throw Fail("InResponseTo does not match a pending request.");

        // A loop, not ToDictionary: an attribute name that appears twice must not throw (the last one wins, as in Node.js and Python).
        var attributes = new Dictionary<string, string[]>();
        foreach (var a in Children(assertion, Saml.Assertion, "AttributeStatement").SelectMany(st => Children(st, Saml.Assertion, "Attribute")))
            attributes[a.GetAttribute("Name")] = Children(a, Saml.Assertion, "AttributeValue").Select(Text).ToArray();
        return new Login(assertion.GetAttribute("ID"), inResponseTo, notOnOrAfter, nameId, attributes);
    }
}
