using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

/// <summary>
/// TOTP (RFC 6238) built on HOTP (RFC 4226), written out so you can see every step. Authenticator apps
/// (Google Authenticator, Microsoft Authenticator, 1Password and the rest) use these settings: HMAC-SHA1,
/// 30-second steps, 6 digits.
/// </summary>
public static class Totp
{
    public const int StepSeconds = 30;
    public const int Digits = 6;

    /// <summary>HOTP, RFC 4226: an HMAC-SHA1 of an 8-byte counter, cut down to a short number ("dynamic truncation").</summary>
    public static string Hotp(byte[] secret, long counter, int digits = Digits)
    {
        var message = new byte[8];
        BinaryPrimitives.WriteInt64BigEndian(message, counter); // the counter as 8 bytes, most significant first
        var mac = HMACSHA1.HashData(secret, message); // 20 bytes
        var offset = mac[^1] & 0x0f; // the low 4 bits of the last byte say where to read
        var binary = BinaryPrimitives.ReadInt32BigEndian(mac.AsSpan(offset, 4)) & 0x7fffffff; // top bit cleared
        return (binary % (int)Math.Pow(10, digits)).ToString().PadLeft(digits, '0');
    }

    /// <summary>TOTP, RFC 6238: HOTP where the counter is the number of 30-second steps since 1970.</summary>
    public static long StepAt(DateTimeOffset time) => time.ToUnixTimeSeconds() / StepSeconds;

    public static string Compute(byte[] secret, DateTimeOffset time, int digits = Digits) => Hotp(secret, StepAt(time), digits);

    /// <summary>
    /// Checks a typed code against the step before, the current step and the step after (phone clocks drift and people
    /// type slowly), and refuses any step at or before the last one used, so each code works once.
    /// Returns the step that matched, which the caller saves as the new "last used step", or null.
    /// </summary>
    public static long? Verify(byte[] secret, string code, DateTimeOffset now, long lastUsedStep = -1, int window = 1)
    {
        var typed = Regex.Replace(code, @"\s", "");
        if (!Regex.IsMatch(typed, "^[0-9]{6}$")) return null;
        var current = StepAt(now);
        long? match = null;
        for (var step = current - window; step <= current + window; step++)
        {
            // Check every step, comparing in constant time, so the time taken says nothing about which one matched.
            var same = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(typed), Encoding.ASCII.GetBytes(Hotp(secret, step)));
            if (same && step > lastUsedStep) match = step;
        }
        return match;
    }

    /// <summary>A new shared secret: 160 random bits, the length RFC 4226 recommends for HMAC-SHA1.</summary>
    public static byte[] NewSecret() => RandomNumberGenerator.GetBytes(20);

    /// <summary>The Key URI an authenticator app reads from a QR code.</summary>
    public static string OtpauthUri(string secretBase32, string account, string issuer) =>
        $"otpauth://totp/{Uri.EscapeDataString(issuer)}:{Uri.EscapeDataString(account)}" +
        $"?secret={secretBase32}&issuer={Uri.EscapeDataString(issuer)}&algorithm=SHA1&digits={Digits}&period={StepSeconds}";
}

/// <summary>Base32 (RFC 4648) without "=" padding: the form an authenticator app expects. .NET has no built-in base32.</summary>
public static class Base32
{
    private const string Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    public static string Encode(ReadOnlySpan<byte> bytes)
    {
        var output = new StringBuilder();
        int bits = 0, value = 0;
        foreach (var b in bytes)
        {
            value = (value << 8) | b;
            bits += 8;
            while (bits >= 5)
            {
                bits -= 5;
                output.Append(Alphabet[(value >> bits) & 31]);
            }
            value &= (1 << bits) - 1; // keep only the bits not written yet
        }
        if (bits > 0) output.Append(Alphabet[(value << (5 - bits)) & 31]);
        return output.ToString();
    }

    public static byte[] Decode(string text)
    {
        var output = new List<byte>();
        int bits = 0, value = 0;
        foreach (var c in text.ToUpperInvariant())
        {
            if (char.IsWhiteSpace(c) || c is '=' or '-') continue;
            var index = Alphabet.IndexOf(c);
            if (index < 0) throw new FormatException($"Not a base32 character: {c}");
            value = (value << 5) | index;
            bits += 5;
            if (bits >= 8)
            {
                bits -= 8;
                output.Add((byte)((value >> bits) & 0xff));
                value &= (1 << bits) - 1;
            }
        }
        return [.. output];
    }
}
