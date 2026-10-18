using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

/// <summary>
/// Shared by the tests: the app in memory with a movable clock (and, if given, the server's own signing key), and an
/// HttpClient that does not follow redirects.
/// </summary>
public sealed class Lab : IDisposable
{
    public const string Issuer = "http://localhost:3000";
    public ManualClock Clock { get; } = new(DateTimeOffset.Parse("2026-10-17T12:00:00Z"));
    public WebApplicationFactory<Program> Factory { get; }
    public HttpClient Http { get; }

    public Lab(RsaSecurityKey? signingKey = null)
    {
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("Issuer", Issuer);
            b.ConfigureTestServices(services =>
            {
                services.AddSingleton<TimeProvider>(Clock);
                if (signingKey is not null) services.AddSingleton(signingKey);
            });
        });
        Http = Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
    }

    /// <summary>Plays the browser: opens the URL and reports where the server redirects it, without following.</summary>
    public async Task<(int Status, string Location)> Visit(string url)
    {
        var response = await Http.GetAsync(url);
        return ((int)response.StatusCode, response.Headers.Location?.OriginalString ?? "");
    }

    public static Dictionary<string, string> Query(string url) =>
        Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(new Uri(url).Query).ToDictionary(p => p.Key, p => p.Value.ToString());

    public void Dispose() => Factory.Dispose();
}
