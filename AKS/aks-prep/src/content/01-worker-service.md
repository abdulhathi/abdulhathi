# Build the Worker Service

A **Worker Service** is .NET's template for long-running background processes: queue consumers, schedulers, file watchers, ETL jobs. It's a console app running the generic host — the same DI, config, and logging you know from ASP.NET Core, minus the HTTP stack.

## Step 1 — Scaffold from the template

```bash
cd ~/Developer/Azure/aks-worker-practice
dotnet new worker -n OrderProcessor.Worker -o src/OrderProcessor.Worker
```

The template gives you two interesting files:

- **`Program.cs`** — builds the generic host and registers `Worker` as a hosted service
- **`Worker.cs`** — a class extending `BackgroundService` that logs once per second

Run it once to see the shape, then we'll replace both.

## The lifecycle you're about to rely on

`BackgroundService.ExecuteAsync(CancellationToken stoppingToken)` runs for the whole life of the process. The `stoppingToken` is cancelled when the host shuts down — and the host shuts down when it receives:

- **SIGINT** — you pressing Ctrl+C locally
- **SIGTERM** — what **Kubernetes sends a pod** during rolling updates and scale-downs

Both are handled identically by the .NET host. This is the single most important fact in this module: *the Ctrl+C behavior you test on your laptop is exactly the rolling-update behavior you get on AKS.*

## Step 2 — Strongly-typed options

Create `src/OrderProcessor.Worker/WorkerOptions.cs`:

```csharp
namespace OrderProcessor.Worker;

/// Bound from the "Worker" section of configuration.
/// In Kubernetes these values are overridden by environment variables
/// from the ConfigMap, e.g. Worker__PollIntervalSeconds=5.
public class WorkerOptions
{
    public const string SectionName = "Worker";

    /// How long to wait between polling for new orders.
    public int PollIntervalSeconds { get; set; } = 10;

    /// Maximum number of orders to pick up per poll.
    public int BatchSize { get; set; } = 5;

    /// Simulated time to process a single order.
    public int ProcessingTimeMs { get; set; } = 500;
}
```

This class is the bridge that later lets a Kubernetes ConfigMap tune the app **without rebuilding the image**.

## Step 3 — The worker

Replace `src/OrderProcessor.Worker/Worker.cs`:

```csharp
using Microsoft.Extensions.Options;

namespace OrderProcessor.Worker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly WorkerOptions _options;
    private long _totalProcessed;

    public Worker(ILogger<Worker> logger, IOptions<WorkerOptions> options)
    {
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Order processor started. PollInterval={PollIntervalSeconds}s BatchSize={BatchSize} MachineName={MachineName}",
            _options.PollIntervalSeconds, _options.BatchSize, Environment.MachineName);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(_options.PollIntervalSeconds));

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await ProcessBatchAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown — fall through to the log below.
        }

        _logger.LogInformation(
            "Shutdown requested. Draining complete. TotalProcessed={TotalProcessed}", _totalProcessed);
    }

    private async Task ProcessBatchAsync(CancellationToken stoppingToken)
    {
        var batchSize = Random.Shared.Next(0, _options.BatchSize + 1);

        if (batchSize == 0)
        {
            _logger.LogInformation("No orders in queue, sleeping for {PollIntervalSeconds}s",
                _options.PollIntervalSeconds);
            return;
        }

        _logger.LogInformation("Received {BatchSize} order(s)", batchSize);

        for (var i = 0; i < batchSize; i++)
        {
            // Deliberately NOT passing stoppingToken here: once an order is
            // picked up we finish it even during shutdown, so work is never
            // abandoned halfway.
            var order = new Order(
                Id: Guid.NewGuid(),
                Amount: Math.Round((decimal)(Random.Shared.NextDouble() * 500), 2));

            await Task.Delay(_options.ProcessingTimeMs, CancellationToken.None);

            _totalProcessed++;
            _logger.LogInformation(
                "Processed order {OrderId} for {Amount:C} (total processed: {TotalProcessed})",
                order.Id, order.Amount, _totalProcessed);

            if (stoppingToken.IsCancellationRequested)
            {
                _logger.LogWarning(
                    "Shutdown in progress — stopping after current order, {Remaining} order(s) returned to queue",
                    batchSize - i - 1);
                return;
            }
        }
    }

    private record Order(Guid Id, decimal Amount);
}
```

Read the cancellation handling carefully — it encodes a policy:

> **Batch loop**: checks `stoppingToken` *between* orders and stops early.
> **Single order**: uses `CancellationToken.None` so an order in progress always finishes.
> Net effect: shutdown never abandons work halfway; unfinished orders are "returned to the queue".

## Step 4 — Host setup and settings

Replace `src/OrderProcessor.Worker/Program.cs`:

```csharp
using OrderProcessor.Worker;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.Configure<WorkerOptions>(
    builder.Configuration.GetSection(WorkerOptions.SectionName));
builder.Services.AddHostedService<Worker>();

// Container logs should be single-line and timestamped so `kubectl logs`
// and Azure Monitor can parse them.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ ";
    o.UseUtcTimestamp = true;
});

var host = builder.Build();
host.Run();
```

And add the `Worker` section to `src/OrderProcessor.Worker/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "Worker": {
    "PollIntervalSeconds": 10,
    "BatchSize": 5,
    "ProcessingTimeMs": 500
  }
}
```

## Step 5 — Run it

```bash
cd src/OrderProcessor.Worker
dotnet run
```

You should see batches being received and processed with single-line, UTC-timestamped logs.

## Experiment 1 — Graceful shutdown

**Press Ctrl+C while a batch is mid-processing.** Expected output:

```text
info: Received 3 order(s)
info: Application is shutting down...
info: Processed order 0be4e70b-... for $225.10 (total processed: 3)
warn: Shutdown in progress — stopping after current order, 2 order(s) returned to queue
info: Shutdown requested. Draining complete. TotalProcessed=3
```

The order that was in flight **finished**; the rest were "returned". This exact sequence is what will happen inside a terminating pod in Module 5.

## Experiment 2 — Environment variable overrides

.NET maps `__` (double underscore) in env var names to the `:` config separator, and env vars **override** `appsettings.json`:

```bash
Worker__PollIntervalSeconds=3 Worker__BatchSize=2 dotnet run
```

Confirm the startup log line shows `PollInterval=3s BatchSize=2`. This is the identical mechanism the ConfigMap will use in Module 4 — no code changes needed there.

## Checkpoint

- [ ] Worker runs and processes simulated batches
- [ ] Ctrl+C mid-batch finishes the current order and logs the "returned to queue" warning
- [ ] Env vars override appsettings values
- [ ] Commit: `git add -A && git commit -m "Order processor worker"`
