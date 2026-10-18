using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>A client registered at the identity provider.</summary>
public sealed record IdpClient(string Id, string SecretHash, string[] RedirectUris, string[] PostLogoutRedirectUris);

/// <summary>What the mock can be told to get wrong, so the tests can prove the relying party notices.</summary>
public enum Misbehavior { None, WrongNonce, WrongAudience, Expired, WrongIssuer, UnknownKid, BadSignature }

/// <summary>
/// A tiny OpenID Connect provider for the lab: discovery, JWKS, authorize, token (with an RS256 ID token), UserInfo
/// and RP-initiated logout. It stands in for Microsoft Entra ID, Google, Okta or Keycloak; never use it for real.
/// </summary>
public sealed partial class MockIdp
{
    public const int CodeTtlSeconds = 60;
    public const int TokenTtlSeconds = 300;
    private static readonly Dictionary<string, object> TestUser = new()
    {
        ["sub"] = "u-1001", ["name"] = "Ada Example", ["email"] = "ada@example.com", ["email_verified"] = true,
    };

    private sealed record CodeGrant(string ClientId, string RedirectUri, string CodeChallenge, string? Nonce, string Scope, long AuthTime, DateTimeOffset ExpiresAt);
    private sealed record AccessGrant(string Sub, string Scope, DateTimeOffset ExpiresAt);

    private readonly ConcurrentDictionary<string, CodeGrant> _codes = new();
    private readonly ConcurrentDictionary<string, AccessGrant> _accessTokens = new();
    private readonly IdpClient[] _clients;
    private readonly RsaSecurityKey _key;
    private readonly RSA _rogue = RSA.Create(2048); // never published: for the UnknownKid and BadSignature tests
    private readonly object _jwk;

    public string Issuer { get; }
    /// <summary>Test hook: makes the next ID tokens wrong in one way.</summary>
    public Misbehavior Misbehave { get; set; } = Misbehavior.None;

    public MockIdp(string issuer, params IdpClient[] clients)
    {
        Issuer = issuer;
        _clients = clients;
        // The signing key is made at start-up; its kid is its RFC 7638 thumbprint, so a new key always gets a new kid.
        var rsa = RSA.Create(2048);
        var jwk = JsonWebKeyConverter.ConvertFromRSASecurityKey(new RsaSecurityKey(rsa.ExportParameters(false)));
        var kid = Base64UrlEncoder.Encode(jwk.ComputeJwkThumbprint());
        _key = new RsaSecurityKey(rsa) { KeyId = kid };
        _jwk = new { kty = "RSA", n = jwk.N, e = jwk.E, kid, use = "sig", alg = "RS256" }; // public parts only
    }

    public object Discovery() => new Dictionary<string, object>
    {
        ["issuer"] = Issuer,
        ["authorization_endpoint"] = $"{Issuer}/authorize",
        ["token_endpoint"] = $"{Issuer}/token",
        ["userinfo_endpoint"] = $"{Issuer}/userinfo",
        ["jwks_uri"] = $"{Issuer}/jwks",
        ["end_session_endpoint"] = $"{Issuer}/logout",
        ["response_types_supported"] = new[] { "code" },
        ["grant_types_supported"] = new[] { "authorization_code" },
        ["subject_types_supported"] = new[] { "public" },
        ["id_token_signing_alg_values_supported"] = new[] { "RS256" },
        ["scopes_supported"] = new[] { "openid", "profile", "email" },
        ["token_endpoint_auth_methods_supported"] = new[] { "client_secret_basic", "client_secret_post" },
        ["code_challenge_methods_supported"] = new[] { "S256" },
        ["claims_supported"] = new[] { "sub", "name", "email", "email_verified" },
    };

    public object Jwks() => new { keys = new[] { _jwk } };

