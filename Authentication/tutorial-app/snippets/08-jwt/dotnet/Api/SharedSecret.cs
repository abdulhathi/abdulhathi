using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// HS256: one shared secret both signs and verifies. It suits a single service that issues and checks its own
/// tokens. It does not suit tokens other services verify: every service holding the secret could also forge tokens.
/// </summary>
public static class SharedSecret
{
    /// <summary>At least 256 random bits (RFC 7518 section 3.2). In production, load it from a secret store.</summary>
    public static byte[] NewSecret() => RandomNumberGenerator.GetBytes(32);

    public static string Sign(string sub, byte[] secret) => new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
    {
        Issuer = Tokens.Issuer,
        Audience = Tokens.Audience,
        Claims = new Dictionary<string, object> { ["sub"] = sub },
        Expires = DateTime.UtcNow + Tokens.Lifetime,
        SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(secret), SecurityAlgorithms.HmacSha256),
    });

    public static Task<TokenValidationResult> Verify(string token, byte[] secret) =>
        new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            IssuerSigningKey = new SymmetricSecurityKey(secret),
            ValidIssuer = Tokens.Issuer,
            ValidAudience = Tokens.Audience,
            ClockSkew = Tokens.ClockSkew,
        });
}
