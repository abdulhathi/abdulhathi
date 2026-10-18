using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(TimeProvider.System);
// A fresh signing secret every start, and refresh tokens kept in memory: a restart signs everyone out.
builder.Services.AddSingleton(AccessTokenKey.New());
builder.Services.AddSingleton<RefreshTokenStore>();
builder.Services.AddSingleton<DenyList>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<AccessTokenKey, DenyList>((options, key, denied) =>
    {
        options.MapInboundClaims = false; // keep "sub", "email" and "jti" as they are in the token
        options.TokenValidationParameters = AccessTokens.Validation(key);
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                // exp, iss and aud are enforced above. Require sub, iat and jti too, as the other stacks do:
                // a token without a jti could never be deny-listed.
                var claims = context.Principal!;
                if (AccessTokens.Required.Any(name => claims.FindFirstValue(name) is null)) context.Fail("Missing a required claim");
                else if (denied.Contains(claims.FindFirstValue("jti")!)) context.Fail("Token revoked");
                return Task.CompletedTask;
            },
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
AppUser[] users = [new("u_1001", "ada@example.com", "correct horse battery")];

// The refresh token lives in a cookie that page scripts cannot read (HttpOnly), that travels only over HTTPS
// (Secure), that other sites cannot make the browser send (SameSite=Strict), and that is sent only to /auth/*.
const string CookieName = "refresh_token";
static CookieOptions RefreshCookie(TimeSpan? maxAge = null) =>
    new() { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict, Path = "/auth", MaxAge = maxAge };

var refreshErrors = new Dictionary<RefreshFailure, string>
{
    [RefreshFailure.Invalid] = "Invalid refresh token.",
    [RefreshFailure.Reused] = "Refresh token reuse detected. Sign in again.",
    [RefreshFailure.Expired] = "Refresh token expired. Sign in again.",
};

IResult SendTokens(HttpResponse response, AppUser user, IssuedToken refresh, AccessTokenKey key, TimeProvider clock)
{
    var secondsLeft = Math.Round((refresh.ExpiresAt - clock.GetUtcNow()).TotalSeconds);
    response.Cookies.Append(CookieName, refresh.Token, RefreshCookie(TimeSpan.FromSeconds(secondsLeft)));
    response.Headers.CacheControl = "no-store"; // token responses must never be cached (RFC 6749, section 5.1)
    var access = AccessTokens.Issue(key, user.Id, user.Email, clock);
    return Results.Ok(new { access_token = access, token_type = "Bearer", expires_in = (int)AccessTokens.Lifetime.TotalSeconds });
}

app.MapPost("/auth/login", (Credentials body, HttpResponse response, RefreshTokenStore store, AccessTokenKey key, TimeProvider clock) =>
{
    var user = users.FirstOrDefault(u => u.Email == body.Email.Trim().ToLowerInvariant());
    if (user is null || user.Password != body.Password)
        return Results.Json(new { error = "Email or password is incorrect." }, statusCode: 401);
    return SendTokens(response, user, store.Issue(user.Id), key, clock);
});

app.MapPost("/auth/refresh", (HttpRequest request, HttpResponse response, RefreshTokenStore store, AccessTokenKey key, TimeProvider clock) =>
{
    if (request.Cookies[CookieName] is not { Length: > 0 } presented)
        return Results.Json(new { error = "Missing refresh token." }, statusCode: 401);
    var result = store.Rotate(presented);
    if (result is Refused refused)
    {
        response.Cookies.Delete(CookieName, RefreshCookie());
        return Results.Json(new { error = refreshErrors[refused.Reason] }, statusCode: 401);
    }
    var rotated = (Rotated)result;
    return SendTokens(response, users.First(u => u.Id == rotated.UserId), rotated.Refresh, key, clock);
});

app.MapPost("/auth/logout", (HttpRequest request, HttpResponse response, ClaimsPrincipal user, RefreshTokenStore store, DenyList denied) =>
{
    if (request.Cookies[CookieName] is { Length: > 0 } presented) store.Revoke(presented);
    // A JWT cannot be recalled. If the client sent its access token (already validated by UseAuthentication),
    // deny-list it until it expires.
    if (user.FindFirstValue("jti") is { } jti && long.TryParse(user.FindFirstValue("exp"), out var exp))
        denied.Add(jti, DateTimeOffset.FromUnixTimeSeconds(exp));
    response.Cookies.Delete(CookieName, RefreshCookie());
    return Results.NoContent();
});

app.MapGet("/me", (ClaimsPrincipal user) => new { sub = user.FindFirstValue("sub"), email = user.FindFirstValue("email") })
    .RequireAuthorization();

app.Run();

public record Credentials(string Email, string Password);
public record AppUser(string Id, string Email, string Password);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
