using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

public sealed class ApiKeyOptions : AuthenticationSchemeOptions;

/// <summary>Why a request was refused: the status code and the message for the JSON body.</summary>
public sealed class ApiKeyRefused(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>
/// The "ApiKey" authentication scheme. It reads the key from "Authorization: Bearer &lt;key&gt;" or "X-API-Key",
/// checks it with the store, and turns a working key into a ClaimsPrincipal with one "scope" claim per scope.
/// Authorization policies then check the scopes per endpoint.
/// </summary>
public sealed class ApiKeyHandler(IOptionsMonitor<ApiKeyOptions> options, ILoggerFactory logger, UrlEncoder encoder, ApiKeyStore store)
    : AuthenticationHandler<ApiKeyOptions>(options, logger, encoder)
{
    public const string SchemeName = "ApiKey";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // A key in the URL ends up in access logs, browser history and Referer headers. Refuse it loudly.
        if (Request.Query.ContainsKey("api_key"))
            return Task.FromResult(AuthenticateResult.Fail(new ApiKeyRefused(400, "Send the API key in a header, never in the URL.")));
        var presented = ReadKey(Request);
        if (presented is null) return Task.FromResult(AuthenticateResult.NoResult()); // the challenge below answers 401
        var (key, error) = store.Verify(presented);
        if (key is null) return Task.FromResult(AuthenticateResult.Fail(new ApiKeyRefused(401, error!)));

        Claim[] claims = [new(ClaimTypes.NameIdentifier, key.Id), new(ClaimTypes.Name, key.Name), .. key.Scopes.Select(s => new Claim("scope", s))];
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName)));
    }

    /// <summary>The key from "Authorization: Bearer &lt;key&gt;" or "X-API-Key: &lt;key&gt;". Never from the URL.</summary>
    private static string? ReadKey(HttpRequest request)
    {
        var authorization = request.Headers.Authorization.ToString();
        if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) && authorization["Bearer ".Length..].Trim() is { Length: > 0 } bearer)
            return bearer;
        var header = request.Headers["X-API-Key"].ToString();
        return header.Length > 0 ? header : null;
    }

    // Runs when an endpoint needs a key and there is no working one: answer with the reason as JSON.
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        var result = await HandleAuthenticateOnceSafeAsync();
        var refused = result.Failure as ApiKeyRefused;
        Response.StatusCode = refused?.Status ?? 401;
        // RFC 6750 challenges: a bare "Bearer" when no key was sent, error="invalid_token" when the key was refused.
        if (Response.StatusCode == 401) Response.Headers.WWWAuthenticate = refused is null ? "Bearer" : "Bearer error=\"invalid_token\"";
        await Response.WriteAsJsonAsync(new { error = refused?.Message ?? "Send an API key in the Authorization or X-API-Key header." });
    }
}
