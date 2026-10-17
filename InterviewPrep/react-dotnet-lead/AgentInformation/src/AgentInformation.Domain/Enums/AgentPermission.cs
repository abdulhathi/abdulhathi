namespace AgentInformation.Domain.Enums;

/// <summary>Permissions combine as bit flags, so one column stores any set of them.</summary>
[Flags]
public enum AgentPermission
{
    None = 0,
    Read = 1,
    Create = 2,
    Update = 4,
    Delete = 8,
    Approve = 16,
}
