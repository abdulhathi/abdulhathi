using AgentInformation.Application.Abstractions;

namespace AgentInformation.Application.Agents;

public sealed class AgentService(IAgentRepository agents) : IAgentService
{
    public async Task<IReadOnlyList<AgentDto>> GetAgentsAsync(CancellationToken cancellationToken)
    {
        var all = await agents.GetAllAsync(cancellationToken);
        return all.Select(a => a.ToDto()).ToList();
    }

    public async Task<AgentDto?> GetAgentAsync(string agentNumber, CancellationToken cancellationToken)
    {
        var agent = await agents.GetByNumberAsync(agentNumber, cancellationToken);
        return agent?.ToDto();
    }
}
