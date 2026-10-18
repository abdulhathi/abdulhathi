using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.IdentityModel.Tokens;

/// <summary>PKCE (RFC 7636) and the random values OAuth needs. Used by both the client and the authorization server.</summary>
public static partial class Pkce
{
    /// <summary>A random, URL-safe string: 32 bytes give 43 characters. Used for codes, state and verifiers.</summary>
    public static string RandomToken(int bytes = 32) => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(bytes));

    /// <summary>The code_verifier: a fresh secret for every authorization request, kept by the client until the callback.</summary>
    public static string NewVerifier() => RandomToken(32);

    /// <summary>The S256 code_challenge: BASE64URL(SHA-256(code_verifier)), sent in the authorization request.</summary>
    public static string ChallengeFor(string verifier) => Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

    /// <summary>RFC 7636 section 4.1: 43 to 128 characters from the unreserved set.</summary>
    [GeneratedRegex(@"^[A-Za-z0-9\-._~]{43,128}$")]
    public static partial Regex VerifierFormat();

    public static string Sha256Hex(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    /// <summary>Compares two strings in constant time.</summary>
    public static bool SafeEqual(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}
