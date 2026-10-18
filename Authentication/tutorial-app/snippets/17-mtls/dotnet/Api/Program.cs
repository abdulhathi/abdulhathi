using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Authentication.Certificate;
using Microsoft.AspNetCore.Server.Kestrel.Https;

// Certificates live in a temporary folder (made on first start), never in the project.
var folder = Environment.GetEnvironmentVariable("CERTS_DIR") is { Length: > 0 } dir ? dir : Path.Combine(Path.GetTempPath(), "auth-lab-mtls");
Pki.CreateLabCertificates(folder);
var port = int.Parse(Environment.GetEnvironmentVariable("PORT") ?? "3000");
var app = Program.CreateApp(args, Pki.LoadCertificate(folder, "ca"), Pki.Load(folder, "server"), Program.KnownClients, port);
Console.WriteLine($"Listening on https://localhost:{port} (certificates in {folder})");
app.Run();

public partial class Program
{
    /// <summary>Registered clients: the certificate's subject common name, and what that client may do.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> KnownClients = new Dictionary<string, string[]>
    {
        ["billing-service"] = ["invoices:read"],
    };

    // The tests call this too, with their own certificates and port 0: WebApplicationFactory's in-memory TestServer
    // has no TLS at all, so mutual TLS can only be tested against real Kestrel.
    public static WebApplication CreateApp(string[] args, X509Certificate2 ca, X509Certificate2 serverCert, IReadOnlyDictionary<string, string[]> clients, int port)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.WebHost.ConfigureKestrel(kestrel => kestrel.Listen(IPAddress.Loopback, port, listen => listen.UseHttps(https =>
        {
            https.ServerCertificate = serverCert; // the server's own certificate: clients check this, as with any HTTPS site
            https.ClientCertificateMode = ClientCertificateMode.RequireCertificate; // end the handshake if the client sends none
            // and if the one it sends was not signed by our CA (by default Kestrel would trust the machine's CAs instead).
            https.ClientCertificateValidation = (certificate, _, _) => Pki.ChainsTo(certificate, ca, Pki.ClientAuth);
        })));

        // The certificate handler checks the chain again and turns the certificate into a signed-in user.
        builder.Services.AddAuthentication(CertificateAuthenticationDefaults.AuthenticationScheme)
            .AddCertificate(options =>
            {
                options.AllowedCertificateTypes = CertificateTypes.Chained;
                options.ChainTrustValidationMode = X509ChainTrustMode.CustomRootTrust;
                options.CustomTrustStore.Add(ca);
                options.RevocationMode = X509RevocationMode.NoCheck; // this lab's CA publishes no revocation list
                options.Events = new CertificateAuthenticationEvents
                {
                    OnCertificateValidated = context =>
                    {
                        var cert = context.ClientCertificate;
                        // The subject's common name. Not GetNameInfo(SimpleName): with no CN it falls back to other
                        // fields such as O, and with two CNs it picks one. No CN, or several, is ambiguous: unknown.
                        var commonNames = cert.SubjectName.EnumerateRelativeDistinguishedNames()
                            .Where(rdn => !rdn.HasMultipleElements && rdn.GetSingleElementType().Value == "2.5.4.3")
                            .Select(rdn => rdn.GetSingleElementValue())
                            .ToList();
                        var name = commonNames is [{ } single] ? single : "";
                        // Signed by our CA but not registered: we know it is genuine, we just have not agreed to serve it.
                        if (!clients.TryGetValue(name, out var scopes))
                        {
                            context.Fail("Unknown client certificate.");
                            return Task.CompletedTask;
                        }
                        // The SHA-256 fingerprint names this exact certificate; RFC 8705 binds tokens to it.
                        var fingerprint = Convert.ToHexStringLower(cert.GetCertHash(HashAlgorithmName.SHA256));
                        Claim[] claims = [new(ClaimTypes.Name, name), new("fingerprint", fingerprint), .. scopes.Select(s => new Claim("scope", s))];
                        context.Principal = new ClaimsPrincipal(new ClaimsIdentity(claims, context.Scheme.Name));
                        context.Success();
                        return Task.CompletedTask;
                    },
                    // Not signed in. There is nothing to challenge (the handshake is over), so answer with JSON.
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        var hasCertificate = context.HttpContext.Connection.ClientCertificate is not null;
                        context.Response.StatusCode = hasCertificate ? 403 : 401;
                        await context.Response.WriteAsJsonAsync(new { error = hasCertificate ? "Unknown client certificate." : "A valid client certificate is required." });
                    },
                };
            });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapGet("/whoami", (ClaimsPrincipal user) => new
        {
            client = user.Identity!.Name,
            scopes = user.FindAll("scope").Select(c => c.Value),
            fingerprint = user.FindFirstValue("fingerprint"),
        }).RequireAuthorization();

        return app;
    }
}
