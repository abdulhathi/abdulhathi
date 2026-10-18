using System.Text.Json;
using Microsoft.IdentityModel.Tokens;

public class TokenTests
{
    private static JsonElement DecodePart(string part) => JsonDocument.Parse(Base64UrlEncoder.Decode(part)).RootElement;

    [Fact]
    public void A_jwt_is_three_base64url_parts_and_anyone_can_read_the_payload()
    {
        var ring = new KeyRing();
        var now = DateTimeOffset.Parse("2026-10-17T12:00:00Z");
        var token = Tokens.Issue(ring, new User("u_1001", "ada@example.com"), new ManualClock(now));
        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);
        // No key needed to read it: the payload is encoded, not encrypted.
        var header = DecodePart(parts[0]);
        Assert.Equal("RS256", header.GetProperty("alg").GetString());
        Assert.Equal("JWT", header.GetProperty("typ").GetString());
        Assert.Equal(ring.Current.Kid, header.GetProperty("kid").GetString());
        var claims = DecodePart(parts[1]);
        Assert.Equal(Tokens.Issuer, claims.GetProperty("iss").GetString());
        Assert.Equal("u_1001", claims.GetProperty("sub").GetString());
        Assert.Equal(Tokens.Audience, claims.GetProperty("aud").GetString());
        Assert.Equal("ada@example.com", claims.GetProperty("email").GetString());
        var iat = claims.GetProperty("iat").GetInt64();
        Assert.Equal(now.ToUnixTimeSeconds(), iat);
        Assert.Equal(iat, claims.GetProperty("nbf").GetInt64());
        Assert.Equal(600, claims.GetProperty("exp").GetInt64() - iat);
        Assert.Matches("^[0-9a-f-]{36}$", claims.GetProperty("jti").GetString());
    }

    [Fact]
    public async Task Hs256_the_same_secret_signs_and_verifies_any_other_secret_fails()
    {
        var secret = SharedSecret.NewSecret();
        Assert.Equal(32, secret.Length);
        var token = SharedSecret.Sign("u_1001", secret);
        var ok = await SharedSecret.Verify(token, secret);
        Assert.True(ok.IsValid);
        Assert.Equal("u_1001", ok.Claims["sub"]);
        Assert.False((await SharedSecret.Verify(token, SharedSecret.NewSecret())).IsValid);
    }

    [Fact]
    public void The_jwks_holds_public_keys_only_each_with_its_kid()
    {
        var ring = new KeyRing();
        var json = JsonSerializer.Serialize(ring.Jwks(), JsonSerializerOptions.Web);
        var jwk = JsonDocument.Parse(json).RootElement.GetProperty("keys")[0];
        // No d, p, q: nothing private.
        Assert.Equal(["kty", "use", "alg", "kid", "n", "e"], jwk.EnumerateObject().Select(p => p.Name));
        var parsed = new JsonWebKey(jwk.GetRawText());
        Assert.Equal(Base64UrlEncoder.Encode(parsed.ComputeJwkThumbprint()), jwk.GetProperty("kid").GetString());
        var example = new JsonWebKey { Kty = "RSA", N = Rfc7638N, E = "AQAB" };
        Assert.Equal("NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs", Base64UrlEncoder.Encode(example.ComputeJwkThumbprint()));
    }

    // The example RSA key from RFC 7638, section 3.1, and (above) the thumbprint the RFC gives for it.
    private const string Rfc7638N =
        "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhM" +
        "stn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5h" +
        "ajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw";
}
