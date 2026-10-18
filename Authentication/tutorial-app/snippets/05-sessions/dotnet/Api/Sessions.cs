using System.Globalization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

public static class Sessions
{
    public static readonly TimeSpan IdleTimeout = TimeSpan.FromMinutes(30); // signed out after 30 minutes without a request
    public static readonly TimeSpan AbsoluteTimeout = TimeSpan.FromHours(8); // and 8 hours after sign-in, however active
    public const string SignedInAt = "signedInAt";

    /// <summary>
    /// Sliding expiration gives an idle timeout but no upper limit, and it resets the ticket's IssuedUtc on every
    /// renewal. So the sign-in time is kept in the ticket's own properties, and checked on every request.
    /// </summary>
    public static async Task EnforceAbsoluteTimeout(CookieValidatePrincipalContext context)
    {
        var now = (context.Options.TimeProvider ?? TimeProvider.System).GetUtcNow();
        if (context.Properties.Items.TryGetValue(SignedInAt, out var value) && value is not null
            && now - DateTimeOffset.Parse(value, CultureInfo.InvariantCulture) <= AbsoluteTimeout) return;
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme); // removes the server-side session
    }
}
