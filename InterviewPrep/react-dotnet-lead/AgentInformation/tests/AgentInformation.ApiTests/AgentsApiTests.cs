using System.Net;
using System.Net.Http.Json;
using AgentInformation.Application.Agents;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;

namespace AgentInformation.ApiTests;

/// <summary>Starts the real API in memory, with a throwaway SQLite file, and calls it over HTTP.</summary>
public sealed class AgentsApiTests : IDisposable
{
    private readonly string _databasePath = Path.Combine(Path.GetTempPath(), $"agents-test-{Guid.NewGuid():N}.db");
    private readonly WebApplicationFactory<Program> _factory;

    public AgentsApiTests()
    {
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.UseSetting("ConnectionStrings:AgentDb", $"Data Source={_databasePath}"));
    }

    [Fact]
    public async Task Get_agents_returns_200_with_the_seeded_agents_in_order()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/agents");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var agents = await response.Content.ReadFromJsonAsync<List<AgentDto>>();
        Assert.NotNull(agents);
        Assert.Equal(["AG-1001", "AG-1002", "AG-1003"], agents.Select(a => a.AgentNumber));
        Assert.Equal(["Read", "Update", "Approve"], agents[1].Permissions);
        Assert.Equal(DateTimeKind.Utc, agents[0].LastContactedAtUtc?.Kind);
    }

    [Fact]
    public async Task Get_one_agent_returns_its_details()
    {
        var client = _factory.CreateClient();

        var agent = await client.GetFromJsonAsync<AgentDto>("/api/v1/agents/AG-1003");

        Assert.NotNull(agent);
        Assert.Equal("Agent", agent.Role);
        Assert.False(agent.IsContacted);
    }

    [Fact]
    public async Task Get_unknown_agent_returns_404_problem_details()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/v1/agents/AG-9999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    public void Dispose()
    {
        _factory.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_databasePath);
    }
}
