using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class LoginTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly ManualClock _clock = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public LoginTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(b => b.ConfigureTestServices(services =>
        {
            services.Configure<PasswordHasherOptions>(o => o.IterationCount = 1_000);
            services.AddSingleton<TimeProvider>(_clock);
        }));
        _client = _factory.CreateClient();
    }

    private Task<HttpResponseMessage> Post(string path, string email, string password) =>
        _client.PostAsJsonAsync(path, new { email, password });

    [Fact]
    public async Task Sign_up_then_sign_in_with_the_same_password()
    {
        Assert.Equal(HttpStatusCode.Created, (await Post("/signup", "Ada@Example.com", "correct horse battery")).StatusCode);
        var res = await Post("/login", "ada@example.com", "correct horse battery");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"email":"ada@example.com","message":"Signed in."}""", await res.Content.ReadAsStringAsync());
        var stored = _factory.Services.GetRequiredService<UserStore>().Find("ada@example.com")!.PasswordHash;
        Assert.DoesNotContain("correct horse", stored);
    }

    [Fact]
    public async Task A_wrong_password_and_an_unknown_email_get_the_same_answer()
    {
        await Post("/signup", "bo@example.com", "correct horse battery");
        var wrong = await Post("/login", "bo@example.com", "wrong horse battery");
        var unknown = await Post("/login", "nobody@example.com", "wrong horse battery");
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Equal(await wrong.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Missing_fields_get_the_normal_answers_not_a_server_error()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.PostAsJsonAsync("/signup", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _client.PostAsJsonAsync("/login", new { })).StatusCode);
    }

    [Fact]
    public async Task Sign_up_rejects_weak_passwords_and_duplicate_emails()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/signup", "cy@example.com", "short")).StatusCode);
        await Post("/signup", "cy@example.com", "correct horse battery");
        Assert.Equal(HttpStatusCode.Conflict, (await Post("/signup", "cy@example.com", "another long password")).StatusCode);
    }

    [Fact]
    public async Task Five_failures_lock_the_account_for_15_minutes()
    {
        await Post("/signup", "di@example.com", "correct horse battery");
        for (var i = 0; i < 5; i++) await Post("/login", "di@example.com", "nope nope nope");
        var locked = await Post("/login", "di@example.com", "correct horse battery");
        Assert.Equal((HttpStatusCode)429, locked.StatusCode);
        Assert.Equal("900", locked.Headers.GetValues("Retry-After").Single());
        _clock.Now += TimeSpan.FromMinutes(15);
        Assert.Equal(HttpStatusCode.OK, (await Post("/login", "di@example.com", "correct horse battery")).StatusCode);
    }

    [Fact]
    public async Task An_old_weaker_hash_is_upgraded_at_the_next_sign_in()
    {
        var user = new User("ed@example.com", "");
        var weak = new PasswordHasher<User>(Options.Create(new PasswordHasherOptions { IterationCount = 500 }));
        user.PasswordHash = weak.HashPassword(user, "correct horse battery");
        _factory.Services.GetRequiredService<UserStore>().Put(user);
        var before = user.PasswordHash;
        Assert.Equal(HttpStatusCode.OK, (await Post("/login", "ed@example.com", "correct horse battery")).StatusCode);
        Assert.NotEqual(before, user.PasswordHash);
        var current = _factory.Services.GetRequiredService<IPasswordHasher<User>>();
        Assert.Equal(PasswordVerificationResult.Success, current.VerifyHashedPassword(user, user.PasswordHash, "correct horse battery"));
    }
}
