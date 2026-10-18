using System.Buffers.Text;
using System.Collections.Concurrent;
using Fido2NetLib.Objects;

// What the server keeps: users, their passkeys (public keys only), and the challenges it has handed out.
// A real app uses database tables for the first two and Redis or a table with an expiry for the third.

/// <summary>Id: random bytes, never the email.</summary>
public sealed record PasskeyUser(byte[] Id, string Username);

public sealed class StoredCredential
{
    public required byte[] Id { get; init; }
    public required byte[] UserId { get; init; }
    public required byte[] PublicKey { get; init; } // a COSE key; never secret
    public uint Counter { get; set; } // the signature counter from the last sign-in
    public required AuthenticatorTransport[] Transports { get; init; } // internal, hybrid, usb, nfc, ble
    public required string DeviceType { get; init; } // "singleDevice" (device-bound) or "multiDevice" (synced)
    public bool BackedUp { get; set; }
}

public sealed class PasskeyStore
{
    private readonly ConcurrentDictionary<string, PasskeyUser> _users = new(); // by id, base64url
    private readonly ConcurrentDictionary<string, StoredCredential> _credentials = new(); // by credential ID, base64url

    public PasskeyUser? FindUser(byte[] id) => _users.GetValueOrDefault(Base64Url.EncodeToString(id));
    public PasskeyUser? FindUserByName(string username) => _users.Values.FirstOrDefault(u => u.Username == username);
    public StoredCredential? FindCredential(string id) => _credentials.GetValueOrDefault(id);
    public StoredCredential? FindCredential(byte[] id) => FindCredential(Base64Url.EncodeToString(id));

    public void Add(PasskeyUser user, StoredCredential credential)
    {
        _users[Base64Url.EncodeToString(user.Id)] = user;
        _credentials[Base64Url.EncodeToString(credential.Id)] = credential;
    }
}

/// <summary>Challenges are random, stored on the server, short-lived, and single-use.</summary>
public sealed class Challenges(TimeProvider clock)
{
    public static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);
    private sealed record Pending(object Options, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, Pending> _pending = new();

    /// <summary>Fido2 makes the challenge; we keep the whole options object, because verifying needs it.</summary>
    public void Remember(byte[] challenge, object options) =>
        _pending[Base64Url.EncodeToString(challenge)] = new Pending(options, clock.GetUtcNow() + Ttl);

    /// <summary>
    /// Removes the challenge whatever happens next, so a response can never be verified twice. The options type
    /// (CredentialCreateOptions or AssertionOptions) says which ceremony the challenge was issued for.
    /// </summary>
    public T? Take<T>(string challenge) where T : class =>
        _pending.TryRemove(challenge, out var p) && p.ExpiresAt > clock.GetUtcNow() ? p.Options as T : null;
}
