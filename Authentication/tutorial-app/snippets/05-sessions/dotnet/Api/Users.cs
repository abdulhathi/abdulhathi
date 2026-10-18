using Microsoft.AspNetCore.Identity;

public sealed class User(string email)
{
    public string Email { get; } = email;
    public string PasswordHash { get; set; } = "";
}

/// <summary>Email -> password hash, and the sign-in check from chapter 04.</summary>
public sealed class UserStore
{
    // Two demo accounts so you can try the API. A real app signs users up (chapter 04) and keeps them in a database.
    public static readonly Dictionary<string, string> DemoUsers = new()
    {
        ["ada@example.com"] = "correct horse battery",
        ["bo@example.com"] = "purple monkey dishwasher",
    };

    private readonly Dictionary<string, User> _users = [];
    private readonly User _dummy = new("");
    private readonly IPasswordHasher<User> _hasher;

    public UserStore(IPasswordHasher<User> hasher)
    {
        _hasher = hasher;
        foreach (var (email, password) in DemoUsers)
        {
            var user = new User(email);
            user.PasswordHash = hasher.HashPassword(user, password);
            _users[email] = user;
        }
        _dummy.PasswordHash = hasher.HashPassword(_dummy, "not-a-real-password");
    }

    /// <summary>The normalized email if the password is right, otherwise null. Unknown emails take as long as known ones.</summary>
    public string? Check(string email, string password)
    {
        var key = email.Trim().ToLowerInvariant();
        var user = _users.GetValueOrDefault(key);
        var result = _hasher.VerifyHashedPassword(user ?? _dummy, (user ?? _dummy).PasswordHash, password);
        return user is not null && result != PasswordVerificationResult.Failed ? key : null;
    }
}
