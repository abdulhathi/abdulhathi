using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>The key that signs and checks tokens: random at start-up, so tokens from an earlier run stop working.</summary>
public sealed record TokenKey(byte[] Bytes)
{
    public static TokenKey Random() => new(RandomNumberGenerator.GetBytes(32));
    public SymmetricSecurityKey SecurityKey => new(Bytes);
}

/// <summary>
/// Who is calling? A small HS256 JWT carries the user's id, tenant, roles, department and the token's scopes.
/// Signing in and issuing real tokens is covered in chapters 04 to 12; here the tests and Program.cs sign them.
/// </summary>
public static class Tokens
{
    public const string Issuer = "auth-lab";
    public const string Audience = "documents-api";
    /// <summary>What the first-party app's tokens may do. A third-party client may get less, such as "documents:read".</summary>
    public const string FullAccess = "documents:read documents:write";

    public static string Sign(TokenKey key, DemoUser user, string scope = FullAccess, DateTime? expires = null)
    {
        var exp = expires ?? DateTime.UtcNow.AddHours(1);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            IssuedAt = exp.AddHours(-1),
            NotBefore = exp.AddHours(-1),
            Expires = exp,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = user.Sub,
                ["tenant"] = user.Tenant,
                ["roles"] = user.Roles,
                ["department"] = user.Department,
                ["scope"] = scope,
            },
            SigningCredentials = new SigningCredentials(key.SecurityKey, SecurityAlgorithms.HmacSha256),
        });
    }

    public static TokenValidationParameters Validation(TokenKey key) => new()
    {
        ValidIssuer = Issuer,
        ValidAudience = Audience,
        IssuerSigningKey = key.SecurityKey,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.Zero, // the default allows tokens five minutes past exp; Node.js and Python allow none
        NameClaimType = "sub",
        RoleClaimType = "roles", // so IsInRole and RequireRole read the "roles" array
    };

    /// <summary>
    /// A validly signed token must still carry every claim the rules read: sub, tenant, department and scope as
    /// non-empty strings, and roles as a JSON array. A missing tenant must never mean "no tenant, so everything".
    /// </summary>
    public static bool HasRequiredClaims(JsonWebToken token) =>
        new[] { "sub", "tenant", "department", "scope" }.All(name => token.TryGetPayloadValue<string>(name, out var value) && value != "")
        && token.TryGetPayloadValue<JsonElement>("roles", out var roles) && roles.ValueKind == JsonValueKind.Array;
}

public static class UserClaims
{
    public static string Id(this ClaimsPrincipal user) => user.FindFirstValue("sub")!;
    public static string Tenant(this ClaimsPrincipal user) => user.FindFirstValue("tenant")!;
    public static string Department(this ClaimsPrincipal user) => user.FindFirstValue("department")!;
    public static bool HasScope(this ClaimsPrincipal user, string scope) =>
        (user.FindFirstValue("scope") ?? "").Split(' ').Contains(scope);
}
