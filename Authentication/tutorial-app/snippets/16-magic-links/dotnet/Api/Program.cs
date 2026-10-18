using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
// ASP.NET Core logs every request's full URL, and the URL of a link holds its token. Keep its logs to warnings.
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(sp => new MagicLinks(sp.GetRequiredService<TimeProvider>()));
// Emails are printed instead of being sent.
builder.Services.AddSingleton(new Outbox(email => Console.WriteLine($"\n--- Email to {email.To}: {email.Subject}\n{email.Text}\n---")));

var app = builder.Build();

const string browserCookie = "signin_browser";
const string sessionCookie = "session";
var window = TimeSpan.FromMinutes(15);
var clock = app.Services.GetRequiredService<TimeProvider>();
var links = app.Services.GetRequiredService<MagicLinks>();
var outbox = app.Services.GetRequiredService<Outbox>();
var perEmail = new RateLimiter(3, window, clock); // emails per address in any 15 minutes
var perIp = new RateLimiter(10, window, clock);
var accounts = new HashSet<string> { "ada@example.com" }; // a real app uses a database table
var sessions = new ConcurrentDictionary<string, string>(); // session id -> email (chapter 05 does sessions properly)
// Links in emails start with BaseUrl: the public address of the site, set in configuration.
var baseUrl = app.Configuration["BaseUrl"] ?? "http://localhost:3000";

var checkEmail = new { message = "Check your email. If an account exists, a sign-in link and code are on the way." };
var badLink = new { error = "This link is not valid or has expired. Ask for a new one." };
var badCode = new { error = "That code is not valid or has expired." };
var tooMany = new { error = "Too many requests. Try again later." };

static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

static string EmailText(string link, string code) =>
    $"Sign in to Auth Lab:\n{link}\n\nOr enter this code: {code}\n\n" +
    "The link and the code work once and expire in 15 minutes. If you did not ask for this, ignore this email.";

// Shown when a link is opened without the cookie of the browser that asked. Scanners and prefetchers fetch links
// but rarely submit forms; never submit it with a script, since some scanners run scripts. The token is one this
// server issued (Peek found it), so it is plain base64url and safe to put in the HTML.
static string ConfirmPage(string token) => $"""
    <!doctype html>
    <meta charset="utf-8">
    <title>Sign in</title>
    <form method="post" action="/auth/verify">
      <input type="hidden" name="token" value="{token}">
      <button type="submit">Continue signing in</button>
    </form>

    """;

IResult SignIn(HttpContext http, string email)
{
    var id = NewToken();
    sessions[id] = email;
    // Add Secure = true when the site is served over HTTPS (always, in production). Chapter 05 covers the flags.
    http.Response.Cookies.Append(sessionCookie, id, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax, Path = "/" });
    http.Response.Cookies.Delete(browserCookie, new CookieOptions { Path = "/auth" });
    return Results.Ok(new { email, message = "Signed in." });
}

app.MapPost("/auth/email", (EmailRequest body, HttpContext http) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    if (!email.Contains('@')) return Results.BadRequest(new { error = "Enter a valid email address." });
    // Limits for unknown emails too, so a 429 says nothing about which accounts exist. Behind a proxy, add the
    // forwarded headers middleware so RemoteIpAddress is the client's address rather than the proxy's.
    var wait = perIp.Take(http.Connection.RemoteIpAddress?.ToString() ?? "unknown");
    if (wait == TimeSpan.Zero) wait = perEmail.Take(email);
    if (wait > TimeSpan.Zero)
    {
        http.Response.Headers.RetryAfter = Math.Ceiling(wait.TotalSeconds).ToString();
        return Results.Json(tooMany, statusCode: 429);
    }
    // Marks this browser as the one that asked. Set for unknown emails too, so the two answers look the same.
    var browser = NewToken();
    http.Response.Cookies.Append(browserCookie, browser,
        new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax, Path = "/auth", MaxAge = MagicLinks.Ttl });
    if (accounts.Contains(email))
    {
        var (token, code) = links.Issue(email, browser);
        // The configured base URL, never the request's Host header: an attacker could point the link at their site.
        outbox.Send(new Email(email, "Your sign-in link", EmailText($"{baseUrl}/auth/verify?token={token}", code)));
    }
    return Results.Json(checkEmail, statusCode: 202); // the same answer whether or not the account exists
});

app.MapGet("/auth/verify", (string? token, HttpContext http) =>
{
    token ??= "";
    var pending = links.Peek(token);
    if (pending is null) return Results.BadRequest(badLink);
    if (!links.SameBrowser(pending, http.Request.Cookies[browserCookie]))
    {
        // Another device, a link scanner or an email prefetcher: show a button, and sign in only on the POST.
        // No caching, no Referer with the token in it, and no framing (a framed button can be clicked by trickery).
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers["Referrer-Policy"] = "no-referrer";
        http.Response.Headers.ContentSecurityPolicy = "frame-ancestors 'none'";
        return Results.Content(ConfirmPage(token), "text/html; charset=utf-8");
    }
    // A real app would redirect to its home page after signing in.
    return links.Consume(token) is { } email ? SignIn(http, email) : Results.BadRequest(badLink);
});

// Minimal APIs mark endpoints that bind form data as needing an antiforgery token. This form is the confirmation page
// above, shown to a browser that is not signed in yet, so it has none.
app.MapPost("/auth/verify", ([FromForm] string? token, HttpContext http) =>
    links.Consume(token ?? "") is { } email ? SignIn(http, email) : Results.BadRequest(badLink))
    .DisableAntiforgery();

app.MapPost("/auth/code", (CodeRequest body, HttpContext http) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    return links.CheckCode(email, body.Code ?? "") ? SignIn(http, email) : Results.Json(badCode, statusCode: 401);
});

app.MapGet("/me", (HttpRequest request) =>
    sessions.TryGetValue(request.Cookies[sessionCookie] ?? "", out var email)
        ? Results.Ok(new { email })
        : Results.Json(new { error = "Sign in first." }, statusCode: 401));

app.Run();

// Nullable, because JSON without a field binds it to null: {} then gets the same 400 or 401 as in the other stacks.
public record EmailRequest(string? Email);
public record CodeRequest(string? Email, string? Code);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
