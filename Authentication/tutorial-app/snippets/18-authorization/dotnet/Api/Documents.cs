using System.Collections.Concurrent;

public sealed record Document(string Id, string Tenant, string Owner, string Department, string Title, string Status);

/// <summary>The documents table. Every method takes the caller's tenant, so no query can reach another tenant's rows.</summary>
public sealed class DocumentStore
{
    private readonly ConcurrentDictionary<string, Document> _rows; // a real app uses a database table with a tenant column

    public DocumentStore(IEnumerable<Document> seed) => _rows = new(seed.ToDictionary(d => d.Id));

    /// <summary>Every document in one tenant, by id. The tenant filter is part of the query, not an afterthought.</summary>
    public IReadOnlyList<Document> List(string tenant) =>
        _rows.Values.Where(d => d.Tenant == tenant).OrderBy(d => d.Id, StringComparer.Ordinal).ToList();

    /// <summary>One document, only if it belongs to this tenant. Another tenant's id looks exactly like a missing one.</summary>
    public Document? Find(string tenant, string id) =>
        _rows.TryGetValue(id, out var d) && d.Tenant == tenant ? d : null;

    public void Put(Document doc) => _rows[doc.Id] = doc;

    public bool Remove(string tenant, string id) => Find(tenant, id) is not null && _rows.TryRemove(id, out _);
}

public sealed record DemoUser(string Sub, string Tenant, string[] Roles, string Department);

/// <summary>Demo data: two tenants, north and south. The same users and documents exist in every stack.</summary>
public static class Demo
{
    public static readonly IReadOnlyDictionary<string, DemoUser> Users = new Dictionary<string, DemoUser>
    {
        ["ada"] = new("ada", "north", ["editor"], "sales"),
        ["bo"] = new("bo", "north", ["viewer"], "sales"),
        ["cy"] = new("cy", "north", ["editor"], "support"),
        ["di"] = new("di", "north", ["admin"], "it"),
        ["eve"] = new("eve", "south", ["admin"], "sales"),
    };

    public static readonly IReadOnlyList<Document> Documents =
    [
        new("d1", "north", "ada", "sales", "Sales plan", "draft"),
        new("d2", "north", "ada", "sales", "Price list", "published"),
        new("d3", "north", "cy", "support", "Support rota", "draft"),
        new("d4", "south", "eve", "sales", "South roadmap", "draft"),
    ];
}
