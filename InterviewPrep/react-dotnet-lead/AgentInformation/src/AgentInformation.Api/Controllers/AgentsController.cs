using AgentInformation.Application.Agents;
using Microsoft.AspNetCore.Mvc;

namespace AgentInformation.Api.Controllers;

[ApiController]
[Route("api/v1/agents")]
public sealed class AgentsController(IAgentService agentService) : ControllerBase
{
    // GET api/v1/agents
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<AgentDto>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AgentDto>>> GetAgents(CancellationToken cancellationToken)
    {
        var agents = await agentService.GetAgentsAsync(cancellationToken);
        return Ok(agents);
    }

    // GET api/v1/agents/AG-1001
    [HttpGet("{agentNumber}")]
    [ProducesResponseType<AgentDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AgentDto>> GetAgent(string agentNumber, CancellationToken cancellationToken)
    {
        var agent = await agentService.GetAgentAsync(agentNumber, cancellationToken);
        return agent is null ? NotFound() : Ok(agent);
    }
}
