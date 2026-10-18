using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Authorization.Policy;

/// <summary>
/// Answers 403 with the scope the key is missing, instead of an empty body. A missing or broken key is not
/// "forbidden" but "challenged", and goes on to ApiKeyHandler.HandleChallengeAsync through the default handler.
/// </summary>
public sealed class ScopeFailureHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        if (result.Forbidden)
        {
            var scope = result.AuthorizationFailure?.FailedRequirements
                .OfType<ClaimsAuthorizationRequirement>()
                .SelectMany(r => r.AllowedValues ?? [])
                .FirstOrDefault();
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.Headers.WWWAuthenticate = $"Bearer error=\"insufficient_scope\", scope=\"{scope}\"";
            await context.Response.WriteAsJsonAsync(new { error = $"This key lacks the {scope} scope." });
            return;
        }
        await _default.HandleAsync(next, context, policy, result);
    }
}
