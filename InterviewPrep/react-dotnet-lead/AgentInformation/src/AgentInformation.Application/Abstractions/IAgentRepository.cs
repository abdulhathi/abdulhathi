using AgentInformation.Domain.Entities;

namespace AgentInformation.Application.Abstractions;

/// <summary>
/// Data access the application needs. Defined here, implemented in Infrastructure, so the
/// application layer never depends on EF Core and can be unit-tested with a fake.
/// </summary>
public interface IAgentRepository
{
    Task<IReadOnlyList<Agent>> GetAllAsync(CancellationToken cancellationToken);

    Task<Agent?> GetByNumberAsync(string agentNumber, CancellationToken cancellationToken);
}
