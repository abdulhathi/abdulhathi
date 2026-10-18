using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.JsonWebTokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TokenKey.Random()); // a fresh random signing key every run
builder.Services.AddSingleton(new DocumentStore(Demo.Documents));
builder.Services.AddScoped<DocumentAccess>();

// Authentication: who is calling. A bearer JWT, checked with this run's key.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<TokenKey>((o, key) =>
{
    o.MapInboundClaims = false; // keep "sub", "roles" and "scope" as they are in the token
    o.TokenValidationParameters = Tokens.Validation(key);
    o.Events = new JwtBearerEvents
    {
        OnTokenValidated = ctx =>
        {
            if (!Tokens.HasRequiredClaims((JsonWebToken)ctx.SecurityToken)) ctx.Fail("The token lacks a required claim.");
            return Task.CompletedTask;
        },
    };
});

// Authorization: what the caller may do. Named policies for scopes and roles; the document rules are resource-based.
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build()) // deny by default
    .AddPolicy("documents:read", p => p.AddRequirements(new ScopeRequirement("documents:read")))
    .AddPolicy("documents:write", p => p.AddRequirements(new ScopeRequirement("documents:write")))
    .AddPolicy("editors", p => p.RequireRole("editor", "admin"))
    .AddPolicy("admins", p => p.RequireRole("admin"));
builder.Services.AddSingleton<IAuthorizationHandler, ScopeHandler>();
builder.Services.AddSingleton<IAuthorizationHandler, DocumentAuthorizationHandler>();
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, JsonAuthorizationResultHandler>();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/documents", async (ClaimsPrincipal user, DocumentStore store, IAuthorizationService authz) =>
{
    // Tenant filter in the query, then the same read rule as GET /documents/{id}.
    var visible = new List<Document>();
    foreach (var doc in store.List(user.Tenant()))
        if ((await authz.AuthorizeAsync(user, doc, DocumentOperations.Read)).Succeeded) visible.Add(doc);
    return Results.Ok(new { documents = visible });
}).RequireAuthorization("documents:read");

app.MapGet("/documents/{id}", async (string id, ClaimsPrincipal user, DocumentAccess access) =>
{
    var (doc, error) = await access.LoadAsync(user, id, DocumentOperations.Read);
    return error ?? Results.Ok(doc);
}).RequireAuthorization("documents:read");

app.MapPost("/documents", (DocumentInput? body, ClaimsPrincipal user, DocumentStore store) =>
{
    var title = body?.Title?.Trim();
    if (string.IsNullOrEmpty(title)) return Results.BadRequest(new { error = "Enter a title." });
    // Tenant, owner, department and status come from the token and the server, never from the request body.
    var doc = new Document(Guid.NewGuid().ToString(), user.Tenant(), user.Id(), user.Department(), title, "draft");
    store.Put(doc);
    return Results.Created($"/documents/{doc.Id}", doc);
}).RequireAuthorization("documents:write", "editors");

app.MapPut("/documents/{id}", async (string id, DocumentInput? body, ClaimsPrincipal user, DocumentAccess access, DocumentStore store) =>
{
    var (doc, error) = await access.LoadAsync(user, id, DocumentOperations.Update);
    if (error is not null) return error;
    var title = body?.Title?.Trim(); // checked after the access checks, so a 400 never confirms that an id exists
    if (string.IsNullOrEmpty(title)) return Results.BadRequest(new { error = "Enter a title." });
    var updated = doc! with { Title = title };
    store.Put(updated);
    return Results.Ok(updated);
}).RequireAuthorization("documents:write");

app.MapPost("/documents/{id}/publish", async (string id, ClaimsPrincipal user, DocumentAccess access, DocumentStore store) =>
{
    var (doc, error) = await access.LoadAsync(user, id, DocumentOperations.Publish);
    if (error is not null) return error;
    var published = doc! with { Status = "published" };
    store.Put(published);
    return Results.Ok(published);
}).RequireAuthorization("documents:write");

app.MapDelete("/documents/{id}", async (string id, ClaimsPrincipal user, DocumentAccess access, DocumentStore store) =>
{
    var (doc, error) = await access.LoadAsync(user, id, DocumentOperations.Delete);
    if (error is not null) return error;
    store.Remove(user.Tenant(), doc!.Id);
    return Results.NoContent();
}).RequireAuthorization("documents:write", "admins");

// Sign-in is covered by earlier chapters. To try this API, print a token per demo user, made with this run's key.
app.Lifetime.ApplicationStarted.Register(() =>
{
    var key = app.Services.GetRequiredService<TokenKey>();
    Console.WriteLine("Test tokens (valid for 1 hour). Paste these lines into your shell:");
    foreach (var (name, user) in Demo.Users) Console.WriteLine($"export {name.ToUpperInvariant()}={Tokens.Sign(key, user)}");
    Console.WriteLine($"export ADA_READONLY={Tokens.Sign(key, Demo.Users["ada"], "documents:read")}");
});

app.Run();

// The only field a client may set: any other field in the body (tenant, owner, status) is ignored. The body is
// optional (DocumentInput?), so a missing one reaches the handler and gets the same 400 as in the other stacks.
public record DocumentInput(string? Title);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
