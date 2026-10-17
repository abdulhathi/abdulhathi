using AgentInformation.Domain.Entities;
using AgentInformation.Domain.Enums;

namespace AgentInformation.Application.Agents;

public static class AgentMappings
{
    public static AgentDto ToDto(this Agent agent) =>
        new(
            agent.AgentNumber,
            agent.IsContacted,
            agent.LastContactedAtUtc,
            agent.Role.ToString(),
            Enum.GetValues<AgentPermission>()
                .Where(p => p != AgentPermission.None && agent.Permissions.HasFlag(p))
                .Select(p => p.ToString())
                .ToList());
}
