using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// The resource server (the API) checks every access token itself: signature, issuer, audience, type, expiry, scope.
/// ASP.NET Core's JwtBearer handler does the token checks; RequireScope adds the scope check.
/// Here it holds the authorization server's public key directly; across a network set options.Authority instead
/// and the handler fetches the keys from the server's metadata and JWKS. It also refuses revoked tokens: in one
/// process it can read the server's list; a separate API would ask the server (token introspection) or receive a
/// deny list.
/// </summary>
public static class ResourceServer
{
    public static void Configure(JwtBearerOptions options, string issuer, SecurityKey key, TimeProvider clock, RevokedTokens revoked)
    {
        options.MapInboundClaims = false; // keep "sub", "scope" and "client_id" as they are in the token
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = issuer,
            ValidAudience = AuthorizationServer.Audience,
            IssuerSigningKey = key,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            ValidTypes = ["at+jwt"],
            // Expiry is checked against the injected clock (the tests move it forward), with no extra skew.
            // (TokenValidationParameters.TimeProvider is not public in IdentityModel 8.19.2, so a validator it is.)
            LifetimeValidator = (_, expires, _, _) => expires > clock.GetUtcNow().UtcDateTime,
        };
        options.Events = new JwtBearerEvents
        {
            // After the signature and claims pass: refuse a token without a jti, or one that has been revoked.
            OnTokenValidated = context =>
            {
                var jti = context.Principal?.FindFirstValue("jti");
                if (jti is null || revoked.Contains(jti)) context.Fail("The token has been revoked.");
                return Task.CompletedTask;
            },
            OnChallenge = async context =>
            {
                context.HandleResponse(); // write our own 401 instead of the default empty one
                // No credentials at all: RFC 6750 says answer with the scheme and no error code.
                var missing = context.AuthenticateFailure is null;
                context.Response.StatusCode = 401;
                context.Response.Headers.WWWAuthenticate = missing ? "Bearer" : "Bearer error=\"invalid_token\"";
                await context.Response.WriteAsJsonAsync(missing
                    ? new { error = "unauthorized", error_description = "A bearer token is required." }
                    : new { error = "invalid_token", error_description = "The access token is invalid or expired." });
            },
        };
    }

    /// <summary>Only requests with a valid access token that carries <paramref name="scope"/> get through.</summary>
    public static RouteHandlerBuilder RequireScope(this RouteHandlerBuilder endpoint, string scope) =>
        endpoint.RequireAuthorization().AddEndpointFilter(async (context, next) =>
        {
            var granted = context.HttpContext.User.FindFirstValue("scope")?.Split(' ') ?? [];
            if (granted.Contains(scope)) return await next(context);
            context.HttpContext.Response.Headers.WWWAuthenticate = $"Bearer error=\"insufficient_scope\", scope=\"{scope}\"";
            return Results.Json(new { error = "insufficient_scope", error_description = $"This call needs the {scope} scope." }, statusCode: 403);
        });
}
