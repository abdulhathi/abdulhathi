using System.Net;

/// <summary>Each test makes the provider get one thing wrong in the ID token; the sign-in must fail, with no session.</summary>
public class IdTokenTests : IDisposable
{
    private readonly Lab _lab = new();

    private async Task<string> SignInWith(Misbehavior misbehave)
    {
        _lab.Idp.Misbehave = misbehave;
        var response = await _lab.Browser.GetAsync(await _lab.StartSignIn());
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("""{"error":"Sign-in failed."}""", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await _lab.Browser.GetAsync("/me")).StatusCode);
        return _lab.LastSignInError!;
    }

    [Fact]
    public async Task An_ID_token_with_the_wrong_nonce_is_refused() =>
        Assert.Contains("nonce", await SignInWith(Misbehavior.WrongNonce));

    [Fact]
    public async Task An_ID_token_for_another_audience_is_refused() =>
        Assert.Contains("IDX10214", await SignInWith(Misbehavior.WrongAudience)); // audience validation failed

    [Fact]
    public async Task An_expired_ID_token_is_refused() =>
        Assert.Contains("IDX10223", await SignInWith(Misbehavior.Expired)); // lifetime validation failed: expired

    [Fact]
    public async Task An_ID_token_from_another_issuer_is_refused() =>
        Assert.Contains("IDX10205", await SignInWith(Misbehavior.WrongIssuer)); // issuer validation failed

    [Fact]
    public async Task An_ID_token_signed_with_an_unknown_key_is_refused() =>
        Assert.Contains("kid", await SignInWith(Misbehavior.UnknownKid));

    [Fact]
    public async Task An_ID_token_with_a_forged_signature_is_refused() =>
        Assert.Contains("IDX10511", await SignInWith(Misbehavior.BadSignature)); // signature validation failed

    public void Dispose() => _lab.Dispose();
}
