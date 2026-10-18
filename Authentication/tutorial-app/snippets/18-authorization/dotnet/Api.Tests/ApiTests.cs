using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

public sealed class ApiTests : IDisposable
{
    // xunit makes a new instance per test: a fresh app, with fresh demo data, for every test.
    private readonly WebApplicationFactory<Program> _factory = new();
    private readonly HttpClient _client;
    private readonly TokenKey _key;

    // Every route that names a document, and every route that writes.
    private static readonly (string Method, string Path, object? Body)[] RoutesWithId =
    [
        ("GET", "/documents/d1", null), ("PUT", "/documents/d1", new { title = "Mine now" }),
        ("POST", "/documents/d1/publish", null), ("DELETE", "/documents/d1", null),
    ];
    private static readonly (string Method, string Path, object? Body)[] Writes = [("POST", "/documents", new { title = "Team notes" }), .. RoutesWithId[1..]];

    public ApiTests()
    {
        _client = _factory.CreateClient();
        _key = _factory.Services.GetRequiredService<TokenKey>();
    }

    public void Dispose() => _factory.Dispose();

    private string Token(string name, string scope = Tokens.FullAccess) => Tokens.Sign(_key, Demo.Users[name], scope);

    private Task<HttpResponseMessage> Call(string method, string path, string? bearer = null, object? body = null)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (bearer is not null) request.Headers.Authorization = new("Bearer", bearer);
        if (body is not null) request.Content = JsonContent.Create(body);
        return _client.SendAsync(request);
    }

    private Task<HttpResponseMessage> As(string name, string method, string path, object? body = null) =>
        Call(method, path, Token(name), body);

    private static async Task<string[]> Ids(HttpResponseMessage res)
    {
        using var json = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("documents").EnumerateArray().Select(d => d.GetProperty("id").GetString()!).ToArray();
    }

    private static Task<Document?> Doc(HttpResponseMessage res) => res.Content.ReadFromJsonAsync<Document>();

    [Fact]
    public async Task A_request_without_a_valid_token_is_401()
    {
        foreach (var (method, path, body) in new[] { ("GET", "/documents", (object?)null) }.Concat(Writes))
        {
            var res = await Call(method, path, null, body);
            Assert.True(res.StatusCode == HttpStatusCode.Unauthorized, $"{method} {path}");
            Assert.Equal("Bearer", res.Headers.WwwAuthenticate.ToString());
            Assert.Equal("""{"error":"Missing or invalid token."}""", await res.Content.ReadAsStringAsync());
        }
        var otherKey = Tokens.Sign(TokenKey.Random(), Demo.Users["ada"]);
        var expired = Tokens.Sign(_key, Demo.Users["ada"], expires: DateTime.UtcNow.AddMinutes(-1)); // no clock skew allowed
        foreach (var bearer in new[] { "not-a-token", otherKey, expired })
        {
            var res = await Call("GET", "/documents", bearer);
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
            Assert.Equal("Bearer error=\"invalid_token\"", res.Headers.WwwAuthenticate.ToString());
            Assert.Equal("""{"error":"Missing or invalid token."}""", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task A_signed_token_still_needs_this_audience_an_expiry_and_every_claim_the_rules_read()
    {
        // SetDefaultTimesOnTokenCreation = false: the handler adds no exp, iat or nbf of its own.
        string Sign(Dictionary<string, object> claims) => new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false }.CreateToken(
            new SecurityTokenDescriptor { Claims = claims, SigningCredentials = new SigningCredentials(_key.SecurityKey, SecurityAlgorithms.HmacSha256) });
        var ada = Demo.Users["ada"];
        var full = new Dictionary<string, object>
        {
            ["sub"] = ada.Sub, ["tenant"] = ada.Tenant, ["roles"] = ada.Roles, ["department"] = ada.Department, ["scope"] = Tokens.FullAccess,
            ["iss"] = Tokens.Issuer, ["aud"] = Tokens.Audience, ["exp"] = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeSeconds(),
        };
        Dictionary<string, object> Without(string name) => full.Where(c => c.Key != name).ToDictionary();
        Assert.Equal(HttpStatusCode.OK, (await Call("GET", "/documents", Sign(full))).StatusCode); // the complete token works
        foreach (var claims in new[] { new Dictionary<string, object>(full) { ["aud"] = "another-api" }, Without("exp"), Without("tenant"), Without("roles") })
        {
            var res = await Call("GET", "/documents", Sign(claims));
            Assert.True(res.StatusCode == HttpStatusCode.Unauthorized, JsonSerializer.Serialize(claims));
            Assert.Equal("Bearer error=\"invalid_token\"", res.Headers.WwwAuthenticate.ToString());
        }
    }

    [Fact]
    public async Task Each_user_lists_only_the_documents_they_may_read_in_their_own_tenant()
    {
        Assert.Equal(["d2"], await Ids(await As("bo", "GET", "/documents")));
        Assert.Equal(["d1", "d2", "d3"], await Ids(await As("ada", "GET", "/documents")));
        Assert.Equal(["d4"], await Ids(await As("eve", "GET", "/documents")));
    }

    [Fact]
    public async Task Another_tenants_document_is_404_on_every_route_even_for_an_admin_exactly_like_a_missing_one()
    {
        var missing = await As("eve", "GET", "/documents/nope");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        var notFound = await missing.Content.ReadAsStringAsync();
        foreach (var (method, path, body) in RoutesWithId)
        {
            var res = await As("eve", method, path, body); // eve is an admin, but of the south tenant
            Assert.True(res.StatusCode == HttpStatusCode.NotFound, $"{method} {path}");
            Assert.Equal(notFound, await res.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.NotFound, (await As("di", "GET", "/documents/d4")).StatusCode);
        var own = await As("ada", "GET", "/documents/d1");
        Assert.Equal(HttpStatusCode.OK, own.StatusCode); // still there for its own tenant
        Assert.Equal(new Document("d1", "north", "ada", "sales", "Sales plan", "draft"), await Doc(own)); // and unchanged
    }

    [Fact]
    public async Task A_viewer_cannot_see_someone_elses_draft_on_any_route_but_can_read_published_documents()
    {
        foreach (var (method, path, body) in RoutesWithId[..3])
            Assert.True((await As("bo", method, path, body)).StatusCode == HttpStatusCode.NotFound, $"{method} {path}");
        var published = await As("bo", "GET", "/documents/d2");
        Assert.Equal(HttpStatusCode.OK, published.StatusCode);
        Assert.Equal("Price list", (await Doc(published))!.Title);
    }

    [Fact]
    public async Task Only_editors_and_admins_can_create_documents_rbac()
    {
        var viewer = await As("bo", "POST", "/documents", new { title = "Team notes" });
        Assert.Equal(HttpStatusCode.Forbidden, viewer.StatusCode);
        Assert.Equal("""{"error":"You are not allowed to do that."}""", await viewer.Content.ReadAsStringAsync());
        var editor = await As("ada", "POST", "/documents", new { title = "Team notes" });
        Assert.Equal(HttpStatusCode.Created, editor.StatusCode);
        var doc = (await Doc(editor))!;
        Assert.Equal($"/documents/{doc.Id}", editor.Headers.Location?.ToString());
        Assert.Equal(new Document("x", "north", "ada", "sales", "Team notes", "draft"), doc with { Id = "x" });
    }

    [Fact]
    public async Task Tenant_owner_and_status_come_from_the_token_never_from_the_request_body()
    {
        var res = await As("ada", "POST", "/documents", new { title = "Sneaky", tenant = "south", owner = "eve", status = "published" });
        var doc = (await Doc(res))!;
        Assert.Equal(("north", "ada", "draft"), (doc.Tenant, doc.Owner, doc.Status));
        Assert.Equal(HttpStatusCode.NotFound, (await As("eve", "GET", $"/documents/{doc.Id}")).StatusCode);
    }

    [Fact]
    public async Task A_title_is_required_and_it_is_checked_only_after_the_access_checks()
    {
        foreach (var body in new object?[] { null, new { }, new { title = "   " } })
        {
            foreach (var (method, path) in new[] { ("POST", "/documents"), ("PUT", "/documents/d1") })
            {
                var res = await As("ada", method, path, body);
                Assert.True(res.StatusCode == HttpStatusCode.BadRequest, $"{method} {path} {JsonSerializer.Serialize(body)}");
                Assert.Equal("""{"error":"Enter a title."}""", await res.Content.ReadAsStringAsync());
            }
        }
        Assert.Equal(HttpStatusCode.NotFound, (await As("bo", "PUT", "/documents/d1", new { })).StatusCode); // a draft bo cannot see
        Assert.Equal(HttpStatusCode.NotFound, (await As("eve", "PUT", "/documents/d1", new { })).StatusCode); // another tenant's
    }

    [Fact]
    public async Task Only_the_owner_or_an_admin_can_update_a_document()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await As("cy", "PUT", "/documents/d1", new { title = "Mine now" })).StatusCode); // can read it, not the owner
        Assert.Equal(HttpStatusCode.Forbidden, (await As("bo", "PUT", "/documents/d2", new { title = "Mine now" })).StatusCode); // can read it, not the owner
        Assert.Equal(HttpStatusCode.NotFound, (await As("bo", "PUT", "/documents/d1", new { title = "Mine now" })).StatusCode); // cannot even read it
        var owner = await As("ada", "PUT", "/documents/d1", new { title = "Sales plan v2" });
        Assert.Equal(HttpStatusCode.OK, owner.StatusCode);
        Assert.Equal("Sales plan v2", (await Doc(owner))!.Title);
        Assert.Equal(HttpStatusCode.OK, (await As("di", "PUT", "/documents/d1", new { title = "Sales plan v3" })).StatusCode);
    }

    [Fact]
    public async Task Editors_may_publish_only_in_their_own_department_abac()
    {
        var otherDepartment = await As("cy", "POST", "/documents/d1/publish");
        Assert.Equal(HttpStatusCode.Forbidden, otherDepartment.StatusCode);
        Assert.Equal("""{"error":"You are not allowed to do that."}""", await otherDepartment.Content.ReadAsStringAsync());
        var sameDepartment = await As("ada", "POST", "/documents/d1/publish");
        Assert.Equal(HttpStatusCode.OK, sameDepartment.StatusCode);
        Assert.Equal("published", (await Doc(sameDepartment))!.Status);
        Assert.Equal(HttpStatusCode.OK, (await As("di", "POST", "/documents/d3/publish")).StatusCode); // an admin
    }

    [Fact]
    public async Task A_read_only_token_cannot_write_even_for_an_editor_scopes()
    {
        var readOnly = Token("ada", "documents:read");
        Assert.Equal(HttpStatusCode.OK, (await Call("GET", "/documents/d1", readOnly)).StatusCode);
        foreach (var (method, path, body) in Writes)
        {
            var res = await Call(method, path, readOnly, body);
            Assert.True(res.StatusCode == HttpStatusCode.Forbidden, $"{method} {path}");
            Assert.Equal("Bearer error=\"insufficient_scope\", scope=\"documents:write\"", res.Headers.WwwAuthenticate.ToString());
            Assert.Equal("""{"error":"This token lacks the documents:write scope."}""", await res.Content.ReadAsStringAsync());
        }
        var writeOnly = await Call("GET", "/documents", Token("ada", "documents:write"));
        Assert.Equal(HttpStatusCode.Forbidden, writeOnly.StatusCode);
        Assert.Equal("Bearer error=\"insufficient_scope\", scope=\"documents:read\"", writeOnly.Headers.WwwAuthenticate.ToString());
    }

    [Fact]
    public async Task Only_admins_can_delete_and_only_in_their_own_tenant()
    {
        // The role check runs before the lookup and gives the same answer for every id, so it reveals nothing.
        foreach (var id in new[] { "d1", "d4", "nope" })
        {
            var res = await As("ada", "DELETE", $"/documents/{id}"); // ada owns d1, but is not an admin
            Assert.True(res.StatusCode == HttpStatusCode.Forbidden, id);
            Assert.Equal("""{"error":"You are not allowed to do that."}""", await res.Content.ReadAsStringAsync());
        }
        Assert.Equal(HttpStatusCode.NoContent, (await As("di", "DELETE", "/documents/d1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await As("ada", "GET", "/documents/d1")).StatusCode);
    }
}
