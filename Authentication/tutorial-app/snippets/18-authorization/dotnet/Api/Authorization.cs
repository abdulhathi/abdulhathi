using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Authorization.Policy;

public static class Errors
{
    public static readonly object Unauthorized = new { error = "Missing or invalid token." };
    public static readonly object Forbidden = new { error = "You are not allowed to do that." };
    public static readonly object NotFound = new { error = "Document not found." };
}

/// <summary>A policy requirement: the token must carry this scope, whoever the user is.</summary>
public sealed record ScopeRequirement(string Scope) : IAuthorizationRequirement;

public sealed class ScopeHandler : AuthorizationHandler<ScopeRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, ScopeRequirement requirement)
    {
        if (context.User.HasScope(requirement.Scope)) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

/// <summary>The operations on one document, checked with IAuthorizationService.AuthorizeAsync(user, document, operation).</summary>
public static class DocumentOperations
{
    public static readonly OperationAuthorizationRequirement Read = new() { Name = "read" };
    public static readonly OperationAuthorizationRequirement Update = new() { Name = "update" };
    public static readonly OperationAuthorizationRequirement Publish = new() { Name = "publish" };
    public static readonly OperationAuthorizationRequirement Delete = new() { Name = "delete" };
}

/// <summary>Resource-based authorization: every rule about documents in one place.</summary>
public sealed class DocumentAuthorizationHandler : AuthorizationHandler<OperationAuthorizationRequirement, Document>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, OperationAuthorizationRequirement operation, Document doc)
    {
        var user = context.User;
        // Tenant isolation comes first and has no exceptions, not even for admins.
        if (doc.Tenant != user.Tenant()) return Task.CompletedTask;
        var admin = user.IsInRole("admin");
        var editor = user.IsInRole("editor");
        var owner = doc.Owner == user.Id();
        var allowed = operation.Name switch
        {
            // published documents are for everyone in the tenant; drafts for their owner, editors and admins
            "read" => doc.Status == "published" || owner || editor || admin,
            // ownership: only the author changes the text (or an admin)
            "update" => owner || admin,
            // an attribute rule (ABAC): editors publish only in their own department
            "publish" => admin || (editor && doc.Department == user.Department()),
            // a role rule (RBAC)
            "delete" => admin,
            _ => false,
        };
        if (allowed) context.Succeed(operation);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Loads {id} from the caller's own tenant and checks the operation.
/// 404 when the caller may not even see the document (another tenant's, or someone else's draft), so its existence
/// is not revealed; 403 when they can see it but may not do this to it.
/// </summary>
public sealed class DocumentAccess(DocumentStore store, IAuthorizationService authz)
{
    public async Task<(Document? Doc, IResult? Error)> LoadAsync(ClaimsPrincipal user, string id, OperationAuthorizationRequirement operation)
    {
        var doc = store.Find(user.Tenant(), id);
        if (doc is null || !(await authz.AuthorizeAsync(user, doc, DocumentOperations.Read)).Succeeded)
            return (null, Results.NotFound(Errors.NotFound));
        if (!(await authz.AuthorizeAsync(user, doc, operation)).Succeeded)
            return (null, Results.Json(Errors.Forbidden, statusCode: 403));
        return (doc, null);
    }
}

/// <summary>
/// Writes the same JSON bodies and headers as the Node.js and Python projects when a policy fails: 401 when there is
/// no valid token (with error="invalid_token" if one was sent, RFC 6750), 403 with insufficient_scope when a scope is
/// missing, else 403.
/// </summary>
public sealed class JsonAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        if (result.Succeeded)
        {
            await next(context);
            return;
        }
        var response = context.Response;
        if (result.Challenged)
        {
            // The JwtBearer result for this request: a failure means a token came and was refused; none means no token.
            var refused = (await context.AuthenticateAsync()).Failure is not null;
            response.StatusCode = StatusCodes.Status401Unauthorized;
            response.Headers.WWWAuthenticate = refused ? "Bearer error=\"invalid_token\"" : "Bearer";
            await response.WriteAsJsonAsync(Errors.Unauthorized);
            return;
        }
        response.StatusCode = StatusCodes.Status403Forbidden;
        if (result.AuthorizationFailure?.FailedRequirements.OfType<ScopeRequirement>().FirstOrDefault() is { } missing)
        {
            response.Headers.WWWAuthenticate = $"Bearer error=\"insufficient_scope\", scope=\"{missing.Scope}\"";
            await response.WriteAsJsonAsync(new { error = $"This token lacks the {missing.Scope} scope." });
            return;
        }
        await response.WriteAsJsonAsync(Errors.Forbidden);
    }
}
