# React + .NET technical lead interview: model answers

Model answers to the three coding questions from the client interview on 2026-10-14 for **Technical Lead – Full
Stack (React + .NET)**. For each question: what was asked, a review of the answer given in
the interview, a corrected answer, what to say while writing it, and the follow-up questions a technical lead
should expect.

Every piece of code here has been run: the .NET solution builds and its 7 tests pass, the React component has 6
passing tests, and the JavaScript file runs with asserts.

| Folder | What it answers | Run it |
|---|---|---|
| `AgentInformation/` | The .NET question: an `api/v1/agents` endpoint and a clean folder structure | `dotnet test`, then `dotnet run --project src/AgentInformation.Api` |
| `react-date-picker/` | The React question: pass a value through props and raise an event from a date picker | `npm install && npm test`, then `npm run dev` |
| `javascript/` | The JavaScript question: find employees with a value and print them | `node javascript/find-employees.mjs` |

```bash
cd AgentInformation && dotnet test                     # 7 tests
dotnet run --project src/AgentInformation.Api --urls http://localhost:5290
curl http://localhost:5290/api/v1/agents
curl http://localhost:5290/api/v1/agents/AG-1001

cd ../react-date-picker && npm install && npm test     # 6 tests
npm run dev                                            # http://localhost:5186

node ../javascript/find-employees.mjs
```

---

## Question 1: a .NET API and folder structure for "AgentInformation"

**The ask:** an agent has an Agent Num, "contacted", a user role and a user permission. Write the .NET code that
returns the agents from the database through `GET v1/agents`, and describe the folder structure.

### Review of the answer given

```text
Public class AgentInformation {
    public var context = new DBContext("");
    public List<AgentInfo> GetAgentInformation() {
        return context.Agents.ToList()
    }
}

Public class AgentAPI : IController {
    [httpGet]
        [api="v1/agents"]
    public async List<AgentInfo> GetAgentInfoList() {
        return await new AgentInformation().GetAgentInformation()
    }
}

Infrastructure - Here we use dependency injection.
Entity - All the database entities
Database -
Domain - API endpoint
```

The overall idea was right: a data-access class, a controller, and layers. The problems were in the details an
interviewer for a lead role looks at:

| What was written | Problem | Correct version |
|---|---|---|
| `Public class` | C# keywords are lower case; this does not compile | `public class` |
| `public var context = ...` | `var` is not allowed on fields | A typed, injected dependency |
| `new DBContext("")` inside the class | Hard-wired dependency with an empty connection string: untestable, never disposed, ignores configuration | Register with `AddDbContext` and inject through the constructor |
| `“”` curly quotes | Smart quotes from a document editor; compile error | Plain `""`. Turn off smart quotes in the shared doc, or type in a code editor |
| `context.Agents.ToList()` | Synchronous database call that blocks a thread; returns the EF entities directly | `await ...AsNoTracking().ToListAsync(cancellationToken)`, mapped to a DTO |
| Missing `;` | Compile errors | Add them |
| `AgentAPI : IController` | `IController` is the old ASP.NET MVC 5 interface | `[ApiController]` and `: ControllerBase` |
| `[httpGet]`, `[api="v1/agents"]` | Attribute names are case-sensitive; there is no `api` attribute | `[HttpGet]`, and `[Route("api/v1/agents")]` on the class |
| `public async List<AgentInfo>` | An `async` method must return `Task` or `Task<T>` | `public async Task<ActionResult<IReadOnlyList<AgentDto>>>` |
| `await new AgentInformation().GetAgentInformation()` | Awaiting a method that does not return a `Task` does not compile, and `new` defeats dependency injection | `await agentService.GetAgentsAsync(cancellationToken)` with the service injected |
| The four fields were never modelled | The entity is the first thing to write | An `Agent` entity with `AgentNumber`, `LastContactedAtUtc`, `Role`, `Permissions` |
| "Domain – API endpoint" | Domain is the business model, not the endpoint | Domain = entities and rules; the API project holds controllers |
| "Infrastructure – here we use dependency injection" | DI is wired up in `Program.cs`, the composition root | Infrastructure *implements* data access (EF Core, repositories, external services) and offers `AddInfrastructure()` |
| "Entity" and "Database" as their own layers | Entities belong to Domain; the DbContext and migrations belong to Infrastructure | Four projects: Domain, Application, Infrastructure, Api |

