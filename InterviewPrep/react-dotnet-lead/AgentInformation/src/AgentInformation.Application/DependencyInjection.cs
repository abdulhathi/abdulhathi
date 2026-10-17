using AgentInformation.Application.Agents;
using Microsoft.Extensions.DependencyInjection;

namespace AgentInformation.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAgentService, AgentService>();
        return services;
    }
}
