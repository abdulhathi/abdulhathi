using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

public class StorageTests
{
    private static readonly SecretBox Box = new(RandomNumberGenerator.GetBytes(32));
    private static readonly byte[] Secret = RandomNumberGenerator.GetBytes(20);
    // Cheap for tests; the app uses 210,000 iterations.
    private static readonly RecoveryCodes Recovery = new(Options.Create(new PasswordHasherOptions { IterationCount = 1_000 }));

    [Fact]
    public void A_sealed_secret_opens_with_the_same_key_and_email_and_looks_different_every_time()
    {
        var a = Box.Seal(Secret, "ada@example.com");
        var b = Box.Seal(Secret, "ada@example.com");
        Assert.Matches(@"^v1\.[\w-]+$", a);
        Assert.NotEqual(a, b); // a fresh nonce each time
        Assert.Equal(Secret, Box.Open(a, "ada@example.com"));
    }

    [Fact]
    public void A_changed_byte_another_users_email_or_another_key_fails_to_open()
    {
        var sealedValue = Box.Seal(Secret, "ada@example.com");
        var raw = Base64Url.DecodeFromChars(sealedValue.AsSpan(3));
        raw[20] ^= 1;
        Assert.ThrowsAny<CryptographicException>(() => Box.Open("v1." + Base64Url.EncodeToString(raw), "ada@example.com"));
        Assert.ThrowsAny<CryptographicException>(() => Box.Open(sealedValue, "bo@example.com"));
        Assert.ThrowsAny<CryptographicException>(() => new SecretBox(RandomNumberGenerator.GetBytes(32)).Open(sealedValue, "ada@example.com"));
    }

    [Fact]
    public void Ten_recovery_codes_each_stored_only_as_a_hash_with_its_own_salt()
    {
        var codes = RecoveryCodes.New();
        Assert.Equal(10, codes.Distinct().Count());
        Assert.All(codes, code => Assert.Matches("^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$", code));
        var stored = Recovery.Hash(codes);
        Assert.Equal(10, stored.Count);
        Assert.Equal(10, stored.Select(c => Convert.ToBase64String(c.Salt)).Distinct().Count()); // a different salt for every code
        Assert.All(stored, c => Assert.Equal(16, c.Salt.Length)); // NIST asks for at least 32 bits
        var everything = JsonSerializer.Serialize(stored) + string.Concat(stored.Select(c => Encoding.Latin1.GetString(c.Hash)));
        Assert.All(codes, code => Assert.DoesNotContain(code.Replace("-", ""), everything));
    }

    [Fact]
    public void Each_recovery_code_works_once_typed_in_any_case_with_or_without_the_dash()
    {
        var codes = RecoveryCodes.New();
        var stored = Recovery.Hash(codes);
        Assert.True(Recovery.Use(stored, $" {codes[3].ToUpperInvariant().Replace("-", "")} "));
        Assert.False(Recovery.Use(stored, codes[3]));
        Assert.False(Recovery.Use(stored, "aaaaa-aaaaa"));
        Assert.Equal(9, stored.Count);
        Assert.True(Recovery.Use(stored, codes[9])); // the others still work
    }
}
