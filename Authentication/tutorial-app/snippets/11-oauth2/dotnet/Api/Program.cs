using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var issuer = builder.Configuration["Issuer"] ?? "http://localhost:3000";

// Two roles in one process so the lab runs with one command: the authorization server (/authorize, /token) and the
// resource server (/api/...). In production they are separate services that share only the token format and key.
builder.Services.AddSingleton(TimeProvider.System);
// The authorization server's signing key, made at start-up. A real one lives in a key vault and is rotated.
builder.Services.AddSingleton(_ => new RsaSecurityKey(RSA.Create(2048)));
builder.Services.AddSingleton<RevokedTokens>(); // jti values of revoked access tokens
builder.Services.AddSingleton(sp => new AuthorizationServer(issuer, sp.GetRequiredService<RsaSecurityKey>(),
    sp.GetRequiredService<TimeProvider>(), sp.GetRequiredService<RevokedTokens>()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<RsaSecurityKey, TimeProvider, RevokedTokens>((options, key, clock, revoked) =>
        ResourceServer.Configure(options, issuer, key, clock, revoked));
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapAuthorizationServer();

app.MapGet("/api/photos", (ClaimsPrincipal user) =>
    Results.Ok(new { owner = user.FindFirstValue("sub"), photos = new[] { "beach.jpg", "hills.jpg" } }))
    .RequireScope("photos.read");

app.MapGet("/api/reports", (ClaimsPrincipal user) =>
    Results.Ok(new { client = user.FindFirstValue("client_id"), reports = new[] { "daily-sales.csv" } }))
    .RequireScope("reports.read");

app.Run();

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
