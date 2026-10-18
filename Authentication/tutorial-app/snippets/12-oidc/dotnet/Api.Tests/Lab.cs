using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

/// <summary>
/// The app in memory, plus a "browser": an HttpClient that keeps cookies and does not follow redirects, so each
/// test can walk the sign-in one hop at a time. The relying party's back-channel calls (discovery, JWKS, token,
/// UserInfo) go to the same in-memory server.
/// </summary>
public sealed class Lab : IDisposable
{
    public const string Base = "http://localhost";
    public WebApplicationFactory<Program> Factory { get; }
    public HttpClient Browser { get; }

    public Lab()
    {
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseSetting("BaseUrl", Base);
            b.ConfigureTestServices(services => services.Configure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme,
                o => o.BackchannelHttpHandler = Factory!.Server.CreateHandler()));
        });
        Browser = Factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
    }

    public MockIdp Idp => Factory.Services.GetRequiredService<MockIdp>();
    public string? LastSignInError => Factory.Services.GetRequiredService<SignInErrors>().Last;

    public async Task<(int Status, string Location)> Visit(string url, HttpMethod? method = null)
    {
        var response = await Browser.SendAsync(new HttpRequestMessage(method ?? HttpMethod.Get, url));
        return ((int)response.StatusCode, response.Headers.Location?.OriginalString ?? "");
    }

    /// <summary>/login, then the provider's /authorize: returns the callback URL the provider sent the browser to.</summary>
    public async Task<string> StartSignIn()
    {
        var (_, authorize) = await Visit("/login");
        var (_, callback) = await Visit(authorize);
        return callback;
    }

    public static Dictionary<string, string> Query(string url) =>
        QueryHelpers.ParseQuery(new Uri(url, UriKind.RelativeOrAbsolute).IsAbsoluteUri ? new Uri(url).Query : url[url.IndexOf('?')..])
            .ToDictionary(p => p.Key, p => p.Value.ToString());

    public void Dispose() => Factory.Dispose();
}
