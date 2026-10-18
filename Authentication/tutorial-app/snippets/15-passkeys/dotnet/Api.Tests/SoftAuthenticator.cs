using System.Buffers.Binary;
using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// A software authenticator for the tests: it does what a phone, laptop or security key does, in one short file.
// It makes an EC P-256 key pair, builds clientDataJSON (what the browser adds), authenticatorData (what the
// authenticator signs) and a "none" attestation object in CBOR, and signs assertions with the private key.

/// <summary>A tiny CBOR encoder (RFC 8949): unsigned and negative integers, byte strings, text strings and maps.</summary>
public static class Cbor
{
    private static byte[] Head(int major, int n) => n switch
    {
        < 24 => [(byte)(major << 5 | n)],
        < 0x100 => [(byte)(major << 5 | 24), (byte)n],
        < 0x10000 => [(byte)(major << 5 | 25), (byte)(n >> 8), (byte)n],
        _ => [(byte)(major << 5 | 26), (byte)(n >> 24), (byte)(n >> 16), (byte)(n >> 8), (byte)n],
    };

    /// <summary>A map is an array of (key, value) pairs, so the order of the keys is kept.</summary>
    public static byte[] Encode(object value) => value switch
    {
        int i when i >= 0 => Head(0, i),
        int i => Head(1, -1 - i),
        string s => [.. Head(3, Encoding.UTF8.GetByteCount(s)), .. Encoding.UTF8.GetBytes(s)],
        byte[] b => [.. Head(2, b.Length), .. b],
        (object Key, object Value)[] map => [.. Head(5, map.Length), .. map.SelectMany(kv => Encode(kv.Key).Concat(Encode(kv.Value)))],
        _ => throw new ArgumentException($"Cannot encode {value.GetType()}"),
    };
}

/// <summary>
/// Change one thing to make a response the server must reject: the origin, the RP ID, the challenge, the user-present
/// (Up) or user-verified (Uv) flag, the backup flags (Synced), the sign count, the user handle, or the signing key.
/// </summary>
public sealed record Tamper(
    string? Origin = null, string? RpId = null, string? Challenge = null, bool Up = true, bool Uv = true,
    bool? Synced = null, uint? SignCount = null, string? UserHandle = null, ECDsa? SignWith = null);

public sealed class SoftAuthenticator(string origin = "http://localhost:3000", bool synced = false)
{
    // authenticatorData flags (WebAuthn Level 3, section 6.1)
    private const byte UP = 0x01; // user present: someone touched or confirmed
    private const byte UV = 0x04; // user verified: biometrics or PIN
    private const byte BE = 0x08; // backup eligible: a synced passkey
    private const byte BS = 0x10; // backup state: it is backed up now
    private const byte AT = 0x40; // attested credential data follows

    public byte[] CredentialId { get; } = RandomNumberGenerator.GetBytes(16);
    private readonly ECDsa _key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private uint _signCount; // synced passkeys always report 0
    private string _userHandle = "";

    /// <summary>What navigator.credentials.create() returns, as JSON.</summary>
    public object Register(JsonElement options, Tamper? t = null)
    {
        t ??= new Tamper();
        _userHandle = options.GetProperty("user").GetProperty("id").GetString()!; // a discoverable credential remembers its account
        var clientData = ClientData("webauthn.create", t.Challenge ?? options.GetProperty("challenge").GetString()!, t.Origin);
        var authData = AuthData(t.RpId ?? options.GetProperty("rp").GetProperty("id").GetString()!, AT, 0, t, AttestedCredentialData());
        var attestationObject = Cbor.Encode(new (object, object)[] { ("fmt", "none"), ("attStmt", Array.Empty<(object, object)>()), ("authData", authData) });
        return new
        {
            id = B64(CredentialId),
            rawId = B64(CredentialId),
            type = "public-key",
            authenticatorAttachment = "platform",
            clientExtensionResults = new { },
            response = new { clientDataJSON = B64(clientData), attestationObject = B64(attestationObject), transports = new[] { "hybrid", "internal" } },
        };
    }

    /// <summary>What navigator.credentials.get() returns, as JSON: a signature over authenticatorData || SHA-256(clientDataJSON).</summary>
    public object Login(JsonElement options, Tamper? t = null)
    {
        t ??= new Tamper();
        if (!synced) _signCount++;
        var clientData = ClientData("webauthn.get", t.Challenge ?? options.GetProperty("challenge").GetString()!, t.Origin);
        var authData = AuthData(t.RpId ?? options.GetProperty("rpId").GetString()!, 0, t.SignCount ?? _signCount, t);
        byte[] signed = [.. authData, .. SHA256.HashData(clientData)];
        var signature = (t.SignWith ?? _key).SignData(signed, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence); // DER, as WebAuthn expects
        return new
        {
            id = B64(CredentialId),
            rawId = B64(CredentialId),
            type = "public-key",
            authenticatorAttachment = "platform",
            clientExtensionResults = new { },
            response = new { clientDataJSON = B64(clientData), authenticatorData = B64(authData), signature = B64(signature), userHandle = t.UserHandle ?? _userHandle },
        };
    }

    private static string B64(byte[] data) => Base64Url.EncodeToString(data);

    // The browser writes this, not the page: the page cannot lie about its own origin.
    private byte[] ClientData(string type, string challenge, string? tamperedOrigin) =>
        JsonSerializer.SerializeToUtf8Bytes(new { type, challenge, origin = tamperedOrigin ?? origin, crossOrigin = false });

    // rpIdHash (32) | flags (1) | signCount (4, big-endian) | attested credential data (registration only)
    private byte[] AuthData(string rpId, byte extraFlags, uint signCount, Tamper t, byte[]? attested = null)
    {
        var flags = (byte)((t.Up ? UP : 0) | (t.Uv ? UV : 0) | ((t.Synced ?? synced) ? BE | BS : 0) | extraFlags);
        var count = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(count, signCount);
        return [.. SHA256.HashData(Encoding.UTF8.GetBytes(rpId)), flags, .. count, .. attested ?? []];
    }

    // AAGUID (16, zeros: "unknown model") | credential ID length (2) | credential ID | public key as a COSE_Key
    private byte[] AttestedCredentialData()
    {
        var q = _key.ExportParameters(false).Q;
        var coseKey = Cbor.Encode(new (object, object)[]
        {
            (1, 2), // kty: EC2
            (3, -7), // alg: ES256
            (-1, 1), // crv: P-256
            (-2, q.X!), // x
            (-3, q.Y!), // y
        });
        return [.. new byte[16], (byte)(CredentialId.Length >> 8), (byte)CredentialId.Length, .. CredentialId, .. coseKey];
    }
}
