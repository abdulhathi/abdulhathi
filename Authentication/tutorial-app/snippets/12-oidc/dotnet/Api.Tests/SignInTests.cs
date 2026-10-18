using System.Net;

public class SignInTests : IDisposable
{
    private readonly Lab _lab = new();

    [Fact]
    public async Task A_full_sign_in_code_flow_with_PKCE_state_and_nonce_creates_a_session()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/me")).StatusCode);

        var (status, authorize) = await _lab.Visit("/login");
        Assert.Equal(302, status);
        Assert.StartsWith($"{Lab.Base}/idp/authorize?", authorize);
        var request = Lab.Query(authorize);
        Assert.Equal("code", request["response_type"]);
        Assert.Equal("web-app", request["client_id"]);
        Assert.Equal($"{Lab.Base}/callback", request["redirect_uri"]);
        Assert.Equal("openid profile email", request["scope"]);
        Assert.Equal("S256", request["code_challenge_method"]);
        Assert.All(new[] { "state", "nonce", "code_challenge" }, p => Assert.NotEmpty(request[p]));

        var (_, callback) = await _lab.Visit(authorize);
        Assert.StartsWith($"{Lab.Base}/callback?code=", callback);
        var (afterCallback, next) = await _lab.Visit(callback);
        Assert.Equal(302, afterCallback);
        Assert.Equal("/me", next);

        var me = await _lab.Browser.GetAsync("/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal("""{"sub":"u-1001","name":"Ada Example","email":"ada@example.com"}""", await me.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task The_relying_party_refuses_a_callback_with_the_wrong_state()
    {
        var callback = await _lab.StartSignIn();
        var query = Lab.Query(callback);
        var forged = $"{Lab.Base}/callback?code={query["code"]}&state=made-by-an-attacker";
        var response = await _lab.Browser.GetAsync(forged);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("""{"error":"Sign-in failed."}""", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/me")).StatusCode);
    }

    [Fact]
    public async Task Sign_out_ends_the_local_session_and_returns_from_the_provider()
    {
        await _lab.Visit(await _lab.StartSignIn());
        Assert.Equal(HttpStatusCode.OK, (await _lab.Browser.GetAsync("/me")).StatusCode);

        var (status, endSession) = await _lab.Visit("/logout", HttpMethod.Post);
        Assert.Equal(302, status);
        Assert.StartsWith($"{Lab.Base}/idp/logout?", endSession);
        var request = Lab.Query(endSession);
        Assert.Equal($"{Lab.Base}/logged-out", request["post_logout_redirect_uri"]);
        Assert.NotEmpty(request["id_token_hint"]);

        var (_, back) = await _lab.Visit(endSession);
        Assert.StartsWith($"{Lab.Base}/logged-out?state=", back);
        var (_, home) = await _lab.Visit(back);
        Assert.Equal("/", home);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/me")).StatusCode);
        Assert.Equal("""{"signedIn":false}""", await _lab.Browser.GetStringAsync("/"));
    }

    [Fact]
    public async Task A_sign_out_callback_with_the_wrong_state_does_not_redirect()
    {
        await _lab.Visit(await _lab.StartSignIn());
        await _lab.Visit("/logout", HttpMethod.Post); // the local session ends here
        // The handler cannot decrypt this state, so it has no return address: an empty 200 instead of Node.js's and
        // Python's 400.
        var response = await _lab.Browser.GetAsync("/logged-out?state=made-by-an-attacker");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.Equal("", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/me")).StatusCode);
    }

    public void Dispose() => _lab.Dispose();
}
