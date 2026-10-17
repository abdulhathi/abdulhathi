using AgentInformation.Application.Abstractions;
using AgentInformation.Application.Agents;
using AgentInformation.Domain.Entities;
using AgentInformation.Domain.Enums;

namespace AgentInformation.UnitTests;

public class AgentServiceTests
{
    private sealed class FakeAgentRepository(params Agent[] agents) : IAgentRepository
    {
        public Task<IReadOnlyList<Agent>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Agent>>(agents);

        public Task<Agent?> GetByNumberAsync(string agentNumber, CancellationToken cancellationToken) =>
            Task.FromResult(agents.FirstOrDefault(a => a.AgentNumber == agentNumber));
    }

    private static readonly Agent Supervisor = new()
    {
        Id = 1,
        AgentNumber = "AG-1",
        LastContactedAtUtc = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc),
        Role = AgentRole.Supervisor,
        Permissions = AgentPermission.Read | AgentPermission.Approve,
    };

    private static readonly Agent NewAgent = new()
    {
        Id = 2,
        AgentNumber = "AG-2",
        Role = AgentRole.Agent,
        Permissions = AgentPermission.None,
    };

    [Fact]
    public async Task GetAgentsAsync_maps_every_agent_to_a_dto()
    {
        var service = new AgentService(new FakeAgentRepository(Supervisor, NewAgent));

        var agents = await service.GetAgentsAsync(CancellationToken.None);

        Assert.Equal(2, agents.Count);
        var first = agents[0];
        Assert.Equal("AG-1", first.AgentNumber);
        Assert.True(first.IsContacted);
        Assert.Equal("Supervisor", first.Role);
        Assert.Equal(["Read", "Approve"], first.Permissions);
    }

    [Fact]
    public async Task An_agent_never_contacted_has_no_contact_date_and_no_permissions()
    {
        var service = new AgentService(new FakeAgentRepository(NewAgent));

        var agent = await service.GetAgentAsync("AG-2", CancellationToken.None);

        Assert.NotNull(agent);
        Assert.False(agent.IsContacted);
        Assert.Null(agent.LastContactedAtUtc);
        Assert.Empty(agent.Permissions);
    }

    [Fact]
    public async Task GetAgentAsync_returns_null_for_an_unknown_number()
    {
        var service = new AgentService(new FakeAgentRepository(Supervisor));

        Assert.Null(await service.GetAgentAsync("AG-404", CancellationToken.None));
    }

    [Fact]
    public void Can_checks_a_single_permission_flag()
    {
        Assert.True(Supervisor.Can(AgentPermission.Approve));
        Assert.False(Supervisor.Can(AgentPermission.Delete));
    }
}