    public IResult Authorize(HttpRequest request)
    {
        string Q(string name) => Param(request.Query[name]);
        var client = _clients.FirstOrDefault(c => c.Id == Q("client_id"));
        // Until the client and redirect_uri are known to be good, never redirect: show the error here instead.
        if (client is null) return OAuthError(400, "invalid_request", "Unknown client_id.");
        var redirectUri = Q("redirect_uri");
        if (!client.RedirectUris.Contains(redirectUri)) return OAuthError(400, "invalid_request", "redirect_uri is not registered for this client.");
        var state = Q("state");
        IResult Fail(string error, string description) =>
            Results.Redirect(WithParams(redirectUri, ("error", error), ("error_description", description), ("state", state)));

        if (Q("response_type") != "code") return Fail("unsupported_response_type", "Only response_type=code is supported.");
        if (!Q("scope").Split(' ').Contains("openid")) return Fail("invalid_scope", "The openid scope is required.");
        if (Q("code_challenge") == "" || Q("code_challenge_method") != "S256") return Fail("invalid_request", "PKCE with S256 is required.");

        // A real provider shows its sign-in page here (and remembers the user in its own session cookie).
        // To keep the flow to one request, this one signs in the test user straight away.
        var code = RandomToken();
        var now = DateTimeOffset.UtcNow;
        _codes[code] = new CodeGrant(client.Id, redirectUri, Q("code_challenge"), Q("nonce") is { Length: > 0 } n ? n : null, Q("scope"),
            now.ToUnixTimeSeconds(), now.AddSeconds(CodeTtlSeconds));
        return Results.Redirect(WithParams(redirectUri, ("code", code), ("state", state)));
    }

    public async Task<IResult> Token(HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-store";
        var form = context.Request.HasFormContentType ? await context.Request.ReadFormAsync() : FormCollection.Empty;
        string F(string name) => Param(form[name]);
        if (F("grant_type") != "authorization_code") return OAuthError(400, "unsupported_grant_type", "Only authorization_code is supported.");
        var client = AuthenticateClient(context.Request, form);
        if (client is null)
        {
            context.Response.Headers.WWWAuthenticate = "Basic realm=\"token\"";
            return OAuthError(401, "invalid_client", "Client authentication failed.");
        }
        // Single use: the code leaves the store before any other check.
        _codes.TryRemove(F("code"), out var saved);
        if (saved is null || saved.ExpiresAt <= DateTimeOffset.UtcNow) return OAuthError(400, "invalid_grant", "The code is invalid, expired or already used.");
        if (saved.ClientId != client.Id) return OAuthError(400, "invalid_grant", "The code was issued to another client.");
        if (saved.RedirectUri != F("redirect_uri")) return OAuthError(400, "invalid_grant", "redirect_uri does not match the authorization request.");
        var verifier = F("code_verifier");
        var challenge = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        if (!VerifierFormat().IsMatch(verifier) || !SafeEqual(challenge, saved.CodeChallenge))
            return OAuthError(400, "invalid_grant", "code_verifier does not match the code_challenge.");

        var accessToken = RandomToken(); // opaque: only this provider can read it, at the UserInfo endpoint
        _accessTokens[accessToken] = new AccessGrant((string)TestUser["sub"], saved.Scope, DateTimeOffset.UtcNow.AddSeconds(TokenTtlSeconds));
        return Results.Json(new
        {
            access_token = accessToken, token_type = "Bearer", expires_in = TokenTtlSeconds,
            id_token = IdToken(saved, client.Id), scope = saved.Scope,
        });
    }

