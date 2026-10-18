using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.Json;
using Fido2NetLib;
using Fido2NetLib.Objects;

var builder = WebApplication.CreateBuilder(args);

// The RP ID is the site's domain; the origin is the exact scheme, host and port the browser shows.
// Browsers allow WebAuthn on http://localhost; everywhere else it needs HTTPS.
var rpId = builder.Configuration["Passkeys:RpId"] ?? "localhost";
var origin = builder.Configuration["Passkeys:Origin"] ?? "http://localhost:3000";
builder.Services.AddFido2(o =>
{
    o.RPID = rpId;
    o.RPName = "Auth Lab";
    o.Origins = new HashSet<string> { origin };
    o.ChallengeSize = 32;
    o.Timeout = 5 * 60 * 1000;
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<PasskeyStore>();
builder.Services.AddSingleton<Challenges>();

var app = builder.Build();
app.UseDefaultFiles(); // the demo page at /
app.UseStaticFiles();

var expired = new { error = "Unknown or expired challenge." };
var failed = new { error = "Passkey sign-in failed." };
var taken = new { error = "That username is already registered." };

// Ceremony 1, registration: create a new account with a passkey.
app.MapPost("/webauthn/register/options", (UsernameBody body, IFido2 fido2, PasskeyStore store, Challenges challenges) =>
{
    var username = (body.Username ?? "").Trim().ToLowerInvariant();
    if (username == "") return Results.BadRequest(new { error = "Enter a username." });
    if (store.FindUserByName(username) is not null) return Results.Conflict(taken);
    var options = fido2.RequestNewCredential(new RequestNewCredentialParams
    {
        User = new Fido2User { Id = RandomNumberGenerator.GetBytes(16), Name = username, DisplayName = username },
        // A passkey: a discoverable credential (stored on the authenticator) unlocked by biometrics or a PIN.
        AuthenticatorSelection = new AuthenticatorSelection
        {
            ResidentKey = ResidentKeyRequirement.Required,
            UserVerification = UserVerificationRequirement.Required,
        },
        AttestationPreference = AttestationConveyancePreference.None,
        // EdDSA, ES256 and RS256: between them, every authenticator in use today.
        PubKeyCredParams = [PubKeyCredParam.Ed25519, PubKeyCredParam.ES256, PubKeyCredParam.RS256],
    });
    challenges.Remember(options.Challenge, options); // the user is saved only once registration succeeds
    return Results.Content(options.ToJson(), "application/json");
});

app.MapPost("/webauthn/register/verify", async (AuthenticatorAttestationRawResponse body, IFido2 fido2, PasskeyStore store, Challenges challenges, CancellationToken ct) =>
{
    if (challenges.Take<CredentialCreateOptions>(ChallengeOf(body.Response?.ClientDataJson)) is not { } options)
        return Results.BadRequest(expired);
    RegisteredPublicKeyCredential credential;
    try
    {
        // Checks the type, challenge, origin, RP ID hash, user presence and verification flags, and the key algorithm.
        credential = await fido2.MakeNewCredentialAsync(new MakeNewCredentialParams
        {
            AttestationResponse = body,
            OriginalOptions = options,
            IsCredentialIdUniqueToUserCallback = (args, _) => Task.FromResult(store.FindCredential(args.CredentialId) is null),
        }, ct);
    }
    catch (Fido2VerificationException)
    {
        return Results.BadRequest(new { error = "Registration failed." });
    }
    if (store.FindUserByName(options.User.Name) is not null) return Results.Conflict(taken);
    var deviceType = credential.IsBackupEligible ? "multiDevice" : "singleDevice";
    store.Add(new PasskeyUser(options.User.Id, options.User.Name), new StoredCredential
    {
        Id = credential.Id,
        UserId = options.User.Id,
        PublicKey = credential.PublicKey,
        Counter = credential.SignCount,
        Transports = credential.Transports ?? [],
        DeviceType = deviceType,
        BackedUp = credential.IsBackedUp,
    });
    var credentialId = Base64Url.EncodeToString(credential.Id);
    return Results.Json(new { username = options.User.Name, credentialId, deviceType, backedUp = credential.IsBackedUp }, statusCode: 201);
});

// Ceremony 2, authentication: no username needed; the browser offers the passkeys it holds for this RP ID.
app.MapPost("/webauthn/login/options", (IFido2 fido2, Challenges challenges) =>
{
    var options = fido2.GetAssertionOptions(new GetAssertionOptionsParams
    {
        AllowedCredentials = [],
        UserVerification = UserVerificationRequirement.Required,
    });
    challenges.Remember(options.Challenge, options);
    return Results.Content(options.ToJson(), "application/json");
});

app.MapPost("/webauthn/login/verify", async (AuthenticatorAssertionRawResponse body, IFido2 fido2, PasskeyStore store, Challenges challenges, CancellationToken ct) =>
{
    if (challenges.Take<AssertionOptions>(ChallengeOf(body.Response?.ClientDataJson)) is not { } options)
        return Results.BadRequest(expired);
    var credential = store.FindCredential(body.Id ?? "");
    // The user handle is the user ID the passkey was made for: it must be the account that owns this credential.
    if (credential is null || body.Response?.UserHandle is not { } userHandle || !credential.UserId.SequenceEqual(userHandle))
        return Results.Json(failed, statusCode: 401);
    try
    {
        // Checks the type, challenge, origin, RP ID hash and flags, then the signature over
        // authenticatorData || SHA-256(clientDataJSON) with the stored public key, and the signature counter
        // (it must go up, unless the stored and the new count are both 0, as synced passkeys report).
        var result = await fido2.MakeAssertionAsync(new MakeAssertionParams
        {
            AssertionResponse = body,
            OriginalOptions = options,
            StoredPublicKey = credential.PublicKey,
            StoredSignatureCounter = credential.Counter,
            IsUserHandleOwnerOfCredentialIdCallback = (args, _) => Task.FromResult(credential.UserId.SequenceEqual(args.UserHandle)),
        }, ct);
        // Backup eligibility (the BE flag, bit 0x08 of the flags byte that follows the 32-byte RP ID hash) is fixed
        // when a credential is made (WebAuthn Level 3, section 7.2): a device-bound passkey that now claims to be
        // synced, or the reverse, is not the credential we registered.
        var backupEligible = (body.Response.AuthenticatorData[32] & 0x08) != 0;
        if (backupEligible != (credential.DeviceType == "multiDevice")) return Results.Json(failed, statusCode: 401);
        credential.Counter = result.SignCount;
        credential.BackedUp = result.IsBackedUp;
    }
    catch (Fido2VerificationException)
    {
        return Results.Json(failed, statusCode: 401);
    }
    // A real app starts a session here (chapter 05) or issues tokens (chapter 08).
    return Results.Ok(new { username = store.FindUser(credential.UserId)!.Username, message = "Signed in." });
});

app.Run();

// The challenge the browser wrote into clientDataJSON: it tells us which ceremony this response answers.
static string ChallengeOf(byte[]? clientDataJson)
{
    try { return JsonDocument.Parse(clientDataJson).RootElement.GetProperty("challenge").GetString() ?? ""; }
    catch (Exception) { return ""; }
}

public record UsernameBody(string? Username);

// Lets the tests start this app in memory with WebApplicationFactory<Program>.
public partial class Program;
