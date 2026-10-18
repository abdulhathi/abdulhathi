/// <summary>A client this authorization server knows. A real server keeps them in a database, registered by an admin.</summary>
/// <param name="SecretHash">SHA-256 of the client secret (hex). Public clients, which cannot keep a secret, have none.</param>
/// <param name="RedirectUris">Compared as exact strings: no prefixes, no wildcards.</param>
public sealed record Client(string Id, string? SecretHash, string[] RedirectUris, string[] Scopes, string[] Grants);

public static class Clients
{
    public static readonly Client[] All =
    [
        // A single-page or mobile app acting for a user. It is public, so PKCE protects its codes instead of a secret.
        new("photo-app", null, ["http://localhost:4000/callback"], ["photos.read"], ["authorization_code"]),
        // A second public app. The tests use it to show that a code works only for the client it was issued to.
        new("album-app", null, ["http://localhost:4002/callback"], ["photos.read"], ["authorization_code"]),
        // A back-end job calling the API as itself. It is confidential: it proves who it is with a secret.
        // This is SHA-256 of the test secret "report-job-secret" that the tests and the curl session use.
        new("report-job", "5a6109c0796d5c2d3b378a951cd14803866a434eadf8964eda1d246a0091c35b", [], ["reports.read"], ["client_credentials"]),
    ];

    public static Client? Find(string? id) => All.FirstOrDefault(c => c.Id == id);
}
