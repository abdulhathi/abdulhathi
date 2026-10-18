using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>The 256-bit secret that signs access tokens, made at start-up.</summary>
public sealed record AccessTokenKey(byte[] Secret)
{
    public static AccessTokenKey New() => new(RandomNumberGenerator.GetBytes(32));
}

/// <summary>
/// Access tokens: short-lived JWTs, validated as in chapter 08. This API issues and checks its own tokens, so HS256
/// with one random secret is enough; switch to chapter 08's RS256 key ring once other services verify them.
/// </summary>
public static class AccessTokens
{
    public const string Issuer = "https://auth.example.com";
    public const string Audience = "https://api.example.com";
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10); // the longest a stolen access token stays useful
    public static readonly string[] Required = ["sub", "iat", "jti"]; // checked in OnTokenValidated (Program.cs)

    public static string Issue(AccessTokenKey key, string userId, string email, TimeProvider clock)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = now + Lifetime,
            Claims = new Dictionary<string, object> { ["sub"] = userId, ["email"] = email, ["jti"] = Guid.NewGuid().ToString() },
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key.Secret), SecurityAlgorithms.HmacSha256),
        });
    }

    public static TokenValidationParameters Validation(AccessTokenKey key) => new()
    {
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        IssuerSigningKey = new SymmetricSecurityKey(key.Secret),
        ValidIssuer = Issuer,
        ValidAudience = Audience,
        ClockSkew = TimeSpan.FromSeconds(30), // exp and nbf are compared with the system clock
        RequireExpirationTime = true,
        RequireSignedTokens = true,
    };
}

/// <summary>
/// Access tokens that must stop working before they expire, by jti. Every request now pays a lookup, which is what
/// JWTs were meant to avoid, so keep the list small: an entry can go as soon as its token would have expired anyway.
/// In production, keep it in Redis with a TTL so every server instance sees it.
/// </summary>
public sealed class DenyList(TimeProvider clock)
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _entries = new(); // jti -> exp

    public void Add(string jti, DateTimeOffset expires)
    {
        _entries[jti] = expires;
        foreach (var (id, until) in _entries) if (until < clock.GetUtcNow()) _entries.TryRemove(id, out _);
    }

    public bool Contains(string jti) => _entries.ContainsKey(jti);
}
