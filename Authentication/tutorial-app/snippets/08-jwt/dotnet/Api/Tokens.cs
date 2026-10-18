using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

public sealed record User(string Id, string Email);

/// <summary>
/// Issuing and checking access tokens. Every check is explicit: the algorithm, the issuer, the audience, the time
/// claims (with a small clock skew) and the claims that must be present.
/// </summary>
public static class Tokens
{
    public const string Issuer = "https://auth.example.com"; // who made the token
    public const string Audience = "https://api.example.com"; // which API it is for
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10); // access tokens live 10 minutes
    public static readonly TimeSpan ClockSkew = TimeSpan.FromSeconds(30); // the default is 5 minutes: too generous
    private static readonly string[] Required = ["iss", "sub", "aud", "exp", "nbf", "iat", "jti"];

    public static string Issue(KeyRing ring, User user, TimeProvider clock)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var key = ring.Current;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = now + Lifetime,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = user.Id, // a stable ID that is never reused, not the email
                ["email"] = user.Email, // never put secrets here: anyone can read the payload
                ["jti"] = Guid.NewGuid().ToString(), // a unique ID for this token, for logs and deny-lists
            },
            SigningCredentials = new SigningCredentials(key.PrivateKey, KeyRing.Alg), // adds "kid" to the header
        });
    }

    public static TokenValidationParameters Validation(KeyRing ring) => new()
    {
        ValidAlgorithms = [KeyRing.Alg], // the allowlist: "none", HS256 and everything else is refused
        ValidIssuer = Issuer,
        ValidAudience = Audience,
        ClockSkew = ClockSkew, // exp and nbf are compared with the system clock (TimeProvider here is internal)
        RequireSignedTokens = true,
        RequireExpirationTime = true,
        RequireAudience = true,
        // Choose the verification key by the token's kid. An unknown kid fails; never fall back to "any key".
        IssuerSigningKeyResolver = (_, _, kid, _) => ring.Find(kid) is { } key ? [key.PublicKey] : [],
        TryAllIssuerSigningKeys = false, // the default, true, tries every configured key when none matches the kid
    };

    /// <summary>The first required claim the token lacks, or null. (exp, iss and aud are already enforced above.)</summary>
    public static string? MissingClaim(JsonWebToken token) => Required.FirstOrDefault(name => !token.TryGetClaim(name, out _));
}
