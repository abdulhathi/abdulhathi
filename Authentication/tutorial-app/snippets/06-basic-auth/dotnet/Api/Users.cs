using Microsoft.AspNetCore.Identity;

public sealed class User(string username)
{
    public string Username { get; } = username;
    public string PasswordHash { get; set; } = "";
}

/// <summary>Username -> password hash (chapter 04), and the check every Basic request runs.</summary>
public sealed class UserStore
{
    // Demo accounts: a person, a CI job whose password has colons, and a name that is not ASCII.
    public static readonly Dictionary<string, string> DemoUsers = new()
    {
        ["ada"] = "correct horse battery",
        ["ci-bot"] = "s3cret:with:colons",
        ["zoë"] = "grüße aus Köln",
    };

    private readonly Dictionary<string, User> _users = [];
    private readonly User _dummy = new("");
    private readonly IPasswordHasher<User> _hasher;

    public UserStore(IPasswordHasher<User> hasher)
    {
        _hasher = hasher;
        foreach (var (username, password) in DemoUsers)
        {
            var user = new User(username);
            user.PasswordHash = hasher.HashPassword(user, password);
            _users[username] = user;
        }
        _dummy.PasswordHash = hasher.HashPassword(_dummy, "not-a-real-password");
    }

    /// <summary>True only for a known user with the right password. Unknown users take as long as known ones.</summary>
    public bool Check(string username, string password)
    {
        var user = _users.GetValueOrDefault(username);
        var result = _hasher.VerifyHashedPassword(user ?? _dummy, (user ?? _dummy).PasswordHash, password);
        return user is not null && result != PasswordVerificationResult.Failed;
    }
}
