using System.Buffers.Text;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

/// <summary>
/// The sending side of a webhook: sign the exact bytes you send, with a timestamp inside the signature.
/// Header: Webhook-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256 of "&lt;t&gt;.&lt;body&gt;"&gt;[,v1=&lt;another secret's signature&gt;]
/// </summary>
public static class WebhookSender
{
    /// <summary>A new shared secret, generated once and given to the receiver over a safe channel (a settings page, a vault).</summary>
    public static string NewSecret() => $"whsec_{Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32))}";

    /// <summary>HMAC-SHA256 over "&lt;timestamp&gt;.&lt;body&gt;", in hex. The timestamp is signed too, so it cannot be changed.</summary>
    public static string Sign(string secret, long timestamp, byte[] body)
    {
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{timestamp}."), .. body];
        return Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed));
    }

    /// <summary>One v1 signature per active secret, so the receiver can rotate secrets without missing a delivery.</summary>
    public static string SignatureHeader(IEnumerable<string> secrets, long timestamp, byte[] body) =>
        string.Join(',', [$"t={timestamp}", .. secrets.Select(s => $"v1={Sign(s, timestamp, body)}")]);

    /// <summary>Sends one webhook: serialize once, sign those exact bytes, and POST them.</summary>
    public static Task<HttpResponseMessage> DeliverAsync(HttpClient client, string url, object evt, IEnumerable<string> secrets, TimeProvider clock)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(evt, JsonSerializerOptions.Web);
        var timestamp = clock.GetUtcNow().ToUnixTimeSeconds();
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        request.Headers.Add("Webhook-Signature", SignatureHeader(secrets, timestamp, body));
        return client.SendAsync(request);
    }
}
