using System.Buffers.Text;

public class TokenTests
{
    [Fact]
    public void Session_keys_are_256_random_bits()
    {
        var a = MemoryTicketStore.NewKey();
        Assert.Matches("^[A-Za-z0-9_-]{43}$", a);
        Assert.Equal(32, Base64Url.DecodeFromChars(a).Length);
        Assert.NotEqual(MemoryTicketStore.NewKey(), a);
    }
}