### The folder structure

```text
AgentInformation/
├── AgentInformation.sln
├── src/
│   ├── AgentInformation.Domain/            Business model. No dependencies on anything.
│   │   ├── Entities/Agent.cs
│   │   └── Enums/AgentRole.cs, AgentPermission.cs
│   ├── AgentInformation.Application/       Use cases. Depends only on Domain.
│   │   ├── Abstractions/IAgentRepository.cs     interface defined here, implemented in Infrastructure
│   │   ├── Agents/AgentDto.cs, AgentMappings.cs, IAgentService.cs, AgentService.cs
│   │   └── DependencyInjection.cs               AddApplication()
│   ├── AgentInformation.Infrastructure/    Data access. EF Core lives only here.
│   │   ├── Persistence/AppDbContext.cs
│   │   ├── Persistence/Configurations/AgentConfiguration.cs   table mapping and seed data
│   │   ├── Repositories/AgentRepository.cs
│   │   └── DependencyInjection.cs               AddInfrastructure(configuration)
│   └── AgentInformation.Api/               HTTP. Controllers and the composition root.
│       ├── Controllers/AgentsController.cs
│       ├── Program.cs
│       └── appsettings.json                     connection string
└── tests/
    ├── AgentInformation.UnitTests/         AgentService with a fake repository
    └── AgentInformation.ApiTests/          the real API in memory with WebApplicationFactory
```

The **dependency rule**: arrows point inwards, towards the business model.

```text
Api ──────────► Application ──────► Domain
 │                   ▲
 └─► Infrastructure ─┘   (implements IAgentRepository; Api references it only to register services)
```

Say it like this: "Domain has no dependencies. Application defines what it needs as interfaces. Infrastructure
implements those interfaces with EF Core. The API project wires everything together in `Program.cs`. So I can swap
SQL Server for Postgres, or test the service with a fake repository, without touching the business logic."

### The code (the important files)

The entity, in `Domain/Entities/Agent.cs`. Role is an enum and permissions are bit flags, so one column holds any
combination:

```csharp
public class Agent
{
    public int Id { get; set; }
    public string AgentNumber { get; set; } = string.Empty;   // "Agent Num"
    public DateTime? LastContactedAtUtc { get; set; }         // "contacted": null means never
    public AgentRole Role { get; set; }
    public AgentPermission Permissions { get; set; }

    public bool IsContacted => LastContactedAtUtc is not null;
    public bool Can(AgentPermission permission) => Permissions.HasFlag(permission);
}

public enum AgentRole { Viewer, Agent, Supervisor, Administrator }

[Flags]
public enum AgentPermission { None = 0, Read = 1, Create = 2, Update = 4, Delete = 8, Approve = 16 }
```

The contract the API returns, in `Application/Agents/AgentDto.cs`. It is separate from the entity, so the
database can change without breaking clients:

```csharp
public sealed record AgentDto(
    string AgentNumber,
    bool IsContacted,
    DateTime? LastContactedAtUtc,
    string Role,
    IReadOnlyList<string> Permissions);
```

The interface the application needs, and the service that uses it:

```csharp
public interface IAgentRepository
{
    Task<IReadOnlyList<Agent>> GetAllAsync(CancellationToken cancellationToken);
    Task<Agent?> GetByNumberAsync(string agentNumber, CancellationToken cancellationToken);
}

public sealed class AgentService(IAgentRepository agents) : IAgentService
{
    public async Task<IReadOnlyList<AgentDto>> GetAgentsAsync(CancellationToken cancellationToken)
    {
        var all = await agents.GetAllAsync(cancellationToken);
        return all.Select(a => a.ToDto()).ToList();
    }

    public async Task<AgentDto?> GetAgentAsync(string agentNumber, CancellationToken cancellationToken)
    {
        var agent = await agents.GetByNumberAsync(agentNumber, cancellationToken);
        return agent?.ToDto();
    }
}
```

