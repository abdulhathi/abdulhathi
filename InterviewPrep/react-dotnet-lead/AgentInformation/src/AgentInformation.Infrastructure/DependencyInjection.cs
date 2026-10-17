using AgentInformation.Application.Abstractions;
using AgentInformation.Infrastructure.Persistence;
using AgentInformation.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AgentInformation.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("AgentDb")
            ?? throw new InvalidOperationException("Connection string 'AgentDb' is not configured.");

        // SQLite keeps the demo self-contained; in production this would be UseSqlServer or UseNpgsql.
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));
        services.AddScoped<IAgentRepository, AgentRepository>();
        return services;
    }
}
