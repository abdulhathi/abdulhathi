using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

public sealed class Pending(string email, string tokenHash, byte[] codeHash, string browserHash, DateTimeOffset expiresAt)
{
    public string Email { get; } = email;
    public string TokenHash { get; } = tokenHash;
    public byte[] CodeHash { get; } = codeHash;
    public string BrowserHash { get; } = browserHash; // which browser asked: see SameBrowser()
    public DateTimeOffset ExpiresAt { get; } = expiresAt;
    public int Attempts { get; set; }
}

/// <summary>
/// Pending email sign-ins. Each one holds a link token and a 6-digit code, and the database keeps neither: only a
/// SHA-256 hash of the token (256 random bits cannot be guessed, so a fast hash is enough) and a keyed hash (HMAC) of
/// the code (a million possible codes would fall to a plain hash in a second, so the key, kept outside the database,
/// is what protects it).
/// </summary>
public sealed class MagicLinks(TimeProvider clock, byte[]? codeKey = null)
{
    public static readonly TimeSpan Ttl = TimeSpan.FromMinutes(15);
    public const int MaxCodeAttempts = 5;
    // Wrong codes in a row for one address, across all its emails. Without this, an attacker who keeps asking for
    // emails gets 5 more guesses with each one, for ever. NIST SP 800-63B allows at most 100; lower is better.
    public const int MaxFailedCodes = 20;

    private readonly byte[] _codeKey = codeKey ?? RandomNumberGenerator.GetBytes(32); // with several servers, share one key from configuration
    private readonly Dictionary<string, Pending> _byToken = new(); // like a table with a unique index on token_hash
    private readonly Dictionary<string, Pending> _byEmail = new(); // the latest request for each email, for codes
    private readonly Dictionary<string, int> _failedCodes = new(); // email -> wrong codes in a row
    private readonly Lock _gate = new(); // requests run in parallel; a database would use a transaction

    public IReadOnlyDictionary<string, Pending> ByToken => _byToken;
    public IReadOnlyDictionary<string, Pending> ByEmail => _byEmail;

    public static string Sha256(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    /// <summary>A new link token and code for this email. Any earlier ones stop working.</summary>
    public (string Token, string Code) Issue(string email, string browser)
    {
        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32)); // 256 bits
        var code = RandomNumberGenerator.GetInt32(1_000_000).ToString("D6");
        var pending = new Pending(email, Sha256(token), Hmac(email, code), Sha256(browser), clock.GetUtcNow() + Ttl);
        lock (_gate)
        {
            if (_byEmail.TryGetValue(email, out var old)) Remove(old);
            _byToken[pending.TokenHash] = pending;
            _byEmail[email] = pending;
        }
        return (token, code);
    }

    /// <summary>The pending sign-in for a link, if it is still valid, without using it up (for the confirmation page).</summary>
    public Pending? Peek(string token)
    {
        lock (_gate)
            return _byToken.TryGetValue(Sha256(token), out var p) && p.ExpiresAt > clock.GetUtcNow() ? p : null;
    }

    /// <summary>Uses up a link: returns its email the first time, and null ever after.</summary>
    public string? Consume(string token)
    {
        Pending? pending;
        lock (_gate)
        {
            if (!_byToken.TryGetValue(Sha256(token), out pending)) return null;
            // Removed before anything else, inside the lock, so a second request finds nothing. In SQL this is one
            // statement: DELETE FROM magic_links WHERE token_hash = $1 AND expires_at > now() RETURNING email.
            Remove(pending);
            if (pending.ExpiresAt <= clock.GetUtcNow()) return null;
            _failedCodes.Remove(pending.Email); // the real user signed in: codes work again
        }
        return pending.Email;
    }

    /// <summary>
    /// Checks an emailed code. A right code is used up; five wrong ones use it up too. After MaxFailedCodes wrong codes
    /// in a row, codes stop working for this address until it signs in with a link (links still work).
    /// </summary>
    public bool CheckCode(string email, string code)
    {
        lock (_gate)
        {
            if (!_byEmail.TryGetValue(email, out var pending) || pending.ExpiresAt <= clock.GetUtcNow()) return false;
            var failed = _failedCodes.GetValueOrDefault(email);
            if (failed >= MaxFailedCodes) return false;
            if (CryptographicOperations.FixedTimeEquals(Hmac(email, Regex.Replace(code, @"\s", "")), pending.CodeHash))
            {
                Remove(pending);
                _failedCodes.Remove(email);
                return true;
            }
            _failedCodes[email] = failed + 1;
            if (++pending.Attempts >= MaxCodeAttempts) Remove(pending);
            return false;
        }
    }

    /// <summary>True when the request comes from the browser that asked for the email (it carries that browser's cookie).</summary>
    public bool SameBrowser(Pending pending, string? browser) => browser is not null && Sha256(browser) == pending.BrowserHash;

    private byte[] Hmac(string email, string code) => HMACSHA256.HashData(_codeKey, Encoding.UTF8.GetBytes($"{email}:{code}"));

    private void Remove(Pending pending)
    {
        _byToken.Remove(pending.TokenHash);
        if (_byEmail.TryGetValue(pending.Email, out var current) && current == pending) _byEmail.Remove(pending.Email);
    }
}
