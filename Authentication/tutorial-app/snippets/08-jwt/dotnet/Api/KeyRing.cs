using System.Security.Cryptography;
using Microsoft.IdentityModel.Tokens;

/// <summary>One public key as published in the JWKS (RFC 7517).</summary>
public sealed record PublicJwk(string Kty, string Use, string Alg, string Kid, string N, string E);

public sealed record SigningKey(string Kid, RsaSecurityKey PrivateKey, RsaSecurityKey PublicKey, PublicJwk PublicJwk);

/// <summary>
/// A key ring for RS256. The newest key signs new tokens; older keys stay published, so the tokens they signed still
/// verify, until they are retired. Keys are generated at start-up and never written to disk: a real issuer keeps its
/// private keys in a key vault or HSM.
/// </summary>
public sealed class KeyRing
{
    public const string Alg = SecurityAlgorithms.RsaSha256; // "RS256"
    private readonly Lock _lock = new();
    private List<SigningKey> _keys = [NewSigningKey()];

    public static SigningKey NewSigningKey()
    {
        var rsa = RSA.Create(2048);
        var publicParams = rsa.ExportParameters(includePrivateParameters: false);
        var jwk = JsonWebKeyConverter.ConvertFromRSASecurityKey(new RsaSecurityKey(publicParams));
        // The key ID is the key's RFC 7638 thumbprint (a SHA-256 of its public parts), so it can never clash.
        var kid = Base64UrlEncoder.Encode(jwk.ComputeJwkThumbprint());
        return new SigningKey(
            kid,
            new RsaSecurityKey(rsa) { KeyId = kid },
            new RsaSecurityKey(publicParams) { KeyId = kid },
            new PublicJwk("RSA", "sig", Alg, kid, jwk.N, jwk.E));
    }

    /// <summary>The key that signs new tokens: the newest one.</summary>
    public SigningKey Current { get { lock (_lock) return _keys[^1]; } }

    /// <summary>The key with this ID, or null if the ring never had it or has retired it.</summary>
    public SigningKey? Find(string? kid) { lock (_lock) return _keys.Find(k => k.Kid == kid); }

    /// <summary>Start signing with a new key. Older keys keep verifying the tokens they already signed.</summary>
    public SigningKey Rotate()
    {
        var key = NewSigningKey();
        lock (_lock) _keys = [.. _keys, key];
        return key;
    }

    /// <summary>Stop trusting a key. Do this once every token it signed has expired.</summary>
    public void Retire(string kid) { lock (_lock) _keys = _keys.Where(k => k.Kid != kid).ToList(); }

    /// <summary>The JSON Web Key Set served at /.well-known/jwks.json: public keys only.</summary>
    public object Jwks() { lock (_lock) return new { keys = _keys.Select(k => k.PublicJwk).ToArray() }; }
}
