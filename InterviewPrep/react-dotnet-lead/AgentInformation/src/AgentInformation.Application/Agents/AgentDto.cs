namespace AgentInformation.Application.Agents;

/// <summary>What the API returns. A separate contract, so the database shape can change without breaking clients.</summary>
public sealed record AgentDto(
    string AgentNumber,
    bool IsContacted,
    DateTime? LastContactedAtUtc,
    string Role,
    IReadOnlyList<string> Permissions);
