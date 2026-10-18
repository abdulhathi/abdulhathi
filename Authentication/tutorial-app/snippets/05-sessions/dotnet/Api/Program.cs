using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<MemoryTicketStore>();

// Most browsers, and curl, accept a Secure cookie from http://localhost. If yours does not, start with
// COOKIE_SECURE=false while developing (the cookie is then Secure only on HTTPS requests). Never in production.
var secure = builder.Configuration["COOKIE_SECURE"] == "false" ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "sid";
        o.Cookie.HttpOnly = true;
        o.Cookie.SecurePolicy = secure;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.Path = "/";
        o.ExpireTimeSpan = Sessions.IdleTimeout; // the idle timeout...
        o.SlidingExpiration = true; // ...renewed once more than half of it has passed
        o.Events.OnValidatePrincipal = Sessions.EnforceAbsoluteTimeout;
        // An API answers 401 instead of redirecting to a login page.
        o.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return context.Response.WriteAsJsonAsync(new { error = "Sign in first." });
        };
    });
// Keep tickets on the server (only a key goes in the cookie), and use the injected clock.
builder.Services.AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
    .Configure<MemoryTicketStore, TimeProvider>((o, store, clock) =>
    {
        o.SessionStore = store;
        o.TimeProvider = clock;
    });
builder.Services.AddAuthorization();

// Antiforgery: a token pair, one half in its own cookie and one half sent in a header, tied to the signed-in user.
builder.Services.AddAntiforgery(o =>
{
    o.HeaderName = "X-CSRF-Token";
    o.Cookie.Name = "csrf";
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // Always would refuse plain-HTTP requests outright
});

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

var notes = new ConcurrentDictionary<string, List<string>>(); // email -> notes

app.MapPost("/login", async (Credentials body, UserStore users, TimeProvider clock, HttpContext http) =>
{
    var email = users.Check(body.Email, body.Password);
    if (email is null) return Results.Json(new { error = "Email or password is incorrect." }, statusCode: 401);
    var identity = new ClaimsIdentity(
        [new Claim(ClaimTypes.NameIdentifier, email), new Claim(ClaimTypes.Name, email)],
        CookieAuthenticationDefaults.AuthenticationScheme);
    var properties = new AuthenticationProperties { IsPersistent = true }; // give the cookie an expiry date
    properties.Items[Sessions.SignedInAt] = clock.GetUtcNow().ToString("O");
    await http.SignInAsync(new ClaimsPrincipal(identity), properties);
    return Results.Ok(new { email, message = "Signed in." });
}).WithMetadata(new StartsNewSession()); // a new session key at every sign-in (see MemoryTicketStore)

app.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { email = user.Identity!.Name }))
    .RequireAuthorization();

app.MapGet("/csrf", (HttpContext http, IAntiforgery antiforgery) =>
    Results.Ok(new { csrfToken = antiforgery.GetAndStoreTokens(http).RequestToken }))
    .RequireAuthorization();

app.MapPost("/notes", (Note body, ClaimsPrincipal user) =>
{
    var list = notes.GetOrAdd(user.Identity!.Name!, _ => []);
    lock (list)
    {
        list.Add(body.Text);
        return Results.Json(new { notes = list.ToArray() }, statusCode: 201);
    }
}).RequireAuthorization().AddEndpointFilter(RequireCsrf);

app.MapPost("/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(); // removes the ticket from the session store, and deletes the cookie
    return Results.Ok(new { message = "Signed out." });
}).RequireAuthorization().AddEndpointFilter(RequireCsrf);

app.Run();

// Runs after authorization, so a request without a session gets 401 before it gets 403.
static async ValueTask<object?> RequireCsrf(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
{
    var antiforgery = context.HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
    return await antiforgery.IsRequestValidAsync(context.HttpContext)
        ? await next(context)
        : Results.Json(new { error = "Missing or invalid CSRF token." }, statusCode: 403);
}

public record Credentials(string Email, string Password);
public record Note(string Text);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
