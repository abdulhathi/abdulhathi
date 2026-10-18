using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Unicode;

var builder = WebApplication.CreateBuilder(args);

// Active secrets, comma-separated, newest first: WEBHOOK_SECRETS=whsec_new,whsec_old while you rotate.
string[] secrets = (builder.Configuration["WEBHOOK_SECRETS"] ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
if (secrets.Length == 0)
{
    secrets = [WebhookSender.NewSecret()];
    Console.WriteLine($"No WEBHOOK_SECRETS set. This run uses: {secrets[0]}");
}
builder.Services.AddSingleton(new WebhookSecrets(secrets));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<WebhookVerifier>();
builder.Services.AddSingleton<ReceivedEvents>();

var app = builder.Build();

// No typed body parameter (such as WebhookEvent evt) here: it would parse the JSON first, and the signed bytes would be gone.
app.MapPost("/webhooks/orders", async (HttpRequest request, WebhookVerifier verifier, ReceivedEvents received) =>
{
    var body = await ReadBodyAsync(request);
    if (verifier.Verify(request.Headers["Webhook-Signature"].ToString(), body) is { } rejection)
        return Results.Json(new { error = rejection.Error }, statusCode: rejection.Status);

    // Only now, with a genuine body, parse it. A JsonElement takes any JSON object, as JSON.parse and json.loads do
    // (a real app would deserialize into its own event types here); Utf8.IsValid refuses bytes that are not UTF-8.
    JsonElement evt = default;
    try { if (Utf8.IsValid(body)) evt = JsonSerializer.Deserialize<JsonElement>(body); }
    catch (JsonException) { }
    if (evt.ValueKind != JsonValueKind.Object) return Results.Json(new { error = "Body is not a JSON object." }, statusCode: 400);
    received.Enqueue(evt);
    return Results.Ok(new { received = true, type = evt.TryGetProperty("type", out var type) ? type : (JsonElement?)null });
});

app.Run();

// The exact bytes that were sent. If a middleware must read the body before the endpoint does, it calls
// request.EnableBuffering() first and sets request.Body.Position = 0 when done, so the body can be read again.
static async Task<byte[]> ReadBodyAsync(HttpRequest request)
{
    using var buffer = new MemoryStream();
    await request.Body.CopyToAsync(buffer);
    return buffer.ToArray();
}

/// <summary>What arrived. A real receiver puts events on a queue and answers at once.</summary>
public sealed class ReceivedEvents : ConcurrentQueue<JsonElement>;

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
