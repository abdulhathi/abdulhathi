using System.Buffers.Text;
using System.Text.Json;

public class RefreshStoreTests
{
    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-10-17T12:00:00Z");

    [Fact]
    public void Refresh_tokens_are_256_random_bits_and_only_their_sha256_hash_is_stored()
    {
        var store = new RefreshTokenStore(new ManualClock(Start));
        var token = store.Issue("u_1001").Token;
        Assert.Equal(32, Base64Url.DecodeFromChars(token).Length);
        Assert.NotEqual(token, store.Issue("u_1001").Token);
        Assert.Equal(RefreshTokenStore.Hash(token), store.Tokens.Keys.First());
        Assert.DoesNotContain(token, JsonSerializer.Serialize(store.Tokens)); // the token itself is never stored
    }

    [Fact]
    public void A_rotated_token_stays_in_its_family_and_never_outlives_it()
    {
        var clock = new ManualClock(Start);
        var store = new RefreshTokenStore(clock);
        var current = store.Issue("u_1001");
        Assert.Equal(Start + RefreshTokenStore.RefreshTtl, current.ExpiresAt);
        var familyId = store.Families.Keys.Single();
        for (var day = 6; day <= 24; day += 6)
        {
            clock.Now = Start.AddDays(day);
            var rotated = Assert.IsType<Rotated>(store.Rotate(current.Token));
            Assert.Equal(familyId, store.Tokens[RefreshTokenStore.Hash(rotated.Refresh.Token)].FamilyId);
            current = rotated.Refresh;
        }
        // Day 24 + 7 days would pass the family's 30-day end, so the last token stops there.
        Assert.Equal(Start + RefreshTokenStore.FamilyTtl, current.ExpiresAt);
    }
}
