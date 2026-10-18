using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;

// The client side of OAuth 2.0, written out by hand so every step is visible. In a real ASP.NET Core app use the
// built-in OpenIdConnect/OAuth handlers, or Duende.IdentityModel for service-to-service calls.

public sealed class OAuthException(string error, string description) : Exception(description)
{
    public string Error { get; } = error;
}

public sealed record TokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("scope")] string Scope);

/// <summary>What the client must remember between sending the user away and the user coming back: keep it in the session.</summary>
public sealed record PendingAuthorization(string Url, string State, string Verifier);

/// <summary>The authorization code flow with PKCE, for an app that acts for a user.</summary>
/// <param name="http">Points at the authorization server.</param>
/// <param name="issuer">The server's issuer identifier, which its responses must carry.</param>
public sealed class AuthorizationCodeClient(HttpClient http, string issuer, string clientId, string redirectUri)
{
    /// <summary>Step 1: build the URL to send the browser to, with a fresh state and PKCE verifier.</summary>
    public PendingAuthorization Start(string scope)
    {
        var state = Pkce.RandomToken(16); // ties the callback to this browser: CSRF protection
        var verifier = Pkce.NewVerifier(); // stays here; only its hash travels through the browser
        var url = QueryHelpers.AddQueryString(new Uri(http.BaseAddress!, "/authorize").ToString(), new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = clientId,
            ["redirect_uri"] = redirectUri,
            ["scope"] = scope,
            ["state"] = state,
            ["code_challenge"] = Pkce.ChallengeFor(verifier),
            ["code_challenge_method"] = "S256",
        });
        return new PendingAuthorization(url, state, verifier);
    }

    /// <summary>Step 2: the browser came back to the redirect URI. Check state and iss, then swap the code (and verifier) for a token.</summary>
    public async Task<TokenResponse> FinishAsync(string callbackUrl, PendingAuthorization pending)
    {
        var query = QueryHelpers.ParseQuery(new Uri(callbackUrl).Query);
        string Get(string name) => query.TryGetValue(name, out var value) ? value.ToString() : "";
        if (Get("state") != pending.State) throw new OAuthException("invalid_state", "The state does not match this sign-in. Start again.");
        // RFC 9207: this server always sends iss. A missing or different value means the response came from elsewhere
        // (a mix-up attack against a client that talks to several authorization servers).
        if (Get("iss") != issuer) throw new OAuthException("invalid_issuer", "The response did not come from the expected authorization server.");
        if (Get("error") is { Length: > 0 } error) throw new OAuthException(error, Get("error_description"));
        var response = await http.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = Get("code"),
            ["redirect_uri"] = redirectUri,
            ["client_id"] = clientId,
            ["code_verifier"] = pending.Verifier,
        }));
        return await ReadTokenResponse(response);
    }

    internal static async Task<TokenResponse> ReadTokenResponse(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return (await response.Content.ReadFromJsonAsync<TokenResponse>())!;
        var body = (await response.Content.ReadFromJsonAsync<Dictionary<string, string>>())!;
        throw new OAuthException(body["error"], body.GetValueOrDefault("error_description", ""));
    }
}

/// <summary>The client credentials grant, for a service calling an API as itself (no user).</summary>
public static class ClientCredentials
{
    public static async Task<TokenResponse> RequestAsync(HttpClient http, string clientId, string secret, string scope)
    {
        // client_secret_basic: RFC 6749 section 2.3.1 form-encodes the id and secret before Base64.
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.EscapeDataString(clientId)}:{Uri.EscapeDataString(secret)}"));
        using var request = new HttpRequestMessage(HttpMethod.Post, "/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "client_credentials", ["scope"] = scope }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        return await AuthorizationCodeClient.ReadTokenResponse(await http.SendAsync(request));
    }
}
