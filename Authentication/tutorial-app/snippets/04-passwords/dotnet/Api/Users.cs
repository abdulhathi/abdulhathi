using System.Collections.Concurrent;

public sealed class User(string email, string passwordHash)
{
    public string Email { get; } = email;
    public string PasswordHash { get; set; } = passwordHash;
}

/// <summary>An in-memory user table; a real app uses a database.</summary>
public sealed class UserStore
{
    private readonly ConcurrentDictionary<string, User> _users = new();
    public User? Find(string email) => _users.GetValueOrDefault(email);
    public bool TryAdd(User user) => _users.TryAdd(user.Email, user);
    public void Put(User user) => _users[user.Email] = user;
}
