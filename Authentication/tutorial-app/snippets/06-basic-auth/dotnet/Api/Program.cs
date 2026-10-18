using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton<UserStore>();

// Register the handler as an authentication scheme, and make it the default.
builder.Services.AddAuthentication(BasicAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, BasicAuthenticationHandler>(BasicAuthenticationHandler.SchemeName, _ => { });
builder.Services.AddAuthorization();

var app = builder.Build();
// Basic sends the password with every request, readable by anyone on the path: serve it over HTTPS only.
// Plain HTTP is acceptable here only because nothing leaves your machine.
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })); // public: no credentials needed

// RequireAuthorization() is the minimal-API form of [Authorize]: no valid user, no entry (the handler's challenge).
app.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { username = user.Identity!.Name }))
    .RequireAuthorization();

app.Run();

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