EF Core, only in Infrastructure:

```csharp
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Agent> Agents => Set<Agent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
}

public sealed class AgentRepository(AppDbContext context) : IAgentRepository
{
    // Read-only queries: AsNoTracking skips change tracking, which is faster and uses less memory.
    public async Task<IReadOnlyList<Agent>> GetAllAsync(CancellationToken cancellationToken) =>
        await context.Agents.AsNoTracking().OrderBy(a => a.AgentNumber).ToListAsync(cancellationToken);

    public Task<Agent?> GetByNumberAsync(string agentNumber, CancellationToken cancellationToken) =>
        context.Agents.AsNoTracking().FirstOrDefaultAsync(a => a.AgentNumber == agentNumber, cancellationToken);
}

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("AgentDb")
            ?? throw new InvalidOperationException("Connection string 'AgentDb' is not configured.");
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString)); // UseSqlServer in production
        services.AddScoped<IAgentRepository, AgentRepository>();
        return services;
    }
}
```

The controller and the composition root:

```csharp
[ApiController]
[Route("api/v1/agents")]
public sealed class AgentsController(IAgentService agentService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AgentDto>>> GetAgents(CancellationToken cancellationToken)
    {
        var agents = await agentService.GetAgentsAsync(cancellationToken);
        return Ok(agents);
    }

    [HttpGet("{agentNumber}")]
    public async Task<ActionResult<AgentDto>> GetAgent(string agentNumber, CancellationToken cancellationToken)
    {
        var agent = await agentService.GetAgentAsync(agentNumber, cancellationToken);
        return agent is null ? NotFound() : Ok(agent);
    }
}

// Program.cs
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
```

What `GET api/v1/agents/AG-1001` returns:

```json
{"agentNumber":"AG-1001","isContacted":true,"lastContactedAtUtc":"2026-10-01T15:30:00Z","role":"Administrator","permissions":["Read","Create","Update","Delete","Approve"]}
```

### If you only have five minutes: the short version

On a whiteboard with little time, this is still correct and compiles. Write it, then say how you would split it
into layers as the service grows.

```csharp
public class Agent
{
    public int Id { get; set; }
    public string AgentNumber { get; set; } = string.Empty;
    public DateTime? LastContactedAtUtc { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Permission { get; set; } = string.Empty;
}

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Agent> Agents => Set<Agent>();
}

public record AgentDto(string AgentNumber, bool IsContacted, string Role, string Permission);

[ApiController]
[Route("api/v1/agents")]
public class AgentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AgentDto>>> GetAgents(CancellationToken cancellationToken) =>
        await db.Agents
            .AsNoTracking()
            .Select(a => new AgentDto(a.AgentNumber, a.LastContactedAtUtc != null, a.Role, a.Permission))
            .ToListAsync(cancellationToken);
}

// Program.cs
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("AgentDb")));
```

### What to say while you write it

1. **Clarify first (30 seconds):** "Is 'contacted' a yes/no flag or a date? I'll store the last-contacted date,
   which gives both. Do role and permission come from our database or from the identity provider? Is this
   read-only, and do we need paging?"
2. **Entity first:** "I'll model the agent: the agent number as the business key, the contact date, the role as an
   enum and permissions as flags, because an agent can have several."
3. **Then the layers:** "Domain holds the entity with no dependencies. Application holds the service and the
   repository interface. Infrastructure implements the repository with EF Core. The API project has the controller
   and `Program.cs`, where I register everything."
4. **The controller:** "It inherits from `ControllerBase` with `[ApiController]`, the route is `api/v1/agents`, the
   action is async and returns `Task<ActionResult<...>>`, and it takes a `CancellationToken`, so a cancelled request
   stops the query."
