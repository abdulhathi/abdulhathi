using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.WebUtilities;

public class CodeFlowTests : IDisposable
{
    private const string Redirect = "http://localhost:4000/callback";
    private readonly Lab _lab = new();

    private AuthorizationCodeClient PhotoApp(string redirectUri = Redirect) => new(_lab.Http, Lab.Issuer, "photo-app", redirectUri);

    private Task<HttpResponseMessage> GetPhotos(string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/photos");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return _lab.Http.SendAsync(request);
    }

    /// <summary>Runs step 1 and returns the pending values plus the callback URL the browser was sent to.</summary>
    private async Task<(PendingAuthorization Pending, string Callback)> Authorize(AuthorizationCodeClient client)
    {
        var pending = client.Start("photos.read");
        return (pending, (await _lab.Visit(pending.Url)).Location);
    }

    [Fact]
    public async Task The_code_flow_with_PKCE_returns_a_token_that_reads_the_users_photos()
    {
        var client = PhotoApp();
        var pending = client.Start("photos.read");
        var (status, location) = await _lab.Visit(pending.Url);
        Assert.Equal(302, status);
        Assert.StartsWith($"{Redirect}?code=", location);
        Assert.Equal(pending.State, Lab.Query(location)["state"]);
        Assert.Equal(Lab.Issuer, Lab.Query(location)["iss"]);

        var tokens = await client.FinishAsync(location, pending);
        Assert.Equal("Bearer", tokens.TokenType);
        Assert.Equal(600, tokens.ExpiresIn);
        Assert.Equal("photos.read", tokens.Scope);
        var api = await GetPhotos(tokens.AccessToken);
        Assert.Equal(HttpStatusCode.OK, api.StatusCode);
        Assert.Equal("""{"owner":"u-1001","photos":["beach.jpg","hills.jpg"]}""", await api.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_wrong_code_verifier_is_refused_and_the_code_is_used_up()
    {
        var client = PhotoApp();
        var (pending, callback) = await Authorize(client);
        var wrong = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(callback, pending with { Verifier = Pkce.NewVerifier() }));
        Assert.Equal(("invalid_grant", "code_verifier does not match the code_challenge."), (wrong.Error, wrong.Message));
        // Even the right verifier fails now: one failed try burns the code, so verifiers cannot be guessed.
        var again = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(callback, pending));
        Assert.Equal(("invalid_grant", "The code is invalid, expired or already used."), (again.Error, again.Message));
    }

    [Fact]
    public async Task A_code_works_only_once_and_using_it_again_revokes_the_token_it_gave()
    {
        var client = PhotoApp();
        var (pending, callback) = await Authorize(client);
        var tokens = await client.FinishAsync(callback, pending);
        Assert.Equal(HttpStatusCode.OK, (await GetPhotos(tokens.AccessToken)).StatusCode);

        var again = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(callback, pending));
        Assert.Equal(("invalid_grant", "The code is invalid, expired or already used."), (again.Error, again.Message));
        // The code leaked (someone else may hold the first token), so that token no longer works.
        var api = await GetPhotos(tokens.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, api.StatusCode);
        Assert.Equal("Bearer error=\"invalid_token\"", api.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task A_code_works_only_for_the_client_it_was_issued_to()
    {
        var (pending, callback) = await Authorize(PhotoApp());
        // album-app is another registered public client. It presents photo-app's code, redirect URI and even its verifier.
        FormUrlEncodedContent Form(string clientId) => new(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = Lab.Query(callback)["code"],
            ["redirect_uri"] = Redirect,
            ["client_id"] = clientId,
            ["code_verifier"] = pending.Verifier,
        });
        var response = await _lab.Http.PostAsync("/token", Form("album-app"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":"invalid_grant","error_description":"The code was issued to another client."}""",
            await response.Content.ReadAsStringAsync());
        // The attempt used the code up, so not even photo-app can redeem it now.
        var again = await _lab.Http.PostAsync("/token", Form("photo-app"));
        Assert.Contains("\"error\":\"invalid_grant\"", await again.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_code_expires_after_60_seconds()
    {
        var client = PhotoApp();
        var (pending, callback) = await Authorize(client);
        _lab.Clock.Now += TimeSpan.FromSeconds(61);
        var e = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(callback, pending));
        Assert.Equal("invalid_grant", e.Error);
    }

    [Fact]
    public async Task The_redirect_uri_must_match_exactly_at_authorize_and_at_token()
    {
        string[] lookalikes =
        [
            "http://localhost:4000/callback/",
            "http://localhost:4000/callback?next=/admin",
            "http://localhost:4001/callback",
            "https://evil.example.com/callback",
        ];
        foreach (var uri in lookalikes)
        {
            var (status, location) = await _lab.Visit(PhotoApp(uri).Start("photos.read").Url);
            Assert.Equal(400, status);
            Assert.Equal("", location); // never redirect to an address that is not registered
        }

        var (pending, callback) = await Authorize(PhotoApp());
        var response = await _lab.Http.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = Lab.Query(callback)["code"],
            ["redirect_uri"] = "http://localhost:4000/other",
            ["client_id"] = "photo-app",
            ["code_verifier"] = pending.Verifier,
        }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":"invalid_grant","error_description":"redirect_uri does not match the authorization request."}""",
            await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task The_client_rejects_a_callback_whose_state_does_not_match()
    {
        var client = PhotoApp();
        var (pending, callback) = await Authorize(client);
        // A forged link: a real code, but a state this browser never made (a login CSRF attempt).
        var forged = QueryHelpers.AddQueryString(Redirect, new Dictionary<string, string?> { ["code"] = Lab.Query(callback)["code"], ["state"] = "made-by-an-attacker" });
        var e = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(forged, pending));
        Assert.Equal("invalid_state", e.Error);
    }

    [Fact]
    public async Task The_client_rejects_a_callback_with_a_missing_or_different_iss()
    {
        var client = PhotoApp();
        var (pending, callback) = await Authorize(client);
        foreach (var change in new Action<Dictionary<string, string>>[] { q => q.Remove("iss"), q => q["iss"] = "https://evil.example.com" })
        {
            var query = Lab.Query(callback);
            change(query);
            var e = await Assert.ThrowsAsync<OAuthException>(() => client.FinishAsync(QueryHelpers.AddQueryString(Redirect, query!), pending));
            Assert.Equal("invalid_issuer", e.Error);
        }
    }

    [Fact]
    public async Task The_authorization_server_requires_PKCE_with_S256_and_an_allowed_scope()
    {
        foreach (var change in new Action<Dictionary<string, string>>[] { q => q.Remove("code_challenge"), q => q["code_challenge_method"] = "plain" })
        {
            var query = Lab.Query(PhotoApp().Start("photos.read").Url);
            change(query);
            var (status, location) = await _lab.Visit(QueryHelpers.AddQueryString("/authorize", query!));
            Assert.Equal(302, status); // the client and redirect_uri are fine, so the error goes back to the client
            var back = Lab.Query(location);
            Assert.Equal("invalid_request", back["error"]);
            Assert.Equal("PKCE with S256 is required.", back["error_description"]);
            Assert.Equal(query["state"], back["state"]);
            Assert.Equal(Lab.Issuer, back["iss"]);
        }
        var (_, scopeLocation) = await _lab.Visit(PhotoApp().Start("reports.read").Url);
        Assert.Equal("invalid_scope", Lab.Query(scopeLocation)["error"]);
    }

    public void Dispose() => _lab.Dispose();
}
