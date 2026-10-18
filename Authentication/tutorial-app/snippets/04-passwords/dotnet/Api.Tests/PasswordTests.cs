using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

public class PasswordTests
{
    // Tests use a cheap iteration count so they run fast; the app uses 210,000.
    private static PasswordHasher<User> Hasher(int iterations) =>
        new(Options.Create(new PasswordHasherOptions { IterationCount = iterations }));

    [Fact]
    public void A_hash_verifies_the_right_password_and_rejects_a_wrong_one()
    {
        var hasher = Hasher(1_000);
        var user = new User("ada@example.com", "");
        var stored = hasher.HashPassword(user, "correct horse battery");
        Assert.Equal(PasswordVerificationResult.Success, hasher.VerifyHashedPassword(user, stored, "correct horse battery"));
        Assert.Equal(PasswordVerificationResult.Failed, hasher.VerifyHashedPassword(user, stored, "correct horse batterz"));
    }

    [Fact]
    public void The_same_password_hashes_differently_every_time()
    {
        var hasher = Hasher(1_000);
        var user = new User("ada@example.com", "");
        Assert.NotEqual(hasher.HashPassword(user, "correct horse battery"), hasher.HashPassword(user, "correct horse battery"));
    }

    [Fact]
    public void Hashes_made_with_fewer_iterations_ask_to_be_rehashed()
    {
        var user = new User("ada@example.com", "");
        var old = Hasher(500).HashPassword(user, "correct horse battery");
        Assert.Equal(PasswordVerificationResult.SuccessRehashNeeded, Hasher(1_000).VerifyHashedPassword(user, old, "correct horse battery"));
    }

    [Fact]
    public void The_password_policy_checks_length_and_common_passwords_only()
    {
        Assert.Equal("Use at least 12 characters.", PasswordPolicy.Problem("short"));
        Assert.Equal("That password is too common. Choose another.", PasswordPolicy.Problem("Password1234"));
        Assert.Null(PasswordPolicy.Problem("all lowercase words are fine"));
    }
}
