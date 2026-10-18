using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

public class ReceiverTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const long T = 1792238400; // 2026-10-17 12:00:00 UTC, the receiver's clock
    private readonly ManualClock _clock = new(DateTimeOffset.FromUnixTimeSeconds(T));
    private readonly WebApplicationFactory<Program> _base;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly string _secret = WebhookSender.NewSecret();

    public ReceiverTests(WebApplicationFactory<Program> factory)
    {
        _base = factory;
        _factory = Receiver(_secret);
        _client = _factory.CreateClient();
    }

    private WebApplicationFactory<Program> Receiver(params string[] secrets) =>
        _base.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.AddSingleton<TimeProvider>(_clock);
            s.AddSingleton(new WebhookSecrets(secrets));
        }));

    private static Task<HttpResponseMessage> Post(HttpClient client, string body, string? header = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/webhooks/orders") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        if (header is not null) request.Headers.TryAddWithoutValidation("Webhook-Signature", header);
        return client.SendAsync(request);
    }

    private Task<HttpResponseMessage> Post(string body, string? header = null) => Post(_client, body, header);
    private static string Sign(string[] secrets, long timestamp, string body) => WebhookSender.SignatureHeader(secrets, timestamp, Encoding.UTF8.GetBytes(body));
    private static string Event(string id) => $$$"""{"id":"{{{id}}}","type":"order.paid","data":{"orderId":"ord_1001","amount":4200}}""";

    [Fact]
    public async Task A_correctly_signed_webhook_is_accepted()
    {
        var body = Event("evt_1");
        var res = await Post(body, Sign([_secret], T, body));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"received":true,"type":"order.paid"}""", await res.Content.ReadAsStringAsync());
        Assert.Equal("evt_1", _factory.Services.GetRequiredService<ReceivedEvents>().Last().GetProperty("id").GetString());
    }

    [Fact]
    public async Task Deliver_sends_a_webhook_the_receiver_accepts()
    {
        var res = await WebhookSender.DeliverAsync(_client, "/webhooks/orders", new { id = "evt_2", type = "order.refunded" }, [_secret], _clock);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("""{"received":true,"type":"order.refunded"}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_tampered_body_is_rejected()
    {
        var header = Sign([_secret], T, Event("evt_3"));
        var res = await Post(Event("evt_3").Replace("4200", "1"), header);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("""{"error":"Signature does not match."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_signature_made_with_the_wrong_secret_is_rejected()
    {
        var body = Event("evt_4");
        var res = await Post(body, Sign([WebhookSender.NewSecret()], T, body));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("""{"error":"Signature does not match."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task The_raw_bytes_are_checked_so_reserialized_JSON_fails()
    {
        var body = Event("evt_5");
        var pretty = JsonNode.Parse(body)!.ToJsonString(new JsonSerializerOptions { WriteIndented = true }); // the same data, different bytes
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(pretty, Sign([_secret], T, body))).StatusCode);
    }

    [Fact]
    public async Task A_timestamp_more_than_5_minutes_off_is_rejected_even_with_a_valid_signature()
    {
        foreach (var offset in new[] { -301, 301 })
        {
            var body = Event($"evt_6{offset}");
            var res = await Post(body, Sign([_secret], T + offset, body));
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            Assert.Equal("""{"error":"Timestamp outside the tolerance window."}""", await res.Content.ReadAsStringAsync());
        }
        var ok = Event("evt_6");
        Assert.Equal(HttpStatusCode.OK, (await Post(ok, Sign([_secret], T - 300, ok))).StatusCode); // 5 minutes exactly is still fine
    }

    [Fact]
    public async Task Moving_t_to_a_fresh_time_breaks_the_signature()
    {
        var body = Event("evt_6b");
        var old = Sign([_secret], T - 600, body); // recorded 10 minutes ago
        var res = await Post(body, old.Replace($"t={T - 600}", $"t={T}"));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("""{"error":"Signature does not match."}""", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_replayed_delivery_is_rejected_even_with_its_header_rewritten()
    {
        var body = Event("evt_7");
        var header = Sign([_secret], T, body);
        Assert.Equal(HttpStatusCode.OK, (await Post(body, header)).StatusCode);
        var replay = await Post(body, header);
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        Assert.Equal("""{"error":"This delivery was already received."}""", await replay.Content.ReadAsStringAsync());
        var (ts, v1) = (header.Split(',')[0], header.Split(',')[1]);
        foreach (var rewritten in new[] { $"{ts}, {v1}", $"{v1},{ts}", $"{ts},{v1},{v1}", $"{ts},{v1},v0={new string('0', 64)}" })
            Assert.Equal(HttpStatusCode.Conflict, (await Post(body, rewritten)).StatusCode);
    }

    [Fact]
    public async Task After_the_5_minutes_a_replay_is_stopped_by_the_timestamp_check_instead()
    {
        var body = Event("evt_7b");
        var header = Sign([_secret], T, body);
        Assert.Equal(HttpStatusCode.OK, (await Post(body, header)).StatusCode);
        _clock.Now = _clock.Now.AddSeconds(301);
        var late = await Post(body, header);
        Assert.Equal(HttpStatusCode.BadRequest, late.StatusCode);
        Assert.Equal("""{"error":"Timestamp outside the tolerance window."}""", await late.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_missing_or_malformed_header_or_a_body_that_is_not_JSON_is_rejected()
    {
        var missing = await Post(Event("evt_8"));
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal("""{"error":"Missing Webhook-Signature header."}""", await missing.Content.ReadAsStringAsync());
        var good = WebhookSender.Sign(_secret, T, Encoding.UTF8.GetBytes(Event("evt_8")));
        string[] headers =
        [
            "t=yesterday,v1=abc",
            $"v1={good}", // no t
            $"t={T}", // no v1
            $"t={T},v1={good[..40]}", // the wrong length
            $"t={T},v0={good}", // only a scheme this receiver does not know
            $"t={T}=0,v1={good}", // junk after the timestamp
            $"t={new string('9', 5000)},v1={good}", // a timestamp far too long
        ];
        foreach (var header in headers)
        {
            var malformed = await Post(Event("evt_8"), header);
            Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
            Assert.Equal("""{"error":"Malformed Webhook-Signature header."}""", await malformed.Content.ReadAsStringAsync());
        }
        // The signature is checked before the body is parsed.
        var forged = await Post("not json", Sign([WebhookSender.NewSecret()], T, "not json"));
        Assert.Equal("""{"error":"Signature does not match."}""", await forged.Content.ReadAsStringAsync());
        foreach (var body in new[] { "not json", "[1,2]", """{"amount":NaN}""" })
        {
            var notJson = await Post(body, Sign([_secret], T, body));
            Assert.Equal(HttpStatusCode.BadRequest, notJson.StatusCode);
            Assert.Equal("""{"error":"Body is not a JSON object."}""", await notJson.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task During_rotation_either_secret_is_accepted_and_a_replay_with_one_v1_removed_is_still_caught()
    {
        var (oldSecret, newer) = (WebhookSender.NewSecret(), WebhookSender.NewSecret());
        var rotating = Receiver(newer, oldSecret).CreateClient();
        var fromOld = Event("evt_9a");
        Assert.Equal(HttpStatusCode.OK, (await Post(rotating, fromOld, Sign([oldSecret], T, fromOld))).StatusCode);
        var fromNew = Event("evt_9b");
        Assert.Equal(HttpStatusCode.OK, (await Post(rotating, fromNew, Sign([newer], T, fromNew))).StatusCode);
        var fromOther = Event("evt_9c");
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(rotating, fromOther, Sign([WebhookSender.NewSecret()], T, fromOther))).StatusCode);

        var both = Event("evt_9d");
        var header = Sign([newer, oldSecret], T, both); // t=...,v1=<new>,v1=<old>
        Assert.Equal(HttpStatusCode.OK, (await Post(rotating, both, header)).StatusCode);
        var trimmed = string.Join(',', header.Split(',').Where((_, i) => i != 1)); // drop the first v1
        Assert.Equal(HttpStatusCode.Conflict, (await Post(rotating, both, trimmed)).StatusCode);
    }

    [Fact]
    public async Task The_body_is_read_whatever_the_Content_Type_even_none()
    {
        var body = Encoding.UTF8.GetBytes(Event("evt_10"));
        var request = new HttpRequestMessage(HttpMethod.Post, "/webhooks/orders") { Content = new ByteArrayContent(body) }; // no Content-Type
        request.Headers.TryAddWithoutValidation("Webhook-Signature", WebhookSender.SignatureHeader([_secret], T, body));
        Assert.Equal(HttpStatusCode.OK, (await _client.SendAsync(request)).StatusCode);
    }
}
