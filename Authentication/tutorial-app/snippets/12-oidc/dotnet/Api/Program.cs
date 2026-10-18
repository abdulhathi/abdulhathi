using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

var builder = WebApplication.CreateBuilder(args);
var baseUrl = builder.Configuration["BaseUrl"] ?? "http://localhost:3000";
var issuer = $"{baseUrl}/idp"; // a real app reads the provider's issuer URL from configuration

// The lab's own identity provider, served by this same app under /idp. In production it is Entra ID, Google, ...
// "web-app-secret" is a test secret; this is its SHA-256. Keep a real client secret in a vault, never in code.
builder.Services.AddSingleton(new MockIdp(issuer, new IdpClient("web-app",
    "99b55be79983e9546380ca7d7f1506aef263143451a1e15751f87e103d044371", [$"{baseUrl}/callback"], [$"{baseUrl}/logged-out"])));
builder.Services.AddSingleton<SignInErrors>();

// The relying party: a cookie keeps the session; the OpenID Connect handler signs users in.
builder.Services.AddAuthentication(o =>
    {
        o.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        o.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie(o =>
    {
        o.Cookie.Name = "sid";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax; // sent on the top-level redirect back from the provider
    })
    .AddOpenIdConnect(o =>
    {
        o.Authority = issuer; // discovery: {issuer}/.well-known/openid-configuration, then its jwks_uri
        o.RequireHttpsMetadata = !issuer.StartsWith("http://localhost"); // only the local mock may use plain HTTP
        o.ClientId = "web-app";
        o.ClientSecret = builder.Configuration["ClientSecret"] ?? "web-app-secret";
        o.ResponseType = OpenIdConnectResponseType.Code; // the authorization code flow
        o.ResponseMode = OpenIdConnectResponseMode.Query; // the code comes back in the query string
        o.UsePkce = true; // the default; shown for clarity
        o.Scope.Clear();
        o.Scope.Add("openid");
        o.Scope.Add("profile");
        o.Scope.Add("email");
        o.CallbackPath = "/callback";
        o.SignedOutCallbackPath = "/logged-out";
        o.SignedOutRedirectUri = "/";
        o.SaveTokens = true; // keeps the ID token in the session cookie, for id_token_hint at sign-out
        o.GetClaimsFromUserInfoEndpoint = true; // name and email come from UserInfo; the handler checks its sub
        o.MapInboundClaims = false; // keep "sub", "name" and "email" as the provider sent them
        o.TokenValidationParameters.NameClaimType = "name";
        o.DisableTelemetry = true; // no x-client-SKU / x-client-ver query parameters
        // With the code in the query (not a cross-site form POST), Lax cookies are enough for the
        // correlation and nonce cookies, and SameAsRequest lets them work on the plain-HTTP lab.
        o.CorrelationCookie.SameSite = SameSiteMode.Lax;
        o.CorrelationCookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.NonceCookie.SameSite = SameSiteMode.Lax;
        o.NonceCookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.Events.OnRemoteFailure = async context =>
        {
            // Bad state, nonce, signature, issuer, audience or expiry all end here. Log the reason; tell the user little.
            context.HttpContext.RequestServices.GetRequiredService<SignInErrors>().Add(context.Failure?.Message ?? "unknown");
            context.HandleResponse();
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Sign-in failed." });
        };
    });

var app = builder.Build();
app.UseAuthentication();

app.MapMockIdp("/idp");

app.MapGet("/", (ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
    ? Results.Ok(new { signedIn = true, name = user.FindFirstValue("name") })
    : Results.Ok(new { signedIn = false }));

// Sends the browser to the provider with state, nonce and a PKCE challenge (the handler makes all three).
app.MapGet("/login", () => Results.Challenge(new AuthenticationProperties { RedirectUri = "/me" }, [OpenIdConnectDefaults.AuthenticationScheme]));

// GET /callback is handled by the OpenID Connect handler (CallbackPath above): it checks state, redeems the code with
// the PKCE verifier, validates the ID token (signature by kid, iss, aud, exp, that iat is present, nonce), calls
// UserInfo, and signs the user in with the cookie, then redirects to /me.

app.MapGet("/me", (ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
    ? Results.Ok(new { sub = user.FindFirstValue("sub"), name = user.FindFirstValue("name"), email = user.FindFirstValue("email") })
    : Results.Json(new { error = "Not signed in." }, statusCode: 401));

// Ends the local session, then sends the browser to the provider's end_session_endpoint with id_token_hint.
// The provider sends it back to /logged-out (SignedOutCallbackPath), which redirects to /.
app.MapPost("/logout", () => Results.SignOut(new AuthenticationProperties { RedirectUri = "/" },
    [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme]));

app.Run();

/// <summary>Why sign-ins failed, newest last: what you would send to your logs.</summary>
public sealed class SignInErrors
{
    private readonly List<string> _errors = [];
    public void Add(string message) { lock (_errors) _errors.Add(message); }
    public string? Last { get { lock (_errors) return _errors.LastOrDefault(); } }
}

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
