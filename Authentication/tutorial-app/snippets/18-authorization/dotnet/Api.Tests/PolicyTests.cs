using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

public class PolicyTests
{
    // The real IAuthorizationService with only the document handler: no web server needed.
    private static readonly IAuthorizationService Authz = new ServiceCollection()
        .AddLogging()
        .AddAuthorization()
        .AddSingleton<IAuthorizationHandler, DocumentAuthorizationHandler>()
        .BuildServiceProvider()
        .GetRequiredService<IAuthorizationService>();

    private static ClaimsPrincipal User(string name)
    {
        var u = Demo.Users[name];
        var claims = new List<Claim> { new("sub", u.Sub), new("tenant", u.Tenant), new("department", u.Department), new("scope", Tokens.FullAccess) };
        claims.AddRange(u.Roles.Select(r => new Claim("roles", r)));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, "test", "sub", "roles"));
    }

    private static bool Can(string name, OperationAuthorizationRequirement operation, string id) =>
        Authz.AuthorizeAsync(User(name), Demo.Documents.Single(d => d.Id == id), operation).GetAwaiter().GetResult().Succeeded;

    [Fact]
    public void The_read_rule_published_for_everyone_in_the_tenant_drafts_for_the_owner_editors_and_admins()
    {
        Assert.True(Can("bo", DocumentOperations.Read, "d2")); // published
        Assert.False(Can("bo", DocumentOperations.Read, "d1")); // a viewer and someone else's draft
        Assert.True(Can("ada", DocumentOperations.Read, "d1")); // the owner
        Assert.True(Can("cy", DocumentOperations.Read, "d1")); // an editor
        Assert.True(Can("di", DocumentOperations.Read, "d1")); // an admin
    }

    [Fact]
    public void The_publish_rule_needs_an_editor_in_the_documents_department_or_an_admin()
    {
        Assert.True(Can("ada", DocumentOperations.Publish, "d1")); // sales editor, sales document
        Assert.False(Can("cy", DocumentOperations.Publish, "d1")); // support editor, sales document
        Assert.False(Can("bo", DocumentOperations.Publish, "d1")); // a viewer, even in sales
        Assert.True(Can("di", DocumentOperations.Publish, "d3")); // an admin
    }

    [Fact]
    public void Update_is_for_the_owner_or_an_admin_and_delete_for_admins_only()
    {
        Assert.True(Can("ada", DocumentOperations.Update, "d1")); // the owner
        Assert.False(Can("cy", DocumentOperations.Update, "d1")); // an editor, but not the owner
        Assert.True(Can("di", DocumentOperations.Update, "d1")); // an admin
        Assert.False(Can("ada", DocumentOperations.Delete, "d1")); // the owner, but not an admin
        Assert.True(Can("di", DocumentOperations.Delete, "d1")); // an admin
    }

    [Fact]
    public void Another_tenant_gets_nothing_not_even_an_admin()
    {
        foreach (var op in new[] { DocumentOperations.Read, DocumentOperations.Update, DocumentOperations.Publish, DocumentOperations.Delete })
        {
            Assert.False(Can("eve", op, "d1"), op.Name);
            Assert.False(Can("di", op, "d4"), op.Name);
        }
    }
}
