using System.Net.Http.Json;

/// <summary>A clock the tests can move forward.</summary>
public sealed class ManualClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}

/// <summary>Sends requests with exactly the cookies a test chooses, like a browser that was handed them.</summary>
public sealed class Api(HttpClient http)
{
    public Task<HttpResponseMessage> Call(HttpMethod method, string path, string? cookies = null, object? body = null, string? csrf = null)
    {
        var request = new HttpRequestMessage(method, path);
        if (cookies is not null) request.Headers.Add("Cookie", cookies);
        if (csrf is not null) request.Headers.Add("X-CSRF-Token", csrf);
        if (body is not null) request.Content = JsonContent.Create(body);
        return http.SendAsync(request);
    }

    /// <summary>The whole Set-Cookie header for one cookie, or null.</summary>
    public static string? SetCookie(HttpResponseMessage res, string name) =>
        res.Headers.TryGetValues("Set-Cookie", out var all) ? all.FirstOrDefault(c => c.StartsWith(name + "=")) : null;

    /// <summary>"name=value" for one cookie the response set, ready to send back.</summary>
    public static string? Cookie(HttpResponseMessage res, string name) => SetCookie(res, name)?.Split(';')[0];
}

public record CsrfResponse(string CsrfToken);
