using System.Buffers.Text;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Fido2NetLib.Objects;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class PasskeyTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public PasskeyTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(_clock)));
        _client = _factory.CreateClient();
    }

    private PasskeyStore Store => _factory.Services.GetRequiredService<PasskeyStore>();

    private Task<HttpResponseMessage> Post(string path, object? body = null) => _client.PostAsJsonAsync(path, body ?? new { });

    private async Task<JsonElement> Options(string path, object? body = null) =>
        await (await Post(path, body)).Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>Registers a new account with a passkey made by <paramref name="auth"/>.</summary>
    private async Task<(SoftAuthenticator Auth, HttpResponseMessage Res)> Register(string username, SoftAuthenticator? auth = null)
    {
        auth ??= new SoftAuthenticator();
        var options = await Options("/webauthn/register/options", new { username });
        return (auth, await Post("/webauthn/register/verify", auth.Register(options)));
    }

    private async Task<HttpResponseMessage> Login(SoftAuthenticator auth, Tamper? tamper = null) =>
        await Post("/webauthn/login/verify", auth.Login(await Options("/webauthn/login/options"), tamper));

    [Fact]
    public async Task Registration_options_ask_for_a_discoverable_passkey_with_user_verification()
    {
        var res = await Post("/webauthn/register/options", new { username = "Ada@Example.com" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var options = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("localhost", options.GetProperty("rp").GetProperty("id").GetString());
        Assert.Equal("ada@example.com", options.GetProperty("user").GetProperty("name").GetString());
        Assert.Matches("^[A-Za-z0-9_-]{43}$", options.GetProperty("challenge").GetString()); // 32 random bytes, base64url
        var selection = options.GetProperty("authenticatorSelection");
        Assert.Equal("required", selection.GetProperty("residentKey").GetString());
        Assert.Equal("required", selection.GetProperty("userVerification").GetString());
        Assert.Contains(options.GetProperty("pubKeyCredParams").EnumerateArray(), p => p.GetProperty("alg").GetInt32() == -7); // ES256
        var other = await Options("/webauthn/register/options", new { username = "x@example.com" });
        Assert.NotEqual(options.GetProperty("challenge").GetString(), other.GetProperty("challenge").GetString());
    }

    [Fact]
    public async Task Register_a_passkey_then_sign_in_with_it()
    {
        var (auth, res) = await Register("ada@example.com");
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var credentialId = Base64Url.EncodeToString(auth.CredentialId);
        Assert.Equal($$"""{"username":"ada@example.com","credentialId":"{{credentialId}}","deviceType":"singleDevice","backedUp":false}""", await res.Content.ReadAsStringAsync());
        var stored = Store.FindCredential(credentialId)!;
        Assert.Equal(0u, stored.Counter);
        Assert.Equal([AuthenticatorTransport.Hybrid, AuthenticatorTransport.Internal], stored.Transports);
        Assert.Equal(0xa5, stored.PublicKey[0]); // a COSE key: a CBOR map of five entries

        var login = await Login(auth);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal("""{"username":"ada@example.com","message":"Signed in."}""", await login.Content.ReadAsStringAsync());
        Assert.Equal(1u, stored.Counter); // the new sign count is saved
    }

    [Fact]
    public async Task A_username_can_be_registered_only_once()
    {
        await Register("bo@example.com");
        var again = await Post("/webauthn/register/options", new { username = "bo@example.com" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("""{"error":"That username is already registered."}""", await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_synced_passkey_reports_its_backup_state_and_a_sign_count_of_zero()
    {
        var (auth, res) = await Register("cy@example.com", new SoftAuthenticator(synced: true));
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("multiDevice", body.GetProperty("deviceType").GetString());
        Assert.True(body.GetProperty("backedUp").GetBoolean());
        for (var i = 0; i < 2; i++) Assert.Equal(HttpStatusCode.OK, (await Login(auth)).StatusCode); // a counter that stays at 0 is allowed
        Assert.Equal(0u, Store.FindCredential(body.GetProperty("credentialId").GetString()!)!.Counter);
    }

    [Fact]
    public async Task A_credential_can_be_registered_only_once()
    {
        var (auth, res) = await Register("lu@example.com");
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var again = await Post("/webauthn/register/verify", auth.Register(await Options("/webauthn/register/options", new { username = "mo@example.com" })));
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        Assert.Equal("""{"error":"Registration failed."}""", await again.Content.ReadAsStringAsync());
        Assert.Null(Store.FindUserByName("mo@example.com")); // no account was made
    }

    [Fact]
    public async Task A_response_from_another_origin_is_rejected_phishing()
    {
        var options = await Options("/webauthn/register/options", new { username = "di@example.com" });
        var phished = new SoftAuthenticator().Register(options, new Tamper(Origin: "https://login.example.com.evil.example"));
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/webauthn/register/verify", phished)).StatusCode);

        var (auth, _) = await Register("di@example.com");
        var res = await Login(auth, new Tamper(Origin: "https://evil.example"));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"Passkey sign-in failed."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_response_for_another_RP_ID_is_rejected()
    {
        var (auth, _) = await Register("ed@example.com");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(auth, new Tamper(RpId: "evil.example"))).StatusCode);
    }

    [Fact]
    public async Task A_challenge_the_server_never_issued_is_rejected()
    {
        var (auth, _) = await Register("fay@example.com");
        var res = await Login(auth, new Tamper(Challenge: Base64Url.EncodeToString(Enumerable.Repeat((byte)7, 32).ToArray())));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("""{"error":"Unknown or expired challenge."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_challenge_can_be_used_only_once()
    {
        var auth = new SoftAuthenticator();
        var registration = auth.Register(await Options("/webauthn/register/options", new { username = "gus@example.com" }));
        Assert.Equal(HttpStatusCode.Created, (await Post("/webauthn/register/verify", registration)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/webauthn/register/verify", registration)).StatusCode);

        var assertion = auth.Login(await Options("/webauthn/login/options"));
        Assert.Equal(HttpStatusCode.OK, (await Post("/webauthn/login/verify", assertion)).StatusCode);
        var replay = await Post("/webauthn/login/verify", assertion);
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
        Assert.Equal("""{"error":"Unknown or expired challenge."}""", await replay.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_challenge_works_only_for_the_ceremony_it_was_issued_for()
    {
        var (auth, _) = await Register("pat@example.com");
        var registration = await Options("/webauthn/register/options", new { username = "quin@example.com" });
        var registrationChallenge = registration.GetProperty("challenge").GetString();
        var login = await Post("/webauthn/login/verify", auth.Login(JsonSerializer.SerializeToElement(new { challenge = registrationChallenge, rpId = "localhost" })));
        Assert.Equal(HttpStatusCode.BadRequest, login.StatusCode);
        Assert.Equal("""{"error":"Unknown or expired challenge."}""", await login.Content.ReadAsStringAsync());

        var loginChallenge = (await Options("/webauthn/login/options")).GetProperty("challenge").GetString();
        var res = await Post("/webauthn/register/verify", new SoftAuthenticator().Register(registration, new Tamper(Challenge: loginChallenge)));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task A_challenge_expires_after_five_minutes()
    {
        var (auth, _) = await Register("hal@example.com");
        var options = await Options("/webauthn/login/options");
        _clock.Now += TimeSpan.FromMinutes(5);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/webauthn/login/verify", auth.Login(options))).StatusCode);
    }

    [Fact]
    public async Task A_sign_count_that_does_not_increase_is_rejected_a_cloned_authenticator()
    {
        var (auth, _) = await Register("ivy@example.com");
        Assert.Equal(HttpStatusCode.OK, (await Login(auth)).StatusCode); // count 1
        foreach (var count in new uint[] { 1, 0 })
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(auth, new Tamper(SignCount: count))).StatusCode);
    }

    [Fact]
    public async Task User_presence_and_user_verification_are_required()
    {
        foreach (var tamper in new[] { new Tamper(Up: false), new Tamper(Uv: false) })
        {
            var options = await Options("/webauthn/register/options", new { username = "jo@example.com" });
            Assert.Equal(HttpStatusCode.BadRequest, (await Post("/webauthn/register/verify", new SoftAuthenticator().Register(options, tamper))).StatusCode);
        }
        var (auth, _) = await Register("jo@example.com");
        foreach (var tamper in new[] { new Tamper(Up: false), new Tamper(Uv: false) })
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(auth, tamper)).StatusCode);
    }

    [Fact]
    public async Task The_user_handle_must_be_the_credential_owners()
    {
        var (auth, _) = await Register("nia@example.com");
        await Register("oz@example.com");
        var oz = Base64Url.EncodeToString(Store.FindUserByName("oz@example.com")!.Id);
        var res = await Login(auth, new Tamper(UserHandle: oz));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"Passkey sign-in failed."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_device_bound_passkey_cannot_turn_into_a_synced_one()
    {
        var (auth, _) = await Register("rex@example.com");
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(auth, new Tamper(Synced: true))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Login(auth)).StatusCode); // the real flags still work
    }

    [Fact]
    public async Task A_signature_from_another_key_is_rejected()
    {
        var (auth, _) = await Register("kim@example.com");
        using var otherKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Login(auth, new Tamper(SignWith: otherKey))).StatusCode);
    }

    [Fact]
    public async Task The_demo_page_is_served_at_the_root()
    {
        var res = await _client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("text/html", res.Content.Headers.ContentType?.MediaType);
        var html = await res.Content.ReadAsStringAsync();
        Assert.Contains("navigator.credentials.create", html);
        Assert.Contains("navigator.credentials.get", html);
    }
}