5. **Why each choice:** "The DbContext is injected, never `new`-ed, so it's scoped per request and testable. I return
   a DTO, not the entity, so the database shape isn't my API contract. `AsNoTracking` because it's read-only."
6. **Close with the next steps:** "Next I'd add paging, an `[Authorize]` policy, a 404 for a single agent, and tests:
   unit tests on the service with a fake repository and an integration test with `WebApplicationFactory`."

### Follow-up questions to expect

- **Why a DTO instead of returning the entity?** The entity is the database shape. A DTO is the public contract: it
  hides internal fields, avoids lazy-loading and circular-reference problems in serialisation, and lets the database
  change without breaking the React client.
- **Why a repository when EF Core is already a repository?** `DbContext` is already a unit of work with repositories
  (`DbSet`). I add an interface so the Application layer doesn't depend on EF Core and can be unit-tested. For a
  simple read-only service, injecting the `DbContext` into the query handler is a fair choice too; it is a trade-off,
  not a rule.
- **Scoped, transient or singleton?** `DbContext` is scoped: one per request. Services that use it are scoped too.
  Never inject a scoped service into a singleton (captive dependency), because the context would outlive the
  request and is not thread-safe.
- **Why async?** Not to make one request faster: while the database works, the thread goes back to the pool, so the
  server handles more concurrent requests.
- **How would you secure it?** `[Authorize(Policy = "CanViewAgents")]`, with the policy checking a role or permission
  claim from the identity provider's token. The UI hides buttons, but the server enforces permissions.
- **Paging?** `GET api/v1/agents?page=1&pageSize=50` with `Skip`/`Take` and a stable `OrderBy`, or keyset paging
  (`WHERE AgentNumber > @last`) for large tables. Cap the page size.
- **Versioning?** The version is in the URL (`v1`). For more, the `Asp.Versioning.Mvc` package supports URL, header or
  query versioning, and old versions can run side by side.
- **Errors?** `AddProblemDetails()` and `UseExceptionHandler()` return RFC 9457 problem details. `[ApiController]`
  returns 400 for invalid models and a problem-details 404 from `NotFound()`.
- **Where does a BFF fit (it is in this JD)?** The React app calls a .NET Backend-for-Frontend that aggregates this
  agent API with other services, shapes the data for each screen, and keeps tokens on the server (cookie session for
  the browser), so the front end never holds access tokens.
- **How do you test it?** Unit tests for the service with a fake repository; integration tests that start the API
  in memory with `WebApplicationFactory<Program>` against a test database. Both are in `tests/`.
- **Would you use MediatR or CQRS?** For a larger service, separating commands and queries keeps each handler small.
  For one read endpoint it adds ceremony, so I would start without it.

---

## Question 2: a React date picker that receives a value and raises an event

**The ask:** create a React component, pass the value in through props, and show how the date picker raises an
event when the user picks a date.

### Review of the answer given

```text
Import React from React.IO

Export Const DatePicker({dateValue}) {
    const date, selectDate = useState(dateValue)
    return (<DatePicker onmouseDown={(e) => {
                e.preventDefault()
                selecteDate(e.targetValue)
    }} value={date}></DatePicker>)
}
```

| What was written | Problem | Correct version |
|---|---|---|
| `Import React from React.IO` | Keywords are lower case and the package name is a quoted string. With the modern JSX transform you do not import React at all | `import { useId, type ChangeEvent } from 'react';` |
| `Export Const DatePicker({dateValue})` | Not valid syntax for a component | `export function DatePicker({ value, onChange }: DatePickerProps)` |
| `const date, selectDate = useState(...)` | `useState` returns an array; it must be destructured | `const [date, setDate] = useState(...)` |
| Rendering `<DatePicker>` inside `DatePicker` | The component renders itself: infinite recursion | Render a native `<input type="date">` (or a library picker) |
| `onmouseDown` with `e.preventDefault()` | Wrong event, and `preventDefault` on mouse down stops the picker from opening | `onChange` |
| `e.targetValue` | Not a property | `e.target.value` |
| `selecteDate` vs `selectDate` | Typo | Consistent names |
| `useState(dateValue)` | Copies the prop into state once; later prop changes are ignored, so there are two sources of truth | Use the prop directly (controlled), or name it `defaultValue` (uncontrolled) |
| No event to the parent | **This was the actual question**: the parent never hears about the change | Accept an `onChange` callback prop and call it |
| No label | Not accessible to screen readers | `<label htmlFor={id}>` with `useId()` |

