using System.Net;
using System.Net.Http.Json;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Builder;

/// <summary>A fresh CA and certificates (in memory), and the real Kestrel server on a free port, shared by the tests.</summary>
public sealed class MtlsServer : IAsyncLifetime
{
    public X509Certificate2 Ca { get; } = Pki.CreateCa("Auth Lab CA");
    public X509Certificate2 Client { get; private set; } = null!;
    public X509Certificate2 Unknown { get; private set; } = null!;
    public X509Certificate2 Stranger { get; private set; } = null!;
    public X509Certificate2 Renewed { get; private set; } = null!;
    public X509Certificate2 Expired { get; private set; } = null!;
    public X509Certificate2 ServerOnly { get; private set; } = null!;
    public X509Certificate2 NoCommonName { get; private set; } = null!;
    public Uri BaseAddress { get; private set; } = null!;
    private WebApplication _app = null!;

    public async Task InitializeAsync()
    {
        Client = Pki.Issue(Ca, "billing-service");
        Unknown = Pki.Issue(Ca, "reports-service");
        Stranger = Pki.Issue(Pki.CreateCa("Some Other CA"), "billing-service");
        Renewed = Pki.Issue(Ca, "billing-service"); // the same client's next certificate
        var now = DateTimeOffset.UtcNow;
        Expired = Pki.Issue(Ca, "billing-service", notBefore: now.AddMinutes(-3), notAfter: now.AddMinutes(-1));
        ServerOnly = Pki.Issue(Ca, "billing-service", server: true); // our CA and a registered name, but made for servers
        NoCommonName = Pki.Issue(Ca, "billing-service", subject: "O=billing-service"); // the name, but not as a CN
        _app = Program.CreateApp([], Ca, Pki.Issue(Ca, "localhost", server: true), Program.KnownClients, port: 0);
        await _app.StartAsync();
        BaseAddress = new Uri(_app.Urls.First());
    }

    public async Task DisposeAsync() => await _app.DisposeAsync();

    /// <summary>An HttpClient that trusts our CA for the server and presents the given certificate, if any.</summary>
    public HttpClient ClientWith(X509Certificate2? identity)
    {
        var handler = new SocketsHttpHandler();
        // Always offer this certificate. By default .NET only offers one whose issuer is on the server's list of
        // acceptable CAs (when the server sends a list), which would turn the "another CA" test into a "no certificate" one.
        if (identity is not null) handler.SslOptions.LocalCertificateSelectionCallback = (_, _, _, _, _) => identity;
        handler.SslOptions.RemoteCertificateValidationCallback = (_, certificate, _, errors) =>
            certificate is X509Certificate2 server && Pki.ChainsTo(server, Ca, Pki.ServerAuth) &&
            (errors & ~SslPolicyErrors.RemoteCertificateChainErrors) == SslPolicyErrors.None; // the host name must match
        return new HttpClient(handler) { BaseAddress = BaseAddress };
    }
}

public class MtlsTests(MtlsServer server) : IClassFixture<MtlsServer>
{
    private static string Fingerprint(X509Certificate2 cert) => Convert.ToHexStringLower(cert.GetCertHash(HashAlgorithmName.SHA256));

    private record Caller(string Client, string[] Scopes, string Fingerprint);

    [Fact]
    public async Task A_client_with_a_certificate_from_our_CA_is_identified()
    {
        var res = await server.ClientWith(server.Client).GetAsync("/whoami");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal($$"""{"client":"billing-service","scopes":["invoices:read"],"fingerprint":"{{Fingerprint(server.Client)}}"}""",
            await res.Content.ReadAsStringAsync());
    }

    /// <summary>
    /// The server ends the handshake with a TLS alert or by closing (or resetting) the connection; no HTTP response comes
    /// back. A server that is not running at all gives ConnectionError instead, so this cannot pass by accident.
    /// </summary>
    private async Task AssertRefusedInHandshake(X509Certificate2? identity)
    {
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => server.ClientWith(identity).GetAsync("/whoami"));
        Assert.NotEqual(HttpRequestError.ConnectionError, error.HttpRequestError);
    }

    [Fact]
    public Task A_client_without_a_certificate_is_refused_during_the_handshake() => AssertRefusedInHandshake(null);

    [Fact]
    public Task A_certificate_from_another_CA_is_refused_even_with_a_registered_name() => AssertRefusedInHandshake(server.Stranger);

    [Fact]
    public Task An_expired_certificate_from_our_CA_is_refused() => AssertRefusedInHandshake(server.Expired);

    // Our CA and a registered name, but its extended key usage says serverAuth only.
    [Fact]
    public Task A_certificate_made_for_servers_not_clients_is_refused() => AssertRefusedInHandshake(server.ServerOnly);

    [Fact]
    public async Task A_valid_certificate_that_is_not_registered_gets_403()
    {
        var res = await server.ClientWith(server.Unknown).GetAsync("/whoami");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("""{"error":"Unknown client certificate."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_certificate_without_a_common_name_gets_403()
    {
        // O=billing-service is not CN=billing-service. Some APIs fall back to other fields when there is no CN; here no
        // CN (or more than one) means an unknown client.
        var res = await server.ClientWith(server.NoCommonName).GetAsync("/whoami");
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("""{"error":"Unknown client certificate."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_renewed_certificate_for_the_same_client_is_accepted()
    {
        var res = await server.ClientWith(server.Renewed).GetAsync("/whoami");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var caller = await res.Content.ReadFromJsonAsync<Caller>();
        Assert.Equal("billing-service", caller!.Client);
        Assert.NotEqual(Fingerprint(server.Client), Fingerprint(server.Renewed));
        Assert.Equal(Fingerprint(server.Renewed), caller.Fingerprint);
    }
}
