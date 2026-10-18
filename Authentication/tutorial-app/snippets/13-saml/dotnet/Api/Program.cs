using System.Security.Cryptography.X509Certificates;

var builder = WebApplication.CreateBuilder(args);

// The IdP's signing certificate, saved from its metadata (Entra ID calls it "Certificate (Base64)").
builder.Services.AddSingleton(_ => SamlSettings.Example(X509Certificate2.CreateFromPem(File.ReadAllText(
    builder.Configuration["IDP_CERT"] ?? throw new InvalidOperationException("Set IDP_CERT to the path of the identity provider's signing certificate (PEM).")))));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<SamlState>();
builder.Services.AddSingleton<UserDirectory>();

var app = builder.Build();
var requestLifetime = TimeSpan.FromMinutes(10); // how long we wait for the IdP to answer an AuthnRequest

app.MapGet("/saml/metadata", (SamlSettings s) => Results.Text(Saml.SpMetadata(s), "application/samlmetadata+xml"));

// SP-initiated sign-in: remember the request's ID, then send the browser to the IdP with the request in the URL.
app.MapGet("/saml/login", (SamlSettings s, SamlState state, TimeProvider clock) =>
{
    var id = Saml.NewId();
    var now = clock.GetUtcNow();
    state.Pending.Add(id, now + requestLifetime);
    return Results.Redirect(Saml.RedirectUrl(s, Saml.AuthnRequest(s, id, now)));
});

// The Assertion Consumer Service: the IdP's page makes the browser POST the signed response here.
app.MapPost("/saml/acs", async (HttpRequest request, SamlSettings s, SamlState state, UserDirectory users, TimeProvider clock) =>
{
    var samlResponse = request.HasFormContentType ? (await request.ReadFormAsync())["SAMLResponse"].ToString() : "";
    if (samlResponse == "") return Results.BadRequest(new { error = "Missing SAMLResponse." });
    try
    {
        var login = ResponseValidator.Validate(samlResponse, s, clock.GetUtcNow());
        // One-time use: a stolen or replayed response is refused even while it is still within its time window.
        if (state.Used.Has(login.AssertionId)) throw new SamlException(401, "This assertion was already used.");
        // It must answer a request we sent (and only once). This also refuses IdP-initiated, unsolicited responses.
        if (!state.Pending.Take(login.InResponseTo)) throw new SamlException(401, "InResponseTo does not match a pending request.");
        state.Used.Add(login.AssertionId, login.NotOnOrAfter + ResponseValidator.ClockSkew);

        // Map the assertion to a local user, keyed by issuer + NameID.
        var user = new SamlUser(
            login.NameId,
            login.Attributes.GetValueOrDefault("email")?.FirstOrDefault() ?? login.NameId,
            login.Attributes.GetValueOrDefault("name")?.FirstOrDefault() ?? "",
            login.Attributes.GetValueOrDefault("groups") ?? []);
        users.Put(s.IdpEntityId, user);
        // A real app now starts a session (chapter 05) and redirects; this one shows who signed in.
        return Results.Ok(user);
    }
    catch (SamlException e)
    {
        return Results.Json(new { error = e.Message }, statusCode: e.Status);
    }
})
// The IdP's page posts this form from another site, so there is no antiforgery token. The signed assertion,
// its Recipient and InResponseTo are what protect this endpoint.
.DisableAntiforgery();

app.Run();

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
