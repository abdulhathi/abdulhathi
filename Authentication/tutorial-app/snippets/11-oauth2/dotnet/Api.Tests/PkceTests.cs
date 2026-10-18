public class PkceTests
{
    [Fact]
    public void The_S256_challenge_matches_the_RFC_7636_example()
    {
        // RFC 7636 Appendix B.
        Assert.Equal("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce.ChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
    }

    [Fact]
    public void Each_verifier_is_new_43_URL_safe_characters()
    {
        var a = Pkce.NewVerifier();
        Assert.Equal(43, a.Length);
        Assert.Matches(Pkce.VerifierFormat(), a);
        Assert.NotEqual(a, Pkce.NewVerifier());
    }
}
