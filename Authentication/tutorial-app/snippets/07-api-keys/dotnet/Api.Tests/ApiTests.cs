using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

public record CreatedKey(string Id, string Key, string Name, string[] Scopes, string ExpiresAt, string Note, string? OldKeyExpiresAt);

public class ApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly string _admin;

    public ApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.AddSingleton<TimeProvider>(_clock)));
        _client = _factory.CreateClient();
        // A first admin key, made straight in the store.
        _admin = _factory.Services.GetRequiredService<ApiKeyStore>().Issue("admin", ["keys:manage"]).Key;
    }

    private static Task<HttpResponseMessage> Call(HttpClient client, HttpMethod method, string path, string? key = null, object? body = null, string header = "Authorization")
    {
        var request = new HttpRequestMessage(method, path);
        if (key is not null) request.Headers.TryAddWithoutValidation(header, header == "Authorization" ? $"Bearer {key}" : key);
        if (body is not null) request.Content = JsonContent.Create(body);
        return client.SendAsync(request);
    }

    private Task<HttpResponseMessage> Get(string path, string? key = null, string header = "Authorization") => Call(_client, HttpMethod.Get, path, key, null, header);
    private Task<HttpResponseMessage> Post(string path, string? key = null, object? body = null) => Call(_client, HttpMethod.Post, path, key, body);

    private static async Task<CreatedKey> CreateKey(HttpClient client, string admin, object? body = null) =>
        (await (await Call(client, HttpMethod.Post, "/keys", admin, body ?? new { name = "nightly-export", scopes = new[] { "reports:read" } }))
            .Content.ReadFromJsonAsync<CreatedKey>())!;

    private static string Iso(DateTimeOffset t) => t.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    /// <summary>The same key with its last character changed: the right id, the wrong secret.</summary>
    private static string WithWrongSecret(string key) => key[..^1] + (key.EndsWith('A') ? "B" : "A");

    [Fact]
    public async Task An_admin_creates_a_key_shown_once_that_reads_reports()
    {
        var res = await Post("/keys", _admin, new { name = "nightly-export", scopes = new[] { "reports:read" }, expiresInDays = 30 });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<CreatedKey>())!;
        Assert.Matches("^ak_live_[0-9a-f]{12}_", body.Key);
        Assert.Equal("2026-11-16T12:00:00Z", body.ExpiresAt);
        Assert.Equal("Copy this key now: it is shown only once.", body.Note);
        var stored = _factory.Services.GetRequiredService<ApiKeyStore>().Find(body.Id)!;
        Assert.DoesNotContain(body.Key, System.Text.Json.JsonSerializer.Serialize(stored)); // the store holds only a hash

        var reports = await Get("/reports", body.Key);
        Assert.Equal(HttpStatusCode.OK, reports.StatusCode);
        Assert.Equal("""{"client":"nightly-export","reports":[{"month":"2026-09","orders":1520},{"month":"2026-10","orders":1710}]}""",
            await reports.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await Get("/reports", body.Key, "X-API-Key")).StatusCode); // X-API-Key works too
    }

    [Fact]
    public async Task No_key_a_wrong_key_and_a_key_in_the_URL_are_refused()
    {
        var key = (await CreateKey(_client, _admin)).Key;
        var none = await Get("/reports");
        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal("Bearer", none.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"Send an API key in the Authorization or X-API-Key header."}""", await none.Content.ReadAsStringAsync());
        var wrong = await Get("/reports", WithWrongSecret(key));
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", wrong.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"Invalid API key."}""", await wrong.Content.ReadAsStringAsync());
        var inUrl = await Get($"/reports?api_key={key}");
        Assert.Equal(HttpStatusCode.BadRequest, inUrl.StatusCode);
        Assert.Equal("""{"error":"Send the API key in a header, never in the URL."}""", await inUrl.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_key_without_the_needed_scope_gets_403()
    {
        var key = (await CreateKey(_client, _admin)).Key;
        var create = await Post("/keys", key, new { name = "sneaky", scopes = new[] { "keys:manage" } });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal("Bearer error=\"insufficient_scope\", scope=\"keys:manage\"", create.Headers.WwwAuthenticate.ToString());
        Assert.Equal("""{"error":"This key lacks the keys:manage scope."}""", await create.Content.ReadAsStringAsync());
        var read = await Get("/reports", _admin);
        Assert.Equal(HttpStatusCode.Forbidden, read.StatusCode);
        Assert.Equal("""{"error":"This key lacks the reports:read scope."}""", await read.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Creating_a_key_checks_the_name_scopes_and_lifetime()
    {
        var unknown = await Post("/keys", _admin, new { name = "x", scopes = new[] { "reports:write" } });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal("""{"error":"Scopes must be a non-empty list from: reports:read, keys:manage."}""", await unknown.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/keys", _admin, new { name = " ", scopes = new[] { "reports:read" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/keys", _admin, new { name = "x", scopes = new[] { "reports:read" }, expiresInDays = 0 })).StatusCode);
        // A wrong type is refused by JSON binding (an empty 400), not turned into a number.
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/keys", _admin, new { name = "x", scopes = new[] { "reports:read" }, expiresInDays = true })).StatusCode);
    }

    [Fact]
    public async Task A_key_stops_working_when_it_expires()
    {
        var key = (await CreateKey(_client, _admin, new { name = "short-lived", scopes = new[] { "reports:read" }, expiresInDays = 1 })).Key;
        Assert.Equal(HttpStatusCode.OK, (await Get("/reports", key)).StatusCode);
        _clock.Now += TimeSpan.FromDays(1);
        var res = await Get("/reports", key);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"This API key has expired."}""", await res.Content.ReadAsStringAsync());
        var guess = await Get("/reports", WithWrongSecret(key));
        Assert.Equal("""{"error":"Invalid API key."}""", await guess.Content.ReadAsStringAsync()); // only the real key learns that it expired
    }

    [Fact]
    public async Task A_revoked_key_stops_working_at_once()
    {
        var created = await CreateKey(_client, _admin);
        var revoke = await Post($"/keys/{created.Id}/revoke", _admin);
        Assert.Equal(HttpStatusCode.OK, revoke.StatusCode);
        Assert.Equal($$"""{"id":"{{created.Id}}","revoked":true}""", await revoke.Content.ReadAsStringAsync());
        var res = await Get("/reports", created.Key);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("""{"error":"This API key has been revoked."}""", await res.Content.ReadAsStringAsync());
        var guess = await Get("/reports", WithWrongSecret(created.Key));
        Assert.Equal("""{"error":"Invalid API key."}""", await guess.Content.ReadAsStringAsync()); // only the real key learns that it was revoked
        Assert.Equal(HttpStatusCode.NotFound, (await Post("/keys/000000000000/revoke", _admin)).StatusCode);
    }

    [Fact]
    public async Task Rotation_keeps_both_keys_working_until_the_old_one_expires()
    {
        var old = await CreateKey(_client, _admin);
        var res = await Post($"/keys/{old.Id}/rotate", _admin);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var fresh = (await res.Content.ReadFromJsonAsync<CreatedKey>())!;
        Assert.NotEqual(old.Key, fresh.Key);
        Assert.Equal(Iso(_clock.Now.AddDays(90)), fresh.ExpiresAt); // the new key gets the full lifetime
        Assert.Equal(Iso(_clock.Now.AddDays(1)), fresh.OldKeyExpiresAt);
        var again = (await (await Post($"/keys/{old.Id}/rotate", _admin)).Content.ReadFromJsonAsync<CreatedKey>())!;
        Assert.Equal(Iso(_clock.Now.AddDays(90)), again.ExpiresAt); // rotating the old key again does not shorten the new one
        Assert.Equal(HttpStatusCode.OK, (await Get("/reports", old.Key)).StatusCode); // both work during the overlap
        Assert.Equal(HttpStatusCode.OK, (await Get("/reports", fresh.Key)).StatusCode);
        _clock.Now += TimeSpan.FromDays(1);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Get("/reports", old.Key)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Get("/reports", fresh.Key)).StatusCode);
        await Post($"/keys/{fresh.Id}/revoke", _admin);
        Assert.Equal(HttpStatusCode.Conflict, (await Post($"/keys/{fresh.Id}/rotate", _admin)).StatusCode);
    }

    [Fact]
    public async Task Each_key_has_its_own_rate_limit()
    {
        var limited = _factory.WithWebHostBuilder(b => b.ConfigureTestServices(s => s.Configure<RateLimitOptions>(o => o.PerMinute = 3)));
        var client = limited.CreateClient();
        var admin = limited.Services.GetRequiredService<ApiKeyStore>().Issue("admin", ["keys:manage"]).Key;
        var a = (await CreateKey(client, admin)).Key;
        var b = (await CreateKey(client, admin)).Key;
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.OK, (await Call(client, HttpMethod.Get, "/reports", a)).StatusCode);
        _clock.Now += TimeSpan.FromSeconds(15);
        var blocked = await Call(client, HttpMethod.Get, "/reports", a);
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        Assert.Equal("45", blocked.Headers.GetValues("Retry-After").Single()); // seconds until the next window
        Assert.Equal("""{"error":"Rate limit exceeded. Try again later."}""", await blocked.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await Call(client, HttpMethod.Get, "/reports", b)).StatusCode); // another key is not affected
        _clock.Now += TimeSpan.FromSeconds(45);
        Assert.Equal(HttpStatusCode.OK, (await Call(client, HttpMethod.Get, "/reports", a)).StatusCode); // a new window starts
    }
}
