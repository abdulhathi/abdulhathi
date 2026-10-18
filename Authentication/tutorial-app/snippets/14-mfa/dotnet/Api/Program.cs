using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

// The first factor, as in chapter 04: Identity's PBKDF2 password hasher. Recovery codes reuse its iteration count.
builder.Services.Configure<PasswordHasherOptions>(o => o.IterationCount = 210_000);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton<RecoveryCodes>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<SignIns>();
// The key that encrypts TOTP secrets comes from configuration: Mfa:EncryptionKey.
builder.Services.AddSingleton(sp => SecretBox.FromConfiguration(sp.GetRequiredService<IConfiguration>(), sp.GetRequiredService<ILogger<SecretBox>>()));

var app = builder.Build();

const string issuer = "Auth Lab"; // the name the authenticator app shows above the code
var pendingFor = TimeSpan.FromMinutes(5); // time allowed between the password and the code
const int maxCodeFailures = 5;
var lockFor = TimeSpan.FromMinutes(15);

var hasher = app.Services.GetRequiredService<IPasswordHasher<User>>();
var recovery = app.Services.GetRequiredService<RecoveryCodes>();
var clock = app.Services.GetRequiredService<TimeProvider>();
var users = app.Services.GetRequiredService<UserStore>();
var signIns = app.Services.GetRequiredService<SignIns>();
var box = app.Services.GetRequiredService<SecretBox>();

var invalid = new { error = "Email or password is incorrect." };
var badCode = new { error = "That code is not valid." };
IResult SignInFirst() => Results.Json(new { error = "Sign in first." }, statusCode: 401);
IResult SignInAgain() => Results.Json(new { error = "Sign in again." }, statusCode: 401);
var dummy = new User("", "");
dummy.PasswordHash = hasher.HashPassword(dummy, "not-a-real-password");

// The user for "Authorization: Bearer <session token>", or null.
User? SignedIn(HttpRequest request)
{
    var header = request.Headers.Authorization.ToString();
    var email = signIns.SessionEmail(header.StartsWith("Bearer ") ? header["Bearer ".Length..] : null);
    return email is null ? null : users.Find(email);
}

app.MapPost("/signup", (Credentials body) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    if (!email.Contains('@') || (body.Password ?? "").Length < 12)
        return Results.BadRequest(new { error = "Enter an email and a password of at least 12 characters." });
    var user = new User(email, "");
    user.PasswordHash = hasher.HashPassword(user, body.Password!);
    return users.TryAdd(user)
        ? Results.Created($"/users/{email}", new { email })
        : Results.Conflict(new { error = "That email is already registered." });
});

// Step 1 of sign-in: the password. With MFA on, this proves only the first factor, so it returns a short-lived
// pending token that is good for nothing except step 2.
app.MapPost("/login", (Credentials body) =>
{
    var email = (body.Email ?? "").Trim().ToLowerInvariant();
    var user = users.Find(email);
    var result = hasher.VerifyHashedPassword(user ?? dummy, (user ?? dummy).PasswordHash, body.Password ?? "");
    if (user is null || result == PasswordVerificationResult.Failed) return Results.Json(invalid, statusCode: 401);
    if (user.TotpSecret is null) return Results.Ok(new { token = signIns.StartSession(email) });
    var pendingToken = signIns.StartPending(email, clock.GetUtcNow() + pendingFor);
    return Results.Ok(new { mfaRequired = true, pendingToken });
});

// Step 2: a code from the authenticator app, or a recovery code.
app.MapPost("/login/mfa", (MfaLogin body, HttpResponse response) =>
{
    var now = clock.GetUtcNow();
    if (signIns.PendingEmail(body.PendingToken ?? "", now) is not { } email) return SignInAgain();
    var user = users.Find(email)!;
    int? recoveryCodesLeft = null;
    lock (user) // one request at a time per user: each check-then-update step is atomic
    {
        // Checked again inside the lock: a request for the same user that held it just before may have used this token.
        if (signIns.PendingEmail(body.PendingToken ?? "", now) is null) return SignInAgain();
        if (user.LockedUntil > now)
        {
            response.Headers.RetryAfter = Math.Ceiling((user.LockedUntil - now).TotalSeconds).ToString();
            return Results.Json(new { error = "Too many wrong codes. Try again later." }, statusCode: 429);
        }

        var code = Regex.Replace(body.Code ?? "", @"\s", "");
        var ok = false;
        if (Regex.IsMatch(code, "^[0-9]{6}$"))
        {
            if (Totp.Verify(box.Open(user.TotpSecret!, user.Email), code, now, user.LastTotpStep) is { } step)
            {
                user.LastTotpStep = step; // this code, and every older one, is now used up
                ok = true;
            }
        }
        else if (recovery.Use(user.RecoveryCodes!, code))
        {
            ok = true;
            recoveryCodesLeft = user.RecoveryCodes!.Count;
        }

        if (!ok)
        {
            if (++user.CodeFailures >= maxCodeFailures)
            {
                user.LockedUntil = now + lockFor; // a 6-digit code must not be guessable by brute force
                user.CodeFailures = 0;
            }
            return Results.Json(badCode, statusCode: 401);
        }
        user.CodeFailures = 0;
        signIns.EndPending(body.PendingToken!); // a pending token works once
    }
    var token = signIns.StartSession(email);
    return recoveryCodesLeft is null ? Results.Ok(new { token }) : Results.Ok(new { token, recoveryCodesLeft });
});

// Enrolment, part 1: make a secret and show it as a QR code (the otpauth URI) and as text to type in.
app.MapPost("/mfa/setup", (HttpRequest request) =>
{
    if (SignedIn(request) is not { } user) return SignInFirst();
    lock (user)
    {
        if (user.TotpSecret is not null) return Results.Conflict(new { error = "Two-factor sign-in is already on." });
        var secret = Totp.NewSecret();
        user.PendingTotpSecret = box.Seal(secret, user.Email); // not active until confirmed
        var secretBase32 = Base32.Encode(secret);
        return Results.Ok(new { secret = secretBase32, otpauthUri = Totp.OtpauthUri(secretBase32, user.Email, issuer) });
    }
});

// Enrolment, part 2: a first valid code proves the app holds the secret. Only then is MFA turned on.
app.MapPost("/mfa/confirm", (CodeBody body, HttpRequest request) =>
{
    if (SignedIn(request) is not { } user) return SignInFirst();
    var codes = RecoveryCodes.New();
    lock (user)
    {
        if (user.PendingTotpSecret is null) return Results.BadRequest(new { error = "Start set-up first." });
        if (Totp.Verify(box.Open(user.PendingTotpSecret, user.Email), body.Code ?? "", clock.GetUtcNow(), user.LastTotpStep) is not { } step)
            return Results.BadRequest(badCode);
        user.LastTotpStep = step; // the confirming code cannot be used again
        user.RecoveryCodes = recovery.Hash(codes);
        user.TotpSecret = user.PendingTotpSecret;
        user.PendingTotpSecret = null;
    }
    return Results.Ok(new { recoveryCodes = codes }); // shown once; only hashes are kept
});

app.MapGet("/me", (HttpRequest request) =>
    SignedIn(request) is { } user ? Results.Ok(new { email = user.Email, mfa = user.TotpSecret is not null }) : SignInFirst());

app.Run();

// Nullable so a missing field gets the normal error answer instead of a 500; each endpoint reads it as "".
public record Credentials(string? Email, string? Password);
public record MfaLogin(string? PendingToken, string? Code);
public record CodeBody(string? Code);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
