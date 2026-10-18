using System.Collections.Concurrent;

public sealed record SamlUser(string NameId, string Email, string Name, string[] Groups);

/// <summary>Local users, keyed by IdP + NameID (not by email: emails change and get reused). A real app uses a database.</summary>
public sealed class UserDirectory
{
    private readonly ConcurrentDictionary<string, SamlUser> _users = new();
    public void Put(string issuer, SamlUser user) => _users[$"{issuer} {user.NameId}"] = user;
    public SamlUser? Find(string issuer, string nameId) => _users.GetValueOrDefault($"{issuer} {nameId}");
}
