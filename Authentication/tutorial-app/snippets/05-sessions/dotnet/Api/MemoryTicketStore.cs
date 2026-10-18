using System.Buffers.Text;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

/// <summary>
/// Turns cookie authentication into a server-side session: the ticket (who the user is) stays here, and the cookie
/// carries only a random 256-bit key, encrypted by Data Protection. In memory for this lab; in production back it with
/// Redis or a database (for example through IDistributedCache), with an expiry so abandoned sessions are cleaned up.
/// </summary>
public sealed class MemoryTicketStore : ITicketStore
{
    private const string PreviousKey = "MemoryTicketStore.PreviousKey";
    private readonly ConcurrentDictionary<string, AuthenticationTicket> _tickets = new();

    /// <summary>256 random bits as 43 URL-safe characters.</summary>
    public static string NewKey() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public Task<string> StoreAsync(AuthenticationTicket ticket)
    {
        var key = NewKey();
        _tickets[key] = ticket;
        return Task.FromResult(key);
    }

    // Called when sliding expiration renews the ticket. Never brings back a session that was removed.
    public Task RenewAsync(string key, AuthenticationTicket ticket)
    {
        if (_tickets.TryGetValue(key, out var old)) _tickets.TryUpdate(key, ticket, old);
        return Task.CompletedTask;
    }

    public Task<AuthenticationTicket?> RetrieveAsync(string key) => Task.FromResult(_tickets.GetValueOrDefault(key));

    // The cookie handler calls the overloads below. If the request already has a live session when SignInAsync runs,
    // the handler keeps that session's key (it calls RenewAsync, not StoreAsync), so whoever planted the cookie would
    // share the new sign-in: session fixation. So on the sign-in endpoint, act as if the request had no session.
    public Task<AuthenticationTicket?> RetrieveAsync(string key, HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (httpContext.GetEndpoint()?.Metadata.GetMetadata<StartsNewSession>() is null) return RetrieveAsync(key);
        httpContext.Items[PreviousKey] = key; // remembered, so that a successful sign-in can delete it
        return Task.FromResult<AuthenticationTicket?>(null);
    }

    // Called only when a sign-in succeeds: a fresh key for the new session, and the old session deleted.
    // A wrong password never gets here, so it leaves the current session alone.
    public Task<string> StoreAsync(AuthenticationTicket ticket, HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (httpContext.Items[PreviousKey] is string previous) _tickets.TryRemove(previous, out _);
        return StoreAsync(ticket);
    }

    public Task RemoveAsync(string key)
    {
        _tickets.TryRemove(key, out _);
        return Task.CompletedTask;
    }
}

/// <summary>Marks the sign-in endpoint: a sign-in there never continues the session the request arrived with.</summary>
public sealed class StartsNewSession;
