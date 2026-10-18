using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

/// <summary>One stored entry per code; the code itself is not kept.</summary>
public sealed record RecoveryCode(byte[] Salt, byte[] Hash);

/// <summary>
/// Ten single-use recovery codes, for the day the phone with the authenticator app is lost. Each code is 10 characters
/// from a 32-letter alphabet (50 random bits) and is shown to the user once. NIST SP 800-63B calls them "look-up
/// secrets": below 112 bits, each one is stored salted and hashed with a password hashing scheme, with its own salt
/// (the salt and the hash are stored for each secret). So every code gets its own random salt and PBKDF2-HMAC-SHA512,
/// the algorithm inside Identity's password hasher, with the same iteration count. Checking a typed code means hashing
/// it once per unused code, stopping at the first match.
/// </summary>
public sealed class RecoveryCodes(IOptions<PasswordHasherOptions> options)
{
    public const int Count = 10;
    private const string Alphabet = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford's base32: no i, l, o or u to misread
    private readonly int _iterations = options.Value.IterationCount;

    /// <summary>"7gk2m-x9q4d": the dash is only for reading; it is ignored when the code is typed.</summary>
    public static string[] New() =>
        Enumerable.Range(0, Count).Select(_ =>
        {
            var chars = string.Concat(RandomNumberGenerator.GetBytes(10).Select(b => Alphabet[b & 31])); // 256 is a multiple of 32: no bias
            return $"{chars[..5]}-{chars[5..]}";
        }).ToArray();

    public static string Normalize(string code) =>
        string.Concat(code.Where(c => !char.IsWhiteSpace(c) && c != '-')).ToLowerInvariant();

    public List<RecoveryCode> Hash(IEnumerable<string> codes) =>
        codes.Select(code =>
        {
            var salt = RandomNumberGenerator.GetBytes(16); // a new salt for every code
            return new RecoveryCode(salt, Derive(code, salt));
        }).ToList();

    /// <summary>
    /// True if the typed code is one of the unused ones. That code is removed, so it works once.
    /// The caller holds the user's lock, so two requests with the same code cannot both succeed.
    /// </summary>
    public bool Use(List<RecoveryCode> codes, string typed)
    {
        var index = codes.FindIndex(c => CryptographicOperations.FixedTimeEquals(Derive(typed, c.Salt), c.Hash));
        if (index < 0) return false;
        codes.RemoveAt(index);
        return true;
    }

    private byte[] Derive(string code, byte[] salt) =>
        Rfc2898DeriveBytes.Pbkdf2(Normalize(code), salt, _iterations, HashAlgorithmName.SHA512, 32);
}
