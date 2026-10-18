using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// A deliberately small OAuth 2.0 authorization server: GET /authorize and POST /token (RFC 6749, RFC 7636).
/// It exists to show what a real one checks. In production use Keycloak, Microsoft Entra ID, Okta, Auth0,
/// Duende IdentityServer or OpenIddict.
/// </summary>
/// <param name="revoked">The jti of every access token that must no longer work. The resource server checks it too.</param>
public sealed class AuthorizationServer(string issuer, SecurityKey signingKey, TimeProvider clock, RevokedTokens revoked)
{
    public const int CodeTtlSeconds = 60; // codes are short-lived and single-use
    public const int TokenTtlSeconds = 600;
    public const string Audience = "photo-api"; // the resource server these access tokens are for
    private const string TestUser = "u-1001";
    private const string ScopeError = "The requested scope is invalid or not allowed for this client.";

    private sealed record CodeGrant(string ClientId, string RedirectUri, string CodeChallenge, string Scope, string Sub, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CodeGrant> _codes = new(); // a real server uses a shared store with expiry
    // Codes already redeemed, with the jti of the token each one gave, kept as long as that token lives.
    private readonly ConcurrentDictionary<string, (string Jti, DateTimeOffset ExpiresAt)> _usedCodes = new();

    private static IResult OAuthError(int status, string error, string description) =>
        Results.Json(new { error, error_description = description }, statusCode: status);

    /// <summary>One value per parameter: RFC 6749 says a parameter must not appear twice.</summary>
    private static string Param(StringValues values) => values.Count == 1 ? values[0] ?? "" : "";

    /// <summary>Adds query parameters to a URI, percent-encoding every value.</summary>
    private static string WithParams(string uri, params (string Key, string Value)[] parameters) =>
        uri + (uri.Contains('?') ? '&' : '?') +
        string.Join('&', parameters.Where(p => p.Value != "").Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));

    private static bool ScopesAllowed(string scope, Client client)
    {
        var asked = scope.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return asked.Length > 0 && asked.All(client.Scopes.Contains);
    }

    public IResult Authorize(HttpRequest request)
    {
        string Q(string name) => Param(request.Query[name]);
        var client = Clients.Find(Q("client_id"));
        // Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
        if (client is null || !client.Grants.Contains("authorization_code")) return OAuthError(400, "invalid_request", "Unknown client_id.");
        var redirectUri = Q("redirect_uri");
        if (!client.RedirectUris.Contains(redirectUri)) return OAuthError(400, "invalid_request", "redirect_uri is not registered for this client.");
        var state = Q("state");
        // Every response that goes back to the client carries iss (RFC 9207), so the client can tell which server sent it.
        IResult Fail(string error, string description) =>
            Results.Redirect(WithParams(redirectUri, ("error", error), ("error_description", description), ("state", state), ("iss", issuer)));

        if (Q("response_type") != "code") return Fail("unsupported_response_type", "Only response_type=code is supported.");
        if (Q("code_challenge") == "" || Q("code_challenge_method") != "S256") return Fail("invalid_request", "PKCE with S256 is required.");
        if (!ScopesAllowed(Q("scope"), client)) return Fail("invalid_scope", ScopeError);

        // A real server now shows its sign-in page, then a consent screen ("photo-app wants to read your photos").
        // To keep the flow to one request, this one signs in the test user straight away.
        var code = Pkce.RandomToken();
        _codes[code] = new CodeGrant(client.Id, redirectUri, Q("code_challenge"), Q("scope"), TestUser,
            clock.GetUtcNow().AddSeconds(CodeTtlSeconds));
        return Results.Redirect(WithParams(redirectUri, ("code", code), ("state", state), ("iss", issuer)));
    }

