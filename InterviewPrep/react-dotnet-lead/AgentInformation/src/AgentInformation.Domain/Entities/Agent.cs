using AgentInformation.Domain.Enums;

namespace AgentInformation.Domain.Entities;

/// <summary>An agent and what they are allowed to do. Plain C#: no EF Core or ASP.NET Core references.</summary>
public class Agent
{
    public int Id { get; set; }

    /// <summary>The business identifier ("Agent Num"), unique per agent.</summary>
    public string AgentNumber { get; set; } = string.Empty;

    /// <summary>When the agent was last contacted, in UTC; null means never contacted.</summary>
    public DateTime? LastContactedAtUtc { get; set; }

    public AgentRole Role { get; set; }

    public AgentPermission Permissions { get; set; }

    public bool IsContacted => LastContactedAtUtc is not null;

    public bool Can(AgentPermission permission) => Permissions.HasFlag(permission);
}
