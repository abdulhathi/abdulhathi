using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class JwtTests : IClassFixture<WebApplicationFactory<Program>>
{
    // IdentityModel checks exp and nbf against the system clock, so these tests move the issuer's clock instead:
    // a token issued 640 seconds ago is the same as checking a fresh token 640 seconds from now.
    private readonly ManualClock _clock = new(DateTimeOffset.UtcNow);
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private KeyRing Ring => _factory.Services.GetRequiredService<KeyRing>();

    public JwtTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(_clock)));
        _client = _factory.CreateClient();
    }

    private Task<HttpResponseMessage> SignIn() =>
        _client.PostAsJsonAsync("/login", new { email = "ada@example.com", password = "correct horse battery" });

    private async Task<string> Login() =>
        (await (await SignIn()).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString()!;

    private Task<HttpResponseMessage> Me(string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return _client.SendAsync(request);
    }

    // Claims that pass every check; each test changes one thing.
    private static long Seconds => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    private Dictionary<string, object> GoodClaims() => new()
    {
        ["iss"] = Tokens.Issuer, ["sub"] = "u_1001", ["aud"] = Tokens.Audience, ["email"] = "ada@example.com",
        ["iat"] = Seconds, ["nbf"] = Seconds, ["exp"] = Seconds + 600, ["jti"] = Guid.NewGuid().ToString(),
    };

    private string Sign(Dictionary<string, object> claims, SigningKey? key = null) =>
        new JsonWebTokenHandler().CreateToken(JsonSerializer.Serialize(claims), new SigningCredentials((key ?? Ring.Current).PrivateKey, "RS256"));

    // Builds a token by hand, the way an attacker would.
    private static string B64(object value) => Base64UrlEncoder.Encode(JsonSerializer.Serialize(value));
    private static string Forge(object header, object claims, Func<string, string>? signature = null)
    {
        var input = $"{B64(header)}.{B64(claims)}";
        return $"{input}.{signature?.Invoke(input) ?? ""}";
    }

    [Fact]
    public async Task Sign_in_then_call_me_with_the_bearer_token()
    {
        var signedIn = await SignIn();
        Assert.Equal("no-store", signedIn.Headers.CacheControl?.ToString());
        var body = await signedIn.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Bearer", body.GetProperty("token_type").GetString());
        Assert.Equal(600, body.GetProperty("expires_in").GetInt32());
        var res = await Me(body.GetProperty("access_token").GetString()!);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"sub":"u_1001","email":"ada@example.com"}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_wrong_or_missing_password_gets_401_and_no_token()
    {
        foreach (var body in new object[] { new { email = "ada@example.com", password = "wrong horse battery" }, new { email = "ada@example.com" }, new { } })
        {
            var res = await _client.PostAsJsonAsync("/login", body);
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal("""{"error":"Email or password is incorrect."}""", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task No_token_or_another_scheme_gets_401_and_www_authenticate_bearer()
    {
        foreach (var header in new[] { null, new AuthenticationHeaderValue("Basic", "YWRhOnNlY3JldA==") })
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "/me");
            request.Headers.Authorization = header;
            var res = await _client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal("Bearer", res.Headers.WwwAuthenticate.ToString());
            Assert.Equal("""{"error":"Missing bearer token."}""", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Expiry_and_not_before_are_checked_with_30_seconds_of_clock_skew()
    {
        _clock.Now = DateTimeOffset.UtcNow.AddSeconds(-620); // expired 20 s ago: inside the skew
        Assert.Equal(HttpStatusCode.OK, (await Me(await Login())).StatusCode);
        _clock.Now = DateTimeOffset.UtcNow.AddSeconds(-640); // expired 40 s ago
        var expired = await Me(await Login());
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", expired.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"Invalid or expired token."}""", await expired.Content.ReadAsStringAsync());
        var soon = GoodClaims(); soon["nbf"] = Seconds + 20;
        Assert.Equal(HttpStatusCode.OK, (await Me(Sign(soon))).StatusCode);
        var later = GoodClaims(); later["nbf"] = Seconds + 60;
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(Sign(later))).StatusCode);
    }

    [Fact]
    public async Task A_token_for_another_audience_is_rejected()
    {
        var claims = GoodClaims(); claims["aud"] = "https://other-api.example.com";
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(Sign(claims))).StatusCode);
    }

    [Fact]
    public async Task A_token_from_another_issuer_is_rejected()
    {
        var claims = GoodClaims(); claims["iss"] = "https://evil.example.com";
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(Sign(claims))).StatusCode);
    }

    [Fact]
    public async Task A_token_missing_a_required_claim_is_rejected()
    {
        foreach (var name in new[] { "exp", "sub", "jti" })
        {
            var claims = GoodClaims(); claims.Remove(name);
            Assert.Equal(HttpStatusCode.Unauthorized, (await Me(Sign(claims))).StatusCode);
        }
    }

    [Fact]
    public async Task Changing_the_payload_breaks_the_signature()
    {
        var parts = (await Login()).Split('.');
        var claims = GoodClaims(); claims["sub"] = "u_1002";
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me($"{parts[0]}.{B64(claims)}.{parts[2]}")).StatusCode);
    }

    [Fact]
    public async Task Alg_none_is_rejected()
    {
        // It even names one of our keys. IdentityModel refuses it because it has no signature (RequireSignedTokens),
        // and "none" is not on the allowlist either.
        var token = Forge(new { alg = "none", typ = "JWT", kid = Ring.Current.Kid }, GoodClaims());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(token)).StatusCode);
    }

    [Fact]
    public async Task Hs256_signed_with_the_public_key_algorithm_confusion_is_rejected()
    {
        // The attacker knows the public key (it is published) and uses it as an HMAC secret.
        var publicPem = Encoding.UTF8.GetBytes(Ring.Current.PrivateKey.Rsa.ExportSubjectPublicKeyInfoPem());
        var token = Forge(new { alg = "HS256", typ = "JWT", kid = Ring.Current.Kid }, GoodClaims(),
            input => Base64UrlEncoder.Encode(HMACSHA256.HashData(publicPem, Encoding.UTF8.GetBytes(input))));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(token)).StatusCode);
    }

    [Fact]
    public async Task A_token_signed_with_an_unknown_key_kid_is_rejected()
    {
        var stranger = KeyRing.NewSigningKey(); // a valid RS256 key, but not one of ours
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(Sign(GoodClaims(), stranger))).StatusCode);
    }

    [Fact]
    public async Task A_token_that_points_to_its_own_key_set_jku_is_rejected()
    {
        // The attacker signs with their own key, names our kid, and says where to fetch "their" keys. The verifier never
        // follows jku: it checks the signature with our key for that kid, and the signature does not match.
        var stranger = new RsaSecurityKey(KeyRing.NewSigningKey().PrivateKey.Rsa) { KeyId = Ring.Current.Kid };
        var token = new JsonWebTokenHandler().CreateToken(JsonSerializer.Serialize(GoodClaims()),
            new SigningCredentials(stranger, "RS256"), new Dictionary<string, object> { ["jku"] = "https://evil.example.com/jwks.json" });
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(token)).StatusCode);
    }

    [Fact]
    public async Task Rotation_old_tokens_keep_working_until_their_key_is_retired()
    {
        var oldToken = await Login();
        var oldKid = Ring.Current.Kid;
        Ring.Rotate();
        var newToken = await Login();
        Assert.NotEqual(oldKid, new JsonWebToken(newToken).Kid);
        var jwks = await _client.GetFromJsonAsync<JsonElement>("/.well-known/jwks.json");
        Assert.Equal([oldKid, Ring.Current.Kid], jwks.GetProperty("keys").EnumerateArray().Select(k => k.GetProperty("kid").GetString()));
        Assert.Equal(HttpStatusCode.OK, (await Me(oldToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Me(newToken)).StatusCode);

        Ring.Retire(oldKid); // after the old key's last token has expired
        Assert.Equal(HttpStatusCode.Unauthorized, (await Me(oldToken)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Me(newToken)).StatusCode);
    }

    [Fact]
    public async Task Another_api_can_verify_a_token_with_only_the_published_jwks()
    {
        var token = await Login();
        var jwks = new JsonWebKeySet(await _client.GetStringAsync("/.well-known/jwks.json"));
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
        {
            IssuerSigningKeys = jwks.GetSigningKeys(),
            ValidAlgorithms = ["RS256"],
            ValidIssuer = Tokens.Issuer,
            ValidAudience = Tokens.Audience,
        });
        Assert.True(result.IsValid);
        Assert.Equal("u_1001", result.Claims["sub"]);
    }
}