    /// <summary>The ID token: a signed statement that this user signed in, for this client, just now.</summary>
    private string IdToken(CodeGrant grant, string clientId)
    {
        var now = DateTimeOffset.UtcNow;
        string issuer = Issuer, audience = clientId;
        string? nonce = grant.Nonce;
        DateTimeOffset issuedAt = now, expires = now.AddSeconds(TokenTtlSeconds);
        var key = _key;
        switch (Misbehave)
        {
            case Misbehavior.WrongNonce: nonce = "not-the-nonce-you-sent"; break;
            // Issued to another app; azp names this one, which must not be enough to accept it.
            case Misbehavior.WrongAudience: audience = "another-app"; break;
            case Misbehavior.Expired: issuedAt = now.AddMinutes(-15); expires = now.AddMinutes(-10); break;
            case Misbehavior.WrongIssuer: issuer = "https://evil.example.com"; break;
            case Misbehavior.UnknownKid: key = new RsaSecurityKey(_rogue) { KeyId = "unknown-key" }; break;
            // A forgery: the real kid, but a signature made with a key the provider never published.
            case Misbehavior.BadSignature: key = new RsaSecurityKey(_rogue) { KeyId = _key.KeyId }; break;
        }
        var claims = new Dictionary<string, object> { ["sub"] = TestUser["sub"], ["auth_time"] = grant.AuthTime };
        if (nonce is not null) claims["nonce"] = nonce;
        if (Misbehave == Misbehavior.WrongAudience) claims["azp"] = clientId;
        return new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer, Audience = audience, IssuedAt = issuedAt.UtcDateTime, Expires = expires.UtcDateTime, Claims = claims,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
        });
    }

    public IResult UserInfo(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..] : "";
        if (!_accessTokens.TryGetValue(token, out var grant) || grant.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            request.HttpContext.Response.Headers.WWWAuthenticate = "Bearer error=\"invalid_token\"";
            return OAuthError(401, "invalid_token", "The access token is invalid or expired.");
        }
        // Only the claims the granted scopes allow.
        var scopes = grant.Scope.Split(' ');
        var claims = new Dictionary<string, object> { ["sub"] = grant.Sub };
        if (scopes.Contains("profile")) claims["name"] = TestUser["name"];
        if (scopes.Contains("email")) { claims["email"] = TestUser["email"]; claims["email_verified"] = TestUser["email_verified"]; }
        return Results.Json(claims);
    }

    /// <summary>RP-initiated logout: end the provider's session, then send the browser back to a registered address.</summary>
    public async Task<IResult> Logout(HttpRequest request)
    {
        string Q(string name) => Param(request.Query[name]);
        var clientId = Q("client_id");
        if (Q("id_token_hint") is { Length: > 0 } hint)
        {
            // The hint must be one of our own ID tokens. It may have expired: that is fine for a logout.
            var result = await new JsonWebTokenHandler().ValidateTokenAsync(hint, new TokenValidationParameters
            {
                ValidIssuer = Issuer, IssuerSigningKey = _key, ValidateAudience = false, ValidateLifetime = false,
            });
            if (!result.IsValid) return OAuthError(400, "invalid_request", "id_token_hint is not valid.");
            if (clientId == "") clientId = ((JsonWebToken)result.SecurityToken).Audiences.FirstOrDefault() ?? "";
        }
        // A real provider clears its own session cookie here, and may ask "Sign out of all apps?"
        var target = Q("post_logout_redirect_uri");
        if (target == "") return Results.Json(new { message = "Signed out of the identity provider." });
        var client = _clients.FirstOrDefault(c => c.Id == clientId);
        if (client is null || !client.PostLogoutRedirectUris.Contains(target))
            return OAuthError(400, "invalid_request", "post_logout_redirect_uri is not registered.");
        return Results.Redirect(WithParams(target, ("state", Q("state"))));
    }

    private IdpClient? AuthenticateClient(HttpRequest request, IFormCollection form)
    {
        var id = Param(form["client_id"]);
        var secret = Param(form["client_secret"]);
        var header = request.Headers.Authorization.ToString();
        if (header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            string decoded;
            try { decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header[6..])); }
            catch (FormatException) { return null; }
            var colon = decoded.IndexOf(':');
            if (colon < 0) return null;
            id = Uri.UnescapeDataString(decoded[..colon].Replace('+', ' '));
            secret = Uri.UnescapeDataString(decoded[(colon + 1)..].Replace('+', ' '));
        }
        var client = _clients.FirstOrDefault(c => c.Id == id);
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(secret)));
        return client is not null && secret != "" && SafeEqual(hash, client.SecretHash) ? client : null;
    }

    private static IResult OAuthError(int status, string error, string description) =>
        Results.Json(new { error, error_description = description }, statusCode: status);

    private static string Param(StringValues values) => values.Count == 1 ? values[0] ?? "" : "";

    private static string WithParams(string uri, params (string Key, string Value)[] parameters) =>
        uri + (uri.Contains('?') ? '&' : '?') +
        string.Join('&', parameters.Where(p => p.Value != "").Select(p => $"{p.Key}={Uri.EscapeDataString(p.Value)}"));

    private static string RandomToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    private static bool SafeEqual(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));

    [GeneratedRegex(@"^[A-Za-z0-9\-._~]{43,128}$")]
    private static partial Regex VerifierFormat();
}

public static class MockIdpEndpoints
{
    /// <summary>Serves the mock provider under a path prefix, so its issuer is e.g. http://localhost:3000/idp.</summary>
    public static void MapMockIdp(this IEndpointRouteBuilder app, string prefix)
    {
        var idp = app.MapGroup(prefix);
        idp.MapGet("/.well-known/openid-configuration", (MockIdp p) => Results.Json(p.Discovery()));
        idp.MapGet("/jwks", (MockIdp p) => Results.Json(p.Jwks()));
        idp.MapGet("/authorize", (HttpRequest request, MockIdp p) => p.Authorize(request));
        idp.MapPost("/token", (HttpContext context, MockIdp p) => p.Token(context));
        idp.MapGet("/userinfo", (HttpRequest request, MockIdp p) => p.UserInfo(request));
        idp.MapGet("/logout", (HttpRequest request, MockIdp p) => p.Logout(request));
    }
}
