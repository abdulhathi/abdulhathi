using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

public enum RefreshFailure { Invalid, Reused, Expired }
public sealed record IssuedToken(string Token, DateTimeOffset ExpiresAt);
public abstract record Rotation;
public sealed record Rotated(string UserId, IssuedToken Refresh) : Rotation;
public sealed record Refused(RefreshFailure Reason) : Rotation;

/// <summary>
/// Refresh tokens: long-lived, opaque and single-use. Only a SHA-256 hash of each one is stored, so a leaked table
/// holds nothing an attacker can present. Each sign-in starts a family; every refresh spends the presented token and
/// mints its replacement in the same family.
/// </summary>
public sealed class RefreshTokenStore(TimeProvider clock)
{
    public static readonly TimeSpan RefreshTtl = TimeSpan.FromDays(7); // a token unused for 7 days expires
    public static readonly TimeSpan FamilyTtl = TimeSpan.FromDays(30); // 30 days after sign-in the family ends

    // In production these are two database tables, with an index on the hash.
    public sealed class TokenRecord(string familyId, DateTimeOffset expiresAt)
    {
        public string FamilyId { get; } = familyId;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public DateTimeOffset? UsedAt { get; set; }
    }

    public sealed class Family(string userId, DateTimeOffset expiresAt)
    {
        public string UserId { get; } = userId;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public bool Revoked { get; set; }
    }

    private readonly Lock _lock = new();
    public Dictionary<string, TokenRecord> Tokens { get; } = []; // key: the token's SHA-256, never the token
    public Dictionary<string, Family> Families { get; } = [];

    /// <summary>A fast hash is right here: the token is 256 random bits, so there is nothing to guess (unlike a password).</summary>
    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>At sign-in: a new family and its first refresh token.</summary>
    public IssuedToken Issue(string userId)
    {
        lock (_lock)
        {
            var familyId = Guid.NewGuid().ToString();
            Families[familyId] = new Family(userId, clock.GetUtcNow() + FamilyTtl);
            return Mint(familyId);
        }
    }

    /// <summary>At /auth/refresh: spend the presented token and return its replacement.</summary>
    public Rotation Rotate(string token)
    {
        // One lock makes check-and-spend atomic, so two parallel requests cannot both succeed. In SQL:
        // UPDATE refresh_tokens SET used_at = now() WHERE hash = @hash AND used_at IS NULL
        lock (_lock)
        {
            if (!Tokens.TryGetValue(Hash(token), out var record) || !Families.TryGetValue(record.FamilyId, out var family) || family.Revoked)
                return new Refused(RefreshFailure.Invalid);
            if (record.UsedAt is not null)
            {
                // This token was already exchanged, so two parties hold copies: the user and, probably, a thief. We cannot
                // tell which one is asking, so end the whole family and make both sign in again (RFC 9700, section 4.14).
                family.Revoked = true;
                return new Refused(RefreshFailure.Reused);
            }
            if (clock.GetUtcNow() >= record.ExpiresAt) return new Refused(RefreshFailure.Expired);
            record.UsedAt = clock.GetUtcNow();
            return new Rotated(family.UserId, Mint(record.FamilyId));
        }
    }

    /// <summary>At /auth/logout: end this sign-in (this family) on this device.</summary>
    public void Revoke(string token)
    {
        lock (_lock)
        {
            if (Tokens.TryGetValue(Hash(token), out var record) && Families.TryGetValue(record.FamilyId, out var family))
                family.Revoked = true;
        }
    }

    private IssuedToken Mint(string familyId)
    {
        var family = Families[familyId];
        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32)); // 256 random bits
        // Each token lives 7 days, but never past the family's absolute end.
        var expiresAt = clock.GetUtcNow() + RefreshTtl;
        if (expiresAt > family.ExpiresAt) expiresAt = family.ExpiresAt;
        Tokens[Hash(token)] = new TokenRecord(familyId, expiresAt);
        return new IssuedToken(token, expiresAt);
    }
}
