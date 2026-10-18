using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

/// <summary>
/// Encrypts TOTP secrets before they are stored. The server needs the secret itself to compute codes, so it cannot be
/// hashed like a password; instead it is encrypted with AES-256-GCM under a key that lives outside the database.
/// Each value gets a fresh 12-byte nonce, and the user's email is bound in as "associated data", so a secret copied
/// onto another user's row fails to decrypt. Stored form: v1.&lt;base64url(nonce | ciphertext | 16-byte tag)&gt;.
/// "v1" names the key, so a new key can be introduced later and old values re-encrypted.
/// </summary>
public sealed class SecretBox
{
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private readonly byte[] _key;

    public SecretBox(byte[] key)
    {
        if (key.Length != 32) throw new ArgumentException("The encryption key must be 32 bytes (AES-256).");
        _key = key;
    }

    /// <summary>Reads Mfa:EncryptionKey (base64; the environment variable Mfa__EncryptionKey). In production it comes
    /// from a key vault. Without one, a random key is made at start-up, so enrolments last only until the server stops.</summary>
    public static SecretBox FromConfiguration(IConfiguration config, ILogger logger)
    {
        if (config["Mfa:EncryptionKey"] is { } configured) return new(Convert.FromBase64String(configured));
        logger.LogWarning("Mfa:EncryptionKey is not set: using a random key for this run only.");
        return new(RandomNumberGenerator.GetBytes(32));
    }

    public string Seal(byte[] plaintext, string associatedData)
    {
        var output = new byte[NonceSize + plaintext.Length + TagSize];
        var nonce = output.AsSpan(0, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintext, output.AsSpan(NonceSize, plaintext.Length), output.AsSpan(NonceSize + plaintext.Length),
            Encoding.UTF8.GetBytes(associatedData));
        return "v1." + Base64Url.EncodeToString(output);
    }

    /// <summary>Throws if the value, the associated data or the key is not the one it was sealed with.</summary>
    public byte[] Open(string stored, string associatedData)
    {
        if (stored.Split('.') is not ["v1", var data]) throw new FormatException("Unknown secret format.");
        var raw = Base64Url.DecodeFromChars(data);
        var plaintext = new byte[raw.Length - NonceSize - TagSize];
        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(raw.AsSpan(0, NonceSize), raw.AsSpan(NonceSize, plaintext.Length), raw.AsSpan(raw.Length - TagSize), plaintext,
            Encoding.UTF8.GetBytes(associatedData)); // throws AuthenticationTagMismatchException
        return plaintext;
    }
}
