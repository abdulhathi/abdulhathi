using AgentInformation.Domain.Entities;
using AgentInformation.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AgentInformation.Infrastructure.Persistence.Configurations;

/// <summary>Table mapping lives here, not as attributes on the entity, so the domain stays free of EF Core.</summary>
public sealed class AgentConfiguration : IEntityTypeConfiguration<Agent>
{
    public void Configure(EntityTypeBuilder<Agent> builder)
    {
        builder.ToTable("Agents");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.AgentNumber).IsRequired().HasMaxLength(20);
        builder.HasIndex(a => a.AgentNumber).IsUnique();
        builder.Property(a => a.Role).HasConversion<string>().HasMaxLength(20);
        builder.Property(a => a.Permissions).HasConversion<int>();

        // Store UTC and mark it as UTC when reading back, so the API returns "2026-10-01T15:30:00Z", not a local-looking time.
        builder.Property(a => a.LastContactedAtUtc).HasConversion(
            v => v,
            v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);

        // Demo data so the API returns something on first run.
        builder.HasData(
            new Agent
            {
                Id = 1,
                AgentNumber = "AG-1001",
                LastContactedAtUtc = new DateTime(2026, 10, 1, 15, 30, 0, DateTimeKind.Utc),
                Role = AgentRole.Administrator,
                Permissions = AgentPermission.Read | AgentPermission.Create | AgentPermission.Update | AgentPermission.Delete | AgentPermission.Approve,
            },
            new Agent
            {
                Id = 2,
                AgentNumber = "AG-1002",
                LastContactedAtUtc = new DateTime(2026, 10, 9, 9, 0, 0, DateTimeKind.Utc),
                Role = AgentRole.Supervisor,
                Permissions = AgentPermission.Read | AgentPermission.Update | AgentPermission.Approve,
            },
            new Agent
            {
                Id = 3,
                AgentNumber = "AG-1003",
                LastContactedAtUtc = null,
                Role = AgentRole.Agent,
                Permissions = AgentPermission.Read | AgentPermission.Create,
            });
    }
}
