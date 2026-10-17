using AgentInformation.Application.Abstractions;
using AgentInformation.Domain.Entities;
using AgentInformation.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AgentInformation.Infrastructure.Repositories;

public sealed class AgentRepository(AppDbContext context) : IAgentRepository
{
    // Read-only queries: AsNoTracking skips change tracking, which is faster and uses less memory.
    public async Task<IReadOnlyList<Agent>> GetAllAsync(CancellationToken cancellationToken) =>
        await context.Agents
            .AsNoTracking()
            .OrderBy(a => a.AgentNumber)
            .ToListAsync(cancellationToken);

    public Task<Agent?> GetByNumberAsync(string agentNumber, CancellationToken cancellationToken) =>
        context.Agents
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.AgentNumber == agentNumber, cancellationToken);
}
