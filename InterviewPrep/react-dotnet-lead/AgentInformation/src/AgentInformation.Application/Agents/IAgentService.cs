namespace AgentInformation.Application.Agents;

public interface IAgentService
{
    Task<IReadOnlyList<AgentDto>> GetAgentsAsync(CancellationToken cancellationToken);

    Task<AgentDto?> GetAgentAsync(string agentNumber, CancellationToken cancellationToken);
}