### The answer: a controlled component

The pattern is **data down, events up**. The parent owns the date and passes it down as `value`. The child calls
`onChange` when the user picks a date, and the parent updates its state.

`react-date-picker/src/DatePicker.tsx`:

```tsx
import { useId, type ChangeEvent } from 'react';

export type DatePickerProps = {
  label: string;
  /** The selected date as "YYYY-MM-DD", or "" for none. The parent owns this value. */
  value: string;
  /** Raised to the parent every time the user picks a date. */
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
};

export function DatePicker({ label, value, onChange, min, max, disabled = false }: DatePickerProps) {
  const id = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="date-picker">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} min={min} max={max} disabled={disabled} onChange={handleChange} />
    </div>
  );
}
```

The parent, `react-date-picker/src/App.tsx`:

```tsx
import { useState } from 'react';
import { DatePicker } from './DatePicker';

export default function App() {
  const [startDate, setStartDate] = useState('2026-10-14');

  return (
    <main>
      <h1>Schedule</h1>
      <DatePicker label="Start date" value={startDate} onChange={setStartDate} min="2026-01-01" max="2026-12-31" />
      <p aria-live="polite">Selected date: {startDate || 'none'}</p>
    </main>
  );
}
```

If the interviewer wants the picker to **keep its own state** (closest to what you wrote), name the prop
`defaultValue`, keep local state, and still raise the event. This is in `src/UncontrolledDatePicker.tsx`:

```tsx
export function UncontrolledDatePicker({ label, defaultValue = '', onDateChange }: UncontrolledDatePickerProps) {
  const id = useId();
  const [date, setDate] = useState(defaultValue);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDate(event.target.value);
    onDateChange?.(event.target.value);
  }

  return (
    <div className="date-picker">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={date} onChange={handleChange} />
    </div>
  );
}
```

### What to say while you write it

1. "The parent owns the selected date. I pass it down as `value`, and I pass an `onChange` callback so the picker can
   raise the change back up. That's lifting state up: one source of truth."
2. "Inside, I render a native date input with a label for accessibility. `useId` links the label and the input."
3. "On `onChange` I read `event.target.value`, which is a `YYYY-MM-DD` string, and call the parent's callback. The
   picker has no state of its own, so it can never drift out of sync with the parent."
4. "I keep the value as a string, not a `Date`, to avoid time-zone bugs. I'd convert at the edges, when calling the
   API."
5. "To test it: render it, find the input by its label, fire a change, and assert the callback got the new date. A
   second test renders the parent and checks the displayed date updates."

### Follow-up questions to expect

- **Controlled vs uncontrolled?** Controlled: the value comes from props or state and every change goes through
  `onChange`, which is best for validation and for keeping several components in sync. Uncontrolled: the DOM or the
  component keeps the value (`defaultValue`), which is simpler for fire-and-forget forms.
- **Why a string, not a `Date`?** `new Date('2026-10-14')` is parsed as midnight UTC, which displays as 13 October in
  US time zones. A `YYYY-MM-DD` string is exactly what the input uses, so it avoids that whole class of bug.
- **Why not copy the prop into state?** `useState(prop)` only uses the prop on the first render. When the parent
  changes it, the child ignores it. Use the prop directly, or reset the child with a `key` if it must own its state.
- **Native input or a library?** The native input is accessible, lightweight and uses the platform picker, but looks
  different in each browser. For date ranges, locales or a consistent design, use a library such as MUI X Date
  Pickers or react-day-picker, styled with Tailwind to match the design system.
- **Where does Redux Toolkit come in (it is in this JD)?** If the date is a filter shared by many components (a
  dashboard date range), keep it in an RTK slice. If only this form uses it, local state is simpler.
