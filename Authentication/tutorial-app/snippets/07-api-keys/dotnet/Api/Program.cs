using System.Globalization;
using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<ApiKeyStore>();
builder.Services.AddOptions<RateLimitOptions>();
builder.Services.AddSingleton<FixedWindowLimiter>();
// The web defaults read "30" as the number 30; refuse it, as the Node.js and Python projects do.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);

// The API key scheme is the default, so it runs on every request and fills HttpContext.User.
builder.Services.AddAuthentication(ApiKeyHandler.SchemeName)
    .AddScheme<ApiKeyOptions, ApiKeyHandler>(ApiKeyHandler.SchemeName, null);
// One policy per scope. Without a working key the policy challenges (401); with a key that lacks the scope it forbids (403).
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("reports:read", p => p.RequireClaim("scope", "reports:read"))
    .AddPolicy("keys:manage", p => p.RequireClaim("scope", "keys:manage"));
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, ScopeFailureHandler>();

var app = builder.Build();
var store = app.Services.GetRequiredService<ApiKeyStore>();
var limiter = app.Services.GetRequiredService<FixedWindowLimiter>();

app.UseAuthentication();
// The per-key rate limit: after authentication (it needs the key id), before the scope check.
app.Use(async (context, next) =>
{
    var keyId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    var wait = keyId is null ? TimeSpan.Zero : limiter.Hit(keyId);
    if (wait > TimeSpan.Zero)
    {
        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.Headers.RetryAfter = Math.Ceiling(wait.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.Response.WriteAsJsonAsync(new { error = "Rate limit exceeded. Try again later." });
        return;
    }
    await next(context);
});
app.UseAuthorization();

var reports = new[] { new { month = "2026-09", orders = 1520 }, new { month = "2026-10", orders = 1710 } };

// What a client application calls with its key.
app.MapGet("/reports", (ClaimsPrincipal user) => Results.Ok(new { client = user.Identity!.Name, reports }))
    .RequireAuthorization("reports:read");

// Everything under /keys is for admins: one policy protects the whole group.
var keys = app.MapGroup("/keys").RequireAuthorization("keys:manage");

keys.MapPost("", (NewKey body) =>
{
    var name = body.Name?.Trim() ?? "";
    if (name.Length is < 1 or > 100) return Refuse(400, "Give the key a name of 1 to 100 characters.");
    if (body.Scopes is not { Length: > 0 } scopes || !scopes.All(s => ApiKeyStore.KnownScopes.Contains(s)))
        return Refuse(400, $"Scopes must be a non-empty list from: {string.Join(", ", ApiKeyStore.KnownScopes)}.");
    if (body.ExpiresInDays is < 1 or > 365) return Refuse(400, "expiresInDays must be a whole number from 1 to 365.");
    var (record, key) = store.Issue(name, scopes.Distinct(), body.ExpiresInDays);
    return Results.Json(Shown(record, key), statusCode: 201);
});

keys.MapPost("/{id}/revoke", (string id) =>
    store.Revoke(id) is { } record ? Results.Ok(new { id = record.Id, revoked = true }) : Refuse(404, "No such key."));

// Rotation: a new key now, and the old one keeps working for 24 hours while the client switches over.
keys.MapPost("/{id}/rotate", (string id) =>
{
    if (store.Find(id) is not { } old) return Refuse(404, "No such key.");
    if (old.RevokedAt is not null) return Refuse(409, "That key is revoked. Create a new key instead.");
    var (record, key) = store.Rotate(old);
    return Results.Json(new
    {
        id = record.Id, key, name = record.Name, scopes = record.Scopes, expiresAt = Iso(record.ExpiresAt),
        note = Note, oldKeyExpiresAt = Iso(old.ExpiresAt),
    }, statusCode: 201);
});

// The first admin key, printed once so you can try the API. A real service creates it with a deployment script or
// a command-line tool and puts it straight into a secret store.
Console.WriteLine($"Admin key (shown once): {store.Issue("admin", ["keys:manage"]).Key}");
app.Run();

static IResult Refuse(int status, string error) => Results.Json(new { error }, statusCode: status);
static string Iso(DateTimeOffset t) => t.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
// The one response that ever contains the key.
static object Shown(ApiKey record, string key) => new
{
    id = record.Id, key, name = record.Name, scopes = record.Scopes, expiresAt = Iso(record.ExpiresAt), note = Note,
};

// A missing expiresInDays takes the default; null or a value that is not a whole number fails JSON binding (400).
public record NewKey(string? Name, string[]? Scopes, int ExpiresInDays = ApiKeyStore.DefaultTtlDays);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program
{
    private const string Note = "Copy this key now: it is shown only once.";
}
