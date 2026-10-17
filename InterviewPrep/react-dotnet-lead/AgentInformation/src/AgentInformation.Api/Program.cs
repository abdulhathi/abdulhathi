using AgentInformation.Application;
using AgentInformation.Infrastructure;
using AgentInformation.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

// Composition root: each layer registers its own services; only the API project knows about all of them.
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

// Demo only: create the SQLite database with its seed data. A real service runs EF Core migrations in the pipeline.
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
}

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Lets the integration tests start the app with WebApplicationFactory<Program>.
public partial class Program;
