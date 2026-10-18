using System.Text;

public class SenderTests
{
    private const long T = 1792238400; // 2026-10-17 12:00:00 UTC

    [Fact]
    public void The_signature_is_HMAC_SHA256_of_timestamp_dot_body_in_hex()
    {
        // The same value as: printf '%s' '1792238400.{"id":"evt_1","type":"order.paid"}' | openssl dgst -sha256 -hmac whsec_test_vector
        Assert.Equal(
            "c0ed66f2141a653db1d8b65b667377f0673d6c075b3b5b95d4b08bf33b568407",
            WebhookSender.Sign("whsec_test_vector", T, Encoding.UTF8.GetBytes("""{"id":"evt_1","type":"order.paid"}""")));
    }

    [Fact]
    public void The_header_has_the_timestamp_and_one_v1_signature_per_active_secret()
    {
        var (a, b) = (WebhookSender.NewSecret(), WebhookSender.NewSecret());
        Assert.Matches("^whsec_[A-Za-z0-9_-]{43}$", a);
        Assert.NotEqual(a, b);
        var body = Encoding.UTF8.GetBytes("""{"id":"evt_2"}""");
        Assert.Equal($"t={T},v1={WebhookSender.Sign(a, T, body)},v1={WebhookSender.Sign(b, T, body)}", WebhookSender.SignatureHeader([a, b], T, body));
    }
}
