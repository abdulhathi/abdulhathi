/// <summary>NIST SP 800-63B style: long enough, not absurdly long, not a known-common password. No composition rules.</summary>
public static class PasswordPolicy
{
    private static readonly HashSet<string> Common = ["password1234", "123456789012", "qwertyuiop12", "letmein12345", "iloveyou1234"];

    public static string? Problem(string password) =>
        password.Length < 12 ? "Use at least 12 characters."
        : password.Length > 128 ? "Use at most 128 characters."
        : Common.Contains(password.ToLowerInvariant()) ? "That password is too common. Choose another."
        : null;
}