    public async Task<IResult> Token(HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-store"; // tokens must never be cached
        var form = context.Request.HasFormContentType ? await context.Request.ReadFormAsync() : FormCollection.Empty;
        string F(string name) => Param(form[name]);
        var grant = F("grant_type");
        // The implicit and password grants are not offered: RFC 9700 says not to use them.
        if (grant is not ("authorization_code" or "client_credentials"))
            return OAuthError(400, "unsupported_grant_type", "Use authorization_code or client_credentials.");
        var client = AuthenticateClient(context.Request, form);
        if (client is null)
        {
            context.Response.Headers.WWWAuthenticate = "Basic realm=\"token\"";
            return OAuthError(401, "invalid_client", "Client authentication failed.");
        }
        if (!client.Grants.Contains(grant)) return OAuthError(400, "unauthorized_client", "This client may not use this grant type.");

        if (grant == "client_credentials")
        {
            var scope = F("scope") is { Length: > 0 } asked ? asked : string.Join(' ', client.Scopes);
            if (!ScopesAllowed(scope, client)) return OAuthError(400, "invalid_scope", ScopeError);
            // No user is involved: the client is the subject. No refresh token either (RFC 6749 section 4.4.3).
            return Issued(AccessToken(client.Id, client.Id, scope).Token, scope);
        }

        var code = F("code");
        // A code that was already redeemed has leaked: refuse it and revoke the token it gave (RFC 6749 section 4.1.2).
        if (_usedCodes.TryRemove(code, out var used))
        {
            if (used.ExpiresAt > clock.GetUtcNow()) revoked.Add(used.Jti);
            return OAuthError(400, "invalid_grant", "The code is invalid, expired or already used.");
        }
        // authorization_code: take the code out of the store first, so it is used up even if a check below fails.
        _codes.TryRemove(code, out var saved);
        if (saved is null || saved.ExpiresAt <= clock.GetUtcNow())
            return OAuthError(400, "invalid_grant", "The code is invalid, expired or already used.");
        if (saved.ClientId != client.Id) return OAuthError(400, "invalid_grant", "The code was issued to another client.");
        if (saved.RedirectUri != F("redirect_uri")) return OAuthError(400, "invalid_grant", "redirect_uri does not match the authorization request.");
        var verifier = F("code_verifier");
        if (!Pkce.VerifierFormat().IsMatch(verifier) || !Pkce.SafeEqual(Pkce.ChallengeFor(verifier), saved.CodeChallenge))
            return OAuthError(400, "invalid_grant", "code_verifier does not match the code_challenge.");
        var (token, jti) = AccessToken(saved.Sub, client.Id, saved.Scope);
        _usedCodes[code] = (jti, clock.GetUtcNow().AddSeconds(TokenTtlSeconds));
        return Issued(token, saved.Scope);
    }

    private static IResult Issued(string token, string scope) =>
        Results.Json(new { access_token = token, token_type = "Bearer", expires_in = TokenTtlSeconds, scope });

    /// <summary>Signs an access token; returns it with its jti, the id that lets the server revoke it later.</summary>
    private (string Token, string Jti) AccessToken(string sub, string clientId, string scope)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var jti = Pkce.RandomToken(16);
        // A JWT access token in the shape of RFC 9068: typ "at+jwt", so it cannot be mistaken for an ID token.
        var token = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            TokenType = "at+jwt",
            Issuer = issuer,
            Audience = Audience,
            IssuedAt = now,
            Expires = now.AddSeconds(TokenTtlSeconds),
            Claims = new Dictionary<string, object> { ["sub"] = sub, ["client_id"] = clientId, ["scope"] = scope, ["jti"] = jti },
            SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.RsaSha256),
        });
        return (token, jti);
    }

    /// <summary>client_secret_basic (an Authorization: Basic header) or client_secret_post (fields in the form).</summary>
    private static Client? AuthenticateClient(HttpRequest request, IFormCollection form)
    {
        var id = Param(form["client_id"]);
        string? secret = Param(form["client_secret"]) is { Length: > 0 } s ? s : null;
        var header = request.Headers.Authorization.ToString();
        if (header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            string decoded;
            try { decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..])); }
            catch (FormatException) { return null; }
            var colon = decoded.IndexOf(':');
            if (colon < 0) return null;
            id = FormDecode(decoded[..colon]);
            secret = FormDecode(decoded[(colon + 1)..]);
        }
        var client = Clients.Find(id);
        if (client is null) return null;
        if (client.SecretHash is null) return client; // a public client has no secret to check
        return secret is not null && Pkce.SafeEqual(Pkce.Sha256Hex(secret), client.SecretHash) ? client : null;
    }

    private static string FormDecode(string s) => Uri.UnescapeDataString(s.Replace('+', ' '));
}

/// <summary>The jti values of revoked access tokens, shared by the authorization server and the resource server.</summary>
public sealed class RevokedTokens
{
    private readonly ConcurrentDictionary<string, bool> _jtis = new();
    public void Add(string jti) => _jtis[jti] = true;
    public bool Contains(string jti) => _jtis.ContainsKey(jti);
}

public static class AuthorizationServerEndpoints
{
    public static void MapAuthorizationServer(this IEndpointRouteBuilder app)
    {
        app.MapGet("/authorize", (HttpRequest request, AuthorizationServer server) => server.Authorize(request));
        app.MapPost("/token", (HttpContext context, AuthorizationServer server) => server.Token(context));
    }
}
