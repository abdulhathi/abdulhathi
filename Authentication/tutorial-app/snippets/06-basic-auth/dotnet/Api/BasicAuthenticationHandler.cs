using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

/// <summary>
/// HTTP Basic authentication (RFC 7617) as an ASP.NET Core authentication scheme. ASP.NET Core has no built-in Basic
/// handler, so this one reads "Authorization: Basic base64(username:password)", checks the password on every request,
/// and writes the 401 challenge.
/// </summary>
public sealed class BasicAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, UserStore users)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Basic";
    public const string Realm = "Auth Lab";
    public const string Required = "Authentication required.";
    public const string Invalid = "Username or password is incorrect.";
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    // Standard base64 with its padding (RFC 4648): groups of four characters, nothing else. Convert.FromBase64String
    // would quietly skip spaces and line breaks inside the value, so check first.
    private static readonly Regex Base64 = new(@"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?\z");

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // "Basic", one or more spaces, then the base64 (RFC 9110 credentials). The scheme name is case-insensitive.
        // No Basic credentials at all: no result, and the challenge (or another scheme) takes over.
        var value = Request.Headers.Authorization.ToString();
        var space = value.IndexOf(' ');
        var scheme = space < 0 ? value : value[..space];
        if (!scheme.Equals(SchemeName, StringComparison.OrdinalIgnoreCase))
            return Task.FromResult(AuthenticateResult.NoResult());

        var param = space < 0 ? "" : value[(space + 1)..].Trim();
        if (!Base64.IsMatch(param)) return Task.FromResult(AuthenticateResult.Fail(Invalid));
        string decoded;
        try
        {
            decoded = StrictUtf8.GetString(Convert.FromBase64String(param)); // charset="UTF-8": anything else is refused
        }
        catch (DecoderFallbackException)
        {
            return Task.FromResult(AuthenticateResult.Fail(Invalid));
        }
        var colon = decoded.IndexOf(':'); // the first colon: a username cannot contain one, a password can
        if (colon < 0) return Task.FromResult(AuthenticateResult.Fail(Invalid));
        // RFC 7617 asks clients to send Unicode in Normalization Form C; normalizing here too makes both spellings of
        // a letter such as "ë" (one code point, or "e" plus a combining mark) match.
        var username = decoded[..colon].Normalize(NormalizationForm.FormC);
        var password = decoded[(colon + 1)..].Normalize(NormalizationForm.FormC);
        if (!users.Check(username, password)) return Task.FromResult(AuthenticateResult.Fail(Invalid));

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, username)], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    /// <summary>401 with a challenge: browsers show their sign-in dialog, and clients know which scheme to use.</summary>
    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        var result = await HandleAuthenticateOnceSafeAsync();
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        Response.Headers.WWWAuthenticate = $"Basic realm=\"{Realm}\", charset=\"UTF-8\"";
        await Response.WriteAsJsonAsync(new { error = result.Failure?.Message ?? Required });
    }
}
