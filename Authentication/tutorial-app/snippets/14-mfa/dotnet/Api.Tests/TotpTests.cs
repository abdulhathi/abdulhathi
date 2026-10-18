using System.Text;
using OtpNet;
using LibraryTotp = OtpNet.Totp;

public class TotpTests
{
    // The secret both RFCs use for their test values: the ASCII bytes of "12345678901234567890".
    private static readonly byte[] RfcSecret = Encoding.ASCII.GetBytes("12345678901234567890");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-17T12:00:00Z");
    private static string CodeAt(int steps) => Totp.Compute(RfcSecret, Now.AddSeconds(steps * 30));

    [Fact]
    public void Hotp_matches_the_RFC_4226_test_values()
    {
        string[] expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
        for (var counter = 0; counter < expected.Length; counter++) Assert.Equal(expected[counter], Totp.Hotp(RfcSecret, counter));
    }

    [Fact]
    public void Totp_matches_the_RFC_6238_test_values_SHA1_8_digits()
    {
        (long Seconds, string Code)[] vectors =
        [
            (59, "94287082"), (1111111109, "07081804"), (1111111111, "14050471"),
            (1234567890, "89005924"), (2000000000, "69279037"), (20000000000, "65353130"),
        ];
        foreach (var (seconds, code) in vectors)
            Assert.Equal(code, Totp.Compute(RfcSecret, DateTimeOffset.FromUnixTimeSeconds(seconds), digits: 8));
    }

    [Fact]
    public void Base32_matches_the_RFC_4648_test_values_without_padding()
    {
        (string Text, string Encoded)[] vectors = [("f", "MY"), ("fo", "MZXQ"), ("foo", "MZXW6"), ("foob", "MZXW6YQ"), ("fooba", "MZXW6YTB"), ("foobar", "MZXW6YTBOI")];
        foreach (var (text, encoded) in vectors)
        {
            Assert.Equal(encoded, Base32.Encode(Encoding.ASCII.GetBytes(text)));
            Assert.Equal(text, Encoding.ASCII.GetString(Base32.Decode(encoded)));
        }
    }

    [Fact]
    public void The_codes_match_OtpNet_for_random_secrets_and_times()
    {
        for (var i = 0; i < 200; i++)
        {
            var secret = Totp.NewSecret();
            var time = DateTimeOffset.FromUnixTimeSeconds(Random.Shared.NextInt64(4_102_444_800)); // any time before 2100
            Assert.Equal(new LibraryTotp(secret).ComputeTotp(time.UtcDateTime), Totp.Compute(secret, time));
            Assert.Equal(Base32Encoding.ToString(secret), Base32.Encode(secret));
        }
    }

    [Fact]
    public void A_code_is_accepted_one_step_early_or_late_but_not_two()
    {
        var now = Totp.StepAt(Now);
        Assert.Equal(now, Totp.Verify(RfcSecret, CodeAt(0), Now));
        Assert.Equal(now - 1, Totp.Verify(RfcSecret, CodeAt(-1), Now));
        Assert.Equal(now + 1, Totp.Verify(RfcSecret, CodeAt(1), Now));
        Assert.Null(Totp.Verify(RfcSecret, CodeAt(-2), Now));
        Assert.Null(Totp.Verify(RfcSecret, CodeAt(2), Now));
        Assert.Null(Totp.Verify(RfcSecret, "abcdef", Now));
    }

    [Fact]
    public void A_step_at_or_before_the_last_one_used_is_refused_so_a_code_works_once()
    {
        var used = Totp.Verify(RfcSecret, CodeAt(0), Now)!.Value;
        Assert.Null(Totp.Verify(RfcSecret, CodeAt(0), Now, used)); // the same code again
        Assert.Null(Totp.Verify(RfcSecret, CodeAt(-1), Now, used)); // an older one
        Assert.Equal(used + 1, Totp.Verify(RfcSecret, CodeAt(1), Now, used)); // the next one is fine
    }

    [Fact]
    public void A_new_secret_is_160_random_bits_and_the_otpauth_URI_matches_the_one_OtpNet_builds()
    {
        var secret = Totp.NewSecret();
        Assert.Equal(20, secret.Length);
        Assert.NotEqual(secret, Totp.NewSecret());
        var b32 = Base32.Encode(RfcSecret);
        var uri = Totp.OtpauthUri(b32, "ada@example.com", "Auth Lab");
        Assert.Equal("otpauth://totp/Auth%20Lab:ada%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30", uri);
        Assert.Equal(new OtpUri(OtpType.Totp, b32, "ada@example.com", "Auth Lab").ToString(), uri);
    }
}
