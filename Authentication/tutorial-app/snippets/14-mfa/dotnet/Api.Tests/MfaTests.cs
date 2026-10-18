using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using OtpNet;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class MfaTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Password = "correct horse battery";
    private static readonly byte[] Key = RandomNumberGenerator.GetBytes(32);
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public MfaTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b =>
        {
            b.UseSetting("Mfa:EncryptionKey", Convert.ToBase64String(Key));
            b.ConfigureTestServices(services =>
            {
                services.Configure<PasswordHasherOptions>(o => o.IterationCount = 1_000);
                services.AddSingleton<TimeProvider>(_clock);
            });
        });
        _client = _factory.CreateClient();
    }

    private Task<HttpResponseMessage> Post(string path, object body, string? token = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return _client.SendAsync(request);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage res) => await res.Content.ReadFromJsonAsync<JsonElement>();

    private async Task<JsonElement> Me(string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await Json(await _client.SendAsync(request));
    }

    // Otp.NET plays the authenticator app on the user's phone.
    private string Phone(string secret) => new OtpNet.Totp(Base32Encoding.ToBytes(secret)).ComputeTotp(_clock.Now.UtcDateTime);

    private async Task<string> SignUpAndIn(string email)
    {
        await Post("/signup", new { email, password = Password });
        return (await Json(await Post("/login", new { email, password = Password }))).GetProperty("token").GetString()!;
    }

    /// <summary>Signs up, turns MFA on, and returns the secret and recovery codes.</summary>
    private async Task<(string Secret, string[] RecoveryCodes)> Enrol(string email)
    {
        var token = await SignUpAndIn(email);
        var secret = (await Json(await Post("/mfa/setup", new { }, token))).GetProperty("secret").GetString()!;
        var confirmed = await Json(await Post("/mfa/confirm", new { code = Phone(secret) }, token));
        return (secret, confirmed.GetProperty("recoveryCodes").EnumerateArray().Select(c => c.GetString()!).ToArray());
    }

    private async Task<string> PendingFor(string email) =>
        (await Json(await Post("/login", new { email, password = Password }))).GetProperty("pendingToken").GetString()!;

    [Fact]
    public async Task Without_MFA_the_password_alone_signs_you_in()
    {
        var token = await SignUpAndIn("ada@example.com");
        Assert.Equal("""{"email":"ada@example.com","mfa":false}""", (await Me(token)).GetRawText());
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/login", new { email = "ada@example.com", password = "wrong horse battery" })).StatusCode);
    }

    [Fact]
    public async Task MFA_set_up_needs_a_session()
    {
        var res = await Post("/mfa/setup", new { });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"Sign in first."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Set_up_returns_a_secret_and_its_otpauth_URI_and_a_wrong_first_code_does_not_turn_MFA_on()
    {
        var token = await SignUpAndIn("bo@example.com");
        var setup = await Json(await Post("/mfa/setup", new { }, token));
        var secret = setup.GetProperty("secret").GetString()!;
        Assert.Matches("^[A-Z2-7]{32}$", secret);
        Assert.Equal($"otpauth://totp/Auth%20Lab:bo%40example.com?secret={secret}&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30",
            setup.GetProperty("otpauthUri").GetString());
        var wrong = await Post("/mfa/confirm", new { code = "000000" }, token);
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal("""{"error":"That code is not valid."}""", await wrong.Content.ReadAsStringAsync());
        var login = await Json(await Post("/login", new { email = "bo@example.com", password = Password }));
        Assert.False(login.TryGetProperty("mfaRequired", out _));
    }

    [Fact]
    public async Task Confirming_with_a_valid_code_turns_MFA_on_and_returns_10_recovery_codes()
    {
        var (_, codes) = await Enrol("cy@example.com");
        Assert.Equal(10, codes.Length);
        var body = await Json(await Post("/login", new { email = "cy@example.com", password = Password }));
        Assert.True(body.GetProperty("mfaRequired").GetBoolean());
        Assert.False(body.TryGetProperty("token", out _)); // the password alone no longer gives a session
    }

    [Fact]
    public async Task With_MFA_on_sign_in_needs_the_password_and_then_a_code()
    {
        var (secret, _) = await Enrol("di@example.com");
        _clock.Now += TimeSpan.FromSeconds(30); // the next 30-second step: the confirming code is used up
        var res = await Post("/login/mfa", new { pendingToken = await PendingFor("di@example.com"), code = Phone(secret) });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var token = (await Json(res)).GetProperty("token").GetString()!;
        Assert.Equal("""{"email":"di@example.com","mfa":true}""", (await Me(token)).GetRawText());
    }

    [Fact]
    public async Task A_code_cannot_be_used_twice_not_the_confirming_code_not_a_sign_in_code()
    {
        var (secret, _) = await Enrol("ed@example.com");
        var replay = await Post("/login/mfa", new { pendingToken = await PendingFor("ed@example.com"), code = Phone(secret) });
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        _clock.Now += TimeSpan.FromSeconds(30);
        var code = Phone(secret);
        Assert.Equal(HttpStatusCode.OK, (await Post("/login/mfa", new { pendingToken = await PendingFor("ed@example.com"), code })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/login/mfa", new { pendingToken = await PendingFor("ed@example.com"), code })).StatusCode);
    }

    [Fact]
    public async Task A_recovery_code_works_once()
    {
        var (_, codes) = await Enrol("fay@example.com");
        var first = await Post("/login/mfa", new { pendingToken = await PendingFor("fay@example.com"), code = codes[0] });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(9, (await Json(first)).GetProperty("recoveryCodesLeft").GetInt32());
        var again = await Post("/login/mfa", new { pendingToken = await PendingFor("fay@example.com"), code = codes[0] });
        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
    }

    [Fact]
    public async Task The_pending_sign_in_expires_after_5_minutes()
    {
        var (secret, _) = await Enrol("gus@example.com");
        var pendingToken = await PendingFor("gus@example.com");
        _clock.Now += TimeSpan.FromMinutes(5);
        var res = await Post("/login/mfa", new { pendingToken, code = Phone(secret) });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"Sign in again."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Five_wrong_codes_lock_code_entry_for_15_minutes()
    {
        var (secret, _) = await Enrol("hal@example.com");
        var pendingToken = await PendingFor("hal@example.com");
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/login/mfa", new { pendingToken, code = "000000" })).StatusCode);
        _clock.Now += TimeSpan.FromSeconds(30);
        var locked = await Post("/login/mfa", new { pendingToken, code = Phone(secret) });
        Assert.Equal((HttpStatusCode)429, locked.StatusCode);
        Assert.Equal("870", locked.Headers.GetValues("Retry-After").Single());
        _clock.Now += TimeSpan.FromMinutes(15);
        var res = await Post("/login/mfa", new { pendingToken = await PendingFor("hal@example.com"), code = Phone(secret) });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task A_pending_token_is_not_a_session_and_it_works_only_once()
    {
        var (secret, _) = await Enrol("jo@example.com");
        var pendingToken = await PendingFor("jo@example.com");
        var me = new HttpRequestMessage(HttpMethod.Get, "/me");
        me.Headers.Authorization = new AuthenticationHeaderValue("Bearer", pendingToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.SendAsync(me)).StatusCode);
        _clock.Now += TimeSpan.FromSeconds(30);
        Assert.Equal(HttpStatusCode.OK, (await Post("/login/mfa", new { pendingToken, code = Phone(secret) })).StatusCode);
        _clock.Now += TimeSpan.FromSeconds(30);
        var again = await Post("/login/mfa", new { pendingToken, code = Phone(secret) }); // a fresh, valid code
        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
        Assert.Equal("""{"error":"Sign in again."}""", await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Wrong_recovery_codes_count_too_and_signing_in_again_does_not_reset_the_count()
    {
        var (secret, _) = await Enrol("kim@example.com");
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/login/mfa", new { pendingToken = await PendingFor("kim@example.com"), code = "000000" })).StatusCode);
        var pendingToken = await PendingFor("kim@example.com");
        for (var i = 0; i < 2; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/login/mfa", new { pendingToken, code = "aaaaa-aaaaa" })).StatusCode);
        _clock.Now += TimeSpan.FromSeconds(30);
        var res = await Post("/login/mfa", new { pendingToken = await PendingFor("kim@example.com"), code = Phone(secret) });
        Assert.Equal((HttpStatusCode)429, res.StatusCode);
    }

    // Requests sent at the same moment: each check-then-update must run as one, or a code could be spent twice.
    private async Task<int[]> AtOnce(IEnumerable<object> bodies) =>
        (await Task.WhenAll(bodies.Select(body => Task.Run(() => Post("/login/mfa", body)))))
            .Select(r => (int)r.StatusCode).Order().ToArray();

    [Fact]
    public async Task The_same_code_sent_several_times_at_once_works_only_once()
    {
        var (secret, codes) = await Enrol("lu@example.com");
        _clock.Now += TimeSpan.FromSeconds(30);
        var code = Phone(secret);
        var totp = new List<object>();
        for (var i = 0; i < 3; i++) totp.Add(new { pendingToken = await PendingFor("lu@example.com"), code });
        Assert.Equal(new[] { 200, 401, 401 }, await AtOnce(totp));
        var recovery = new List<object>();
        for (var i = 0; i < 3; i++) recovery.Add(new { pendingToken = await PendingFor("lu@example.com"), code = codes[0] });
        Assert.Equal(new[] { 200, 401, 401 }, await AtOnce(recovery));
    }

    [Fact]
    public async Task A_pending_token_works_once_even_for_two_requests_at_once()
    {
        var (secret, codes) = await Enrol("max@example.com");
        _clock.Now += TimeSpan.FromSeconds(30);
        var pendingToken = await PendingFor("max@example.com");
        Assert.Equal(new[] { 200, 401 }, await AtOnce([new { pendingToken, code = codes[0] }, new { pendingToken, code = Phone(secret) }]));
    }

    [Fact]
    public async Task Wrong_codes_sent_at_once_still_lock_code_entry_after_five()
    {
        await Enrol("ned@example.com");
        var pendingToken = await PendingFor("ned@example.com");
        var guesses = Enumerable.Repeat<object>(new { pendingToken, code = "aaaaa-aaaaa" }, 8);
        Assert.Equal(new[] { 401, 401, 401, 401, 401, 429, 429, 429 }, await AtOnce(guesses));
    }

    [Fact]
    public async Task The_TOTP_secret_is_stored_encrypted()
    {
        var (secret, _) = await Enrol("ivy@example.com");
        var stored = _factory.Services.GetRequiredService<UserStore>().Find("ivy@example.com")!;
        Assert.StartsWith("v1.", stored.TotpSecret);
        Assert.DoesNotContain(secret, JsonSerializer.Serialize(stored));
        var opened = new SecretBox(Key).Open(stored.TotpSecret!, "ivy@example.com"); // only with the key
        Assert.Equal(Base32Encoding.ToBytes(secret), opened);
    }
}
