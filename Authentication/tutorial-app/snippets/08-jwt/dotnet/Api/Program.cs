using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<KeyRing>(); // a fresh RS256 key every start: tokens from the last run stop verifying

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<KeyRing>((options, ring) =>
    {
        options.MapInboundClaims = false; // keep "sub" and "email" as they are in the token
        options.TokenValidationParameters = Tokens.Validation(ring);
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                if (Tokens.MissingClaim((JsonWebToken)context.SecurityToken) is { } name) context.Fail($"Missing claim {name}");
                return Task.CompletedTask;
            },
            // Authorization: Bearer <token> (RFC 6750). Any failure gets the same 401; the reason stays in the log.
            OnChallenge = async context =>
            {
                context.HandleResponse();
                var invalid = context.AuthenticateFailure is not null;
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.Headers.WWWAuthenticate = invalid ? "Bearer error=\"invalid_token\"" : "Bearer";
                await context.Response.WriteAsJsonAsync(new { error = invalid ? "Invalid or expired token." : "Missing bearer token." });
            },
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

// A stand-in for chapter 04, to keep this chapter about tokens: a real app checks a slow, salted hash.
var users = new Dictionary<string, (User User, string Password)>
{
    ["ada@example.com"] = (new User("u_1001", "ada@example.com"), "correct horse battery"),
};

app.MapPost("/login", (Credentials body, KeyRing ring, TimeProvider clock, HttpResponse response) =>
{
    if (!users.TryGetValue((body.Email ?? "").Trim().ToLowerInvariant(), out var entry) || entry.Password != body.Password)
        return Results.Json(new { error = "Email or password is incorrect." }, statusCode: 401);
    var token = Tokens.Issue(ring, entry.User, clock);
    response.Headers.CacheControl = "no-store"; // a response holding a token must never be cached (RFC 6749, section 5.1)
    return Results.Ok(new { access_token = token, token_type = "Bearer", expires_in = (int)Tokens.Lifetime.TotalSeconds });
});

// Public keys only: anyone may fetch them, and they can verify tokens but never sign one.
app.MapGet("/.well-known/jwks.json", (KeyRing ring, HttpResponse response) =>
{
    response.Headers.CacheControl = "public, max-age=300";
    return ring.Jwks();
});

app.MapGet("/me", (ClaimsPrincipal user) => new { sub = user.FindFirstValue("sub"), email = user.FindFirstValue("email") })
    .RequireAuthorization();

app.Run();

public record Credentials(string? Email, string? Password); // a missing field gets the same 401

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
