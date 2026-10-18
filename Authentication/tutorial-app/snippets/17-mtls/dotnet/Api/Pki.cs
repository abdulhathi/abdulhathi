using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

/// <summary>
/// A small certificate authority for the lab, made with CertificateRequest. Files go into the folder you pass, normally a
/// temporary one, so private keys never go near the repository. name.crt is a certificate (public); name.key.pem is
/// its private key.
/// </summary>
public static class Pki
{
    public const string ServerAuth = "1.3.6.1.5.5.7.3.1"; // extended key usage: may act as a TLS server
    public const string ClientAuth = "1.3.6.1.5.5.7.3.2"; // extended key usage: may act as a TLS client

    /// <summary>A self-signed certificate authority: the only thing allowed to vouch for clients.</summary>
    public static X509Certificate2 CreateCa(string commonName)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest($"CN={commonName}", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, true, 0, critical: true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, critical: true));
        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, critical: false));
        using var cert = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(30));
        return Reload(cert);
    }

    /// <summary>
    /// A certificate signed by the CA, for a server (with its host names) or for a client. The tests' odd certificates
    /// pass a whole <paramref name="subject"/> instead of just a CN, or validity dates of their choice.
    /// </summary>
    public static X509Certificate2 Issue(X509Certificate2 ca, string commonName, bool server = false,
        string? subject = null, DateTimeOffset? notBefore = null, DateTimeOffset? notAfter = null)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest(subject ?? $"CN={commonName}", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, critical: true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, critical: true));
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension([new Oid(server ? ServerAuth : ClientAuth)], critical: false));
        request.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(request.PublicKey, critical: false));
        request.CertificateExtensions.Add(X509AuthorityKeyIdentifierExtension.CreateFromCertificate(ca, true, false));
        if (server)
        {
            var names = new SubjectAlternativeNameBuilder();
            names.AddDnsName("localhost");
            names.AddIpAddress(IPAddress.Loopback);
            request.CertificateExtensions.Add(names.Build());
        }
        var end = notAfter ?? DateTimeOffset.UtcNow.AddDays(30);
        // Create() refuses dates outside the CA's own validity, so the end is clipped to the CA's.
        using var cert = request.Create(ca, notBefore ?? DateTimeOffset.UtcNow.AddMinutes(-5), end < ca.NotAfter ? end : ca.NotAfter, RandomNumberGenerator.GetBytes(16));
        using var withKey = cert.CopyWithPrivateKey(key);
        return Reload(withKey);
    }

    /// <summary>
    /// True when the certificate chains to this CA (and no other) and may be used for the given purpose. Revocation is
    /// not checked: this lab's CA publishes no revocation list (see the chapter on rotation and revocation).
    /// </summary>
    public static bool ChainsTo(X509Certificate2 certificate, X509Certificate2 ca, string purpose)
    {
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(ca);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        chain.ChainPolicy.ApplicationPolicy.Add(new Oid(purpose));
        return chain.Build(certificate);
    }

    // A round trip through PKCS#12 gives a certificate whose private key TLS can use on every OS (macOS needs it).
    private static X509Certificate2 Reload(X509Certificate2 cert) =>
        X509CertificateLoader.LoadPkcs12(cert.Export(X509ContentType.Pkcs12), null, X509KeyStorageFlags.Exportable);

    public static void Save(string folder, string name, X509Certificate2 cert)
    {
        File.WriteAllText(Path.Combine(folder, $"{name}.crt"), cert.ExportCertificatePem());
        File.WriteAllText(Path.Combine(folder, $"{name}.key.pem"), cert.GetECDsaPrivateKey()!.ExportPkcs8PrivateKeyPem());
    }

    public static X509Certificate2 Load(string folder, string name) =>
        Reload(X509Certificate2.CreateFromPemFile(Path.Combine(folder, $"{name}.crt"), Path.Combine(folder, $"{name}.key.pem")));

    public static X509Certificate2 LoadCertificate(string folder, string name) =>
        X509Certificate2.CreateFromPem(File.ReadAllText(Path.Combine(folder, $"{name}.crt")));

    /// <summary>Everything the lab uses, made once per folder. The same files work with the Node.js and Python servers.</summary>
    public static void CreateLabCertificates(string folder)
    {
        if (File.Exists(Path.Combine(folder, "stranger.crt"))) return;
        if (OperatingSystem.IsWindows()) Directory.CreateDirectory(folder); // the temp folder is already yours alone
        else Directory.CreateDirectory(folder, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute); // only you can read the keys
        using var ca = CreateCa("Auth Lab CA");
        using var otherCa = CreateCa("Some Other CA");
        Save(folder, "ca", ca);
        Save(folder, "server", Issue(ca, "localhost", server: true));
        Save(folder, "client", Issue(ca, "billing-service")); // registered with the API
        Save(folder, "unknown", Issue(ca, "reports-service")); // signed by our CA, but not registered
        Save(folder, "other-ca", otherCa);
        Save(folder, "stranger", Issue(otherCa, "billing-service")); // a registered name, from the wrong CA
    }
}
