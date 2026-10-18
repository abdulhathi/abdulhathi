using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

// ASP.NET Core Identity's hasher: PBKDF2 with HMAC-SHA512, a random 128-bit salt, and the iteration count stored in
// the hash, so old hashes still verify after you raise it. OWASP's minimum for PBKDF2-HMAC-SHA512 is 210,000.
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<LoginLimiter>();

var app = builder.Build();

var invalid = new { error = "Email or password is incorrect." };
var hasher = app.Services.GetRequiredService<IPasswordHasher<User>>();
// Checked when the email is unknown, so both paths take the same time.
var dummy = new User("", "");
dummy.PasswordHash = hasher.HashPassword(dummy, "not-a-real-password");

app.MapPost("/signup", (Credentials body, UserStore users) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    var password = body.Password ?? "";
    if (!email.Contains('@')) return Results.BadRequest(new { error = "Enter a valid email address." });
    if (PasswordPolicy.Problem(password) is { } problem) return Results.BadRequest(new { error = problem });
    var user = new User(email, "");
    user.PasswordHash = hasher.HashPassword(user, password);
    return users.TryAdd(user)
        ? Results.Created($"/users/{email}", new { email })
        : Results.Conflict(new { error = "That email is already registered." });
});

app.MapPost("/login", (Credentials body, UserStore users, LoginLimiter limiter, HttpResponse response) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    var password = body.Password ?? "";
    var wait = limiter.RetryAfter(email);
    if (wait > TimeSpan.Zero)
    {
        response.Headers.RetryAfter = Math.Ceiling(wait.TotalSeconds).ToString();
        return Results.Json(new { error = "Too many failed attempts. Try again later." }, statusCode: 429);
    }
    var user = users.Find(email);
    var result = hasher.VerifyHashedPassword(user ?? dummy, (user ?? dummy).PasswordHash, password);
    if (user is null || result == PasswordVerificationResult.Failed)
    {
        limiter.Fail(email);
        return Results.Json(invalid, statusCode: 401); // the same answer for "no such user" and "wrong password"
    }
    limiter.Succeed(email);
    // The hash used fewer iterations than today's setting: replace it now that we know the password.
    if (result == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, password);
    return Results.Ok(new { email, message = "Signed in." });
});

app.Run();

// Nullable so a missing field gets the normal error answer instead of a 500.
public record Credentials(string? Email, string? Password);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