- **Do you need `useCallback` for the handler?** Only if the child is wrapped in `React.memo` and re-renders are
  measurably expensive. Otherwise it adds noise.
- **How do you make it reusable for the team (lead question)?** Put it in the shared component library with typed
  props, sensible defaults, Storybook stories, tests and accessibility checks, and document when to use the
  controlled and uncontrolled versions.

---

## Question 3: find a value in an array and print it

**The ask:** given the employees array, print the names of the employees whose value is 40.

### Review of the answer given

```text
Var employees = [
    {name:'Abdul', Value: 35},
    {name:'Abdul1', Value: 40},
    ...
]
employees.foreach(e => {
    if (e.value === 40)
        console.log(e.name)
})
```

| What was written | Problem | Correct version |
|---|---|---|
| `Var` | Keywords are lower case, and `var` is function-scoped | `const employees = [...]` |
| `'Abdul'` with curly quotes | Smart quotes from the document editor | Plain `'Abdul'` |
| `Value: 40` but `e.value === 40` | **The real bug:** property names are case-sensitive, so `e.value` is `undefined` and nothing prints | Use the same name in the data and the check |
| `foreach` | The method is `forEach` | `forEach`, or better `filter` then `forEach` |

### The answer

```js
const employees = [
  { name: 'Abdul', value: 35 },
  { name: 'Abdul1', value: 40 },
  { name: 'Abdul2', value: 40 },
  { name: 'Abdul3', value: 36 },
  { name: 'Abdul4', value: 37 },
];

employees
  .filter((employee) => employee.value === 40)
  .forEach((employee) => console.log(employee.name)); // Abdul1, Abdul2
```

The other ways to show you know the array methods (all in `javascript/find-employees.mjs`):

```js
// Only the first match: find stops early and returns undefined when nothing matches.
const firstMatch = employees.find((employee) => employee.value === 40);
console.log(firstMatch?.name ?? 'No employee found');

// Return the names instead of printing them, so the function can be tested.
const namesWithValue = (list, target) =>
  list.filter((employee) => employee.value === target).map((employee) => employee.name);
```

### What to say while you write it

"I'll filter the employees whose value is exactly 40, using `===` so there is no type coercion, then print each
name. That's one pass, O(n). If I only needed the first match, I'd use `find`, which stops early. If this lookup
ran many times on a big list, I'd build a `Map` from value to names once, so each lookup is O(1)."

### Follow-up questions to expect

- **`==` vs `===`?** `===` compares without type coercion (`'40' === 40` is false); `==` coerces (`'40' == 40` is
  true). Use `===`.
- **`filter` vs `find` vs `forEach` vs `map`?** `filter` returns every match as a new array, `find` returns the first
  match or `undefined`, `map` transforms every item, and `forEach` only runs side effects and returns nothing.
- **What if there is no match?** `filter` returns `[]`; `find` returns `undefined`, so guard with `?.` or `??`.
- **How would you stop at the first match in a loop?** `for (const e of employees) { if (e.value === 40) { ...; break; } }`.
  `forEach` cannot be stopped early.
- **Sort by value, then name?** `employees.toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name))`.

---

## For the next round

- **Write code in a code editor, not a document.** Most of the compile errors above were capital letters and smart
  quotes from the editor, not knowledge gaps. If the interviewer gives you a shared document, turn off
  auto-capitalisation and smart quotes first, or say "this editor is changing my quotes and capitals; in an IDE
  these would be lower case".
- **Clarify, then skeleton, then details.** Ask one or two questions, write the shape (entity, interface,
  controller), then fill it in while talking. A correct skeleton with a missing detail beats detailed code with the
  wrong structure.
- **Answer the question they asked.** The React question was about raising an event to the parent: say "data down,
  events up" and show the `onChange` callback prop in the first minute.
- **Think like a lead.** Mention how you would make it a team standard: the folder convention, DI, DTOs, tests,
  code-review checks and a shared component library. That is what separates a technical-lead answer from a
  developer answer.
