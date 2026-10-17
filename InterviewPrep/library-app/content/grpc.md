---
title: gRPC and Protocol Buffers
goal: Design a .proto contract that evolves safely, build unary and streaming gRPC services in Python and Node, and explain deadlines, errors, retries, load balancing, browser access and Cloud Run deployment.
minutes: 65
---

Backend roles often ask for high-throughput REST **and gRPC** APIs in Python or Node.js, and **gRPC streaming** is one of the three streaming protocols interviewers expect you to compare with SSE and WebSockets. On an agent platform, especially one on Google Cloud, gRPC is a natural fit between services: an orchestrator calling tool workers, a worker streaming run events to a gateway, an agent talking to a model server. Google built gRPC, and many Google Cloud APIs are gRPC under the hood.

Interviewers usually check four things. Do you understand **Protocol Buffers and safe schema evolution**? Can you explain the **four call types**? Do you treat **deadlines, cancellation and status codes** properly? And do you know the operational traps: L4 load balancing, browsers, Cloud Run's HTTP/2 setting? gRPC is not on your resume, so this chapter gives you working code in both languages, and the honest answer is "not in production yet, but here is how it works". Every block below was compiled and run, servers included.

## The 60-second version

- **gRPC** is an RPC framework. You define services and messages in a `.proto` file, generate client and server code in many languages, and call remote methods as if they were local functions, with types checked at compile time.
- It runs over **HTTP/2**, so many calls share one connection (multiplexing), headers are compressed, and streams flow in both directions.
- Messages are **Protocol Buffers**: a compact binary format where fields are identified by **numbers**, not names.
- Four call types: **unary**, **server streaming**, **client streaming**, **bidirectional streaming**.
- Built in: **deadlines** that propagate, **cancellation**, a fixed set of **status codes**, **metadata** for auth and tracing, and **interceptors**.
- Trade-offs: browsers cannot call it directly, payloads are not human-readable, and HTTP/2's long-lived connections make load balancing subtler.

## Protocol Buffers: the contract

```proto
syntax = "proto3";
package agents.v1;                                // the major version lives in the package name

import "google/protobuf/timestamp.proto";

service AgentRuns {
  rpc GetRun(GetRunRequest) returns (Run);                                // unary
  rpc StreamRunEvents(StreamRunEventsRequest) returns (stream RunEvent);  // server streaming
  rpc UploadLogs(stream LogLine) returns (UploadSummary);                 // client streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);              // bidirectional
}

enum RunStatus {
  RUN_STATUS_UNSPECIFIED = 0;                     // the zero value must mean "not set"
  RUN_STATUS_RUNNING = 1;
  RUN_STATUS_SUCCEEDED = 2;
}

message Run {
  string run_id = 1;
  RunStatus status = 2;
  google.protobuf.Timestamp created_at = 3;       // well-known types instead of strings
  map<string, string> labels = 4;
  repeated string tool_names = 5;
}
```

What to say about it:

- **Field numbers are the contract.** The wire format stores `(field number, wire type)` tags and values, never names. Renaming a field is safe for binary clients. Changing its number or type is not.
- Numbers 1–15 take **one byte** of tag, so give them to frequent fields. Numbers 19000–19999 are reserved by protobuf itself, and the maximum is 536,870,911.
- **proto3 defaults:** a scalar that is not set reads as its zero value (`0`, `""`, `false`), so "unset" and "zero" look the same. Use `optional` when you need to tell them apart. Message fields can be checked with `HasField`.
- **Enums** start with an `_UNSPECIFIED = 0` value. A reader preserves enum values it does not know, but how they surface depends on the language: Python and Go give you the bare number, Java maps it to `UNRECOGNIZED`. Either way, code must handle "unknown".
- **Well-known types:** `Timestamp`, `Duration`, `Empty`, `FieldMask` (partial updates), `Struct`, and wrapper types.
- **Versioning:** additive changes stay in `v1`. Breaking changes mean a new package (`agents.v2`), served side by side. Tools such as `buf lint` and `buf breaking` catch breaking changes in CI.

Why it is compact, measured:

```python
import importlib
import json
import sys
import tempfile
from pathlib import Path

from grpc_tools import protoc

PROTO = """
syntax = "proto3";
package wire.demo;
message Tiny {
  int64 seq = 1;
  int64 rare_field = 16;
}
"""
with tempfile.TemporaryDirectory(dir=".") as tmp:
    (Path(tmp) / "tiny.proto").write_text(PROTO)
    assert protoc.main(["protoc", f"-I{tmp}", f"--python_out={tmp}", f"{tmp}/tiny.proto"]) == 0
    sys.path.insert(0, tmp)
    pb = importlib.import_module("tiny_pb2")

assert pb.Tiny(seq=1).SerializeToString() == b"\x08\x01"  # tag (field 1, varint) + value: 2 bytes
assert pb.Tiny(seq=300).SerializeToString() == b"\x08\xac\x02"  # varints grow with the value
assert pb.Tiny(rare_field=1).SerializeToString() == b"\x80\x01\x01"  # field 16 needs a 2-byte tag
assert pb.Tiny().SerializeToString() == b""  # default values are not sent at all
assert len(json.dumps({"seq": 1}, separators=(",", ":"))) == 9  # the same data as JSON: 9 bytes
```

| Change | Safe? | Why |
|---|---|---|
| Add a field with a new number | Yes | Old readers skip it, and keep it as an unknown field |
| Rename a field | Yes for binary, no for JSON | Names aren't on the wire, but JSON mapping uses them |
| Remove a field | Yes, if you `reserved` its number and name | Otherwise someone reuses the number and old data is misread |
| Change a field's number or type | **No** | Old and new code read different things |
| Add an enum value | Yes, if readers handle unknown values | Old readers see a bare number |
| Move existing fields into or out of a `oneof` | Risky | Data can be cleared when several of them are set; moving fields into an *existing* `oneof` is never safe |
| Rename a service or method, change the package | **No** | The method path (`/agents.v1.AgentRuns/GetRun`) changes |

The first coding problem proves these rules with a running test.

## The four kinds of call

| Kind | Shape | Agent-platform example |
|---|---|---|
| Unary | One request, one response | `GetRun`, `ApproveStep` |
| Server streaming | One request, a stream of responses | Stream a run's events or tokens to a gateway |
| Client streaming | A stream of requests, one response | Upload a batch of log lines or embeddings, get a summary |
| Bidirectional | Both sides stream independently | An orchestrator and a tool worker exchanging tasks and results; an interactive agent session |

Here are three of them with Python's asyncio API (`grpc.aio`), with a deadline, a status error, client cancellation, a deadline that expires mid-stream, and metadata. The `.proto` is compiled at runtime so the block is self-contained. Normally that is a build step that generates `*_pb2.py` and `*_pb2_grpc.py`.

```python
import asyncio
import importlib
import sys
import tempfile
from importlib.resources import files
from pathlib import Path

import grpc
from grpc_tools import protoc

PROTO = """
syntax = "proto3";
package agents.v1;

import "google/protobuf/timestamp.proto";

service AgentRuns {
  rpc GetRun(GetRunRequest) returns (Run);
  rpc StreamRunEvents(StreamRunEventsRequest) returns (stream RunEvent);
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}

message GetRunRequest { string run_id = 1; }
message Run {
  string run_id = 1;
  string status = 2;
  google.protobuf.Timestamp created_at = 3;
}
message StreamRunEventsRequest { string run_id = 1; int64 after_seq = 2; }
message RunEvent { int64 seq = 1; string kind = 2; string text = 3; }
message ChatMessage { string role = 1; string text = 2; }
"""

well_known = str(files("grpc_tools") / "_proto")  # where google/protobuf/*.proto live
with tempfile.TemporaryDirectory(dir=".") as tmp:
    (Path(tmp) / "agents.proto").write_text(PROTO)
    args = ["protoc", f"-I{tmp}", f"-I{well_known}", f"--python_out={tmp}", f"--grpc_python_out={tmp}", f"{tmp}/agents.proto"]
    assert protoc.main(args) == 0
    sys.path.insert(0, tmp)
    pb = importlib.import_module("agents_pb2")
    rpc = importlib.import_module("agents_pb2_grpc")


class AgentRuns(rpc.AgentRunsServicer):
    def __init__(self) -> None:
        self.cancelled_streams = 0

    async def GetRun(self, request, context):
        if request.run_id != "run-7":
            await context.abort(grpc.StatusCode.NOT_FOUND, f"run {request.run_id} not found")
        run = pb.Run(run_id="run-7", status="RUNNING")
        run.created_at.FromJsonString("2026-10-14T09:30:00Z")
        return run

    async def StreamRunEvents(self, request, context):
        finished = False
        try:
            for seq in range(request.after_seq + 1, 1_000):
                yield pb.RunEvent(seq=seq, kind="token", text=f"t{seq}")
                await asyncio.sleep(0.01)
            finished = True
        finally:
            # Cancelled at an await (CancelledError) or closed at a yield (GeneratorExit):
            # either way the client cancelled or its deadline passed, so stop the work here.
            if not finished:
                self.cancelled_streams += 1

    async def Chat(self, request_iterator, context):
        async for msg in request_iterator:
            yield pb.ChatMessage(role="assistant", text=f"echo: {msg.text}")


async def wait_until(check, timeout: float = 10.0) -> None:
    """Poll instead of sleeping a fixed time: cancellation reaches the server asynchronously."""
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout
    while not check() and loop.time() < end:
        await asyncio.sleep(0.01)
    assert check(), "timed out waiting for the server"


async def main() -> None:
    servicer = AgentRuns()
    server = grpc.aio.server()
    rpc.add_AgentRunsServicer_to_server(servicer, server)
    port = server.add_insecure_port("localhost:0")  # 0 = any free port
    await server.start()
    try:
        await exercise(servicer, port)
    finally:
        await server.stop(grace=None)  # always inside the event loop, even when an assert fails


async def exercise(servicer: AgentRuns, port: int) -> None:
    async with grpc.aio.insecure_channel(f"localhost:{port}") as channel:
        stub = rpc.AgentRunsStub(channel)

        # Unary, with a deadline and metadata (how auth tokens and trace ids travel).
        run = await stub.GetRun(pb.GetRunRequest(run_id="run-7"), timeout=5, metadata=[("authorization", "Bearer t")])
        assert run.status == "RUNNING" and run.created_at.ToJsonString() == "2026-10-14T09:30:00Z"
        try:
            await stub.GetRun(pb.GetRunRequest(run_id="nope"), timeout=5)
            raise AssertionError("expected NOT_FOUND")
        except grpc.aio.AioRpcError as err:
            assert err.code() == grpc.StatusCode.NOT_FOUND and "nope" in err.details()

        # Server streaming, resumed after seq 4, cancelled by the client after three events.
        call = stub.StreamRunEvents(pb.StreamRunEventsRequest(run_id="run-7", after_seq=4))
        seen = []
        async for event in call:
            seen.append(event.seq)
            if len(seen) == 3:
                call.cancel()
                break
        assert seen == [5, 6, 7]

        # A deadline that passes mid-stream ends the call with DEADLINE_EXCEEDED.
        try:
            async for _ in stub.StreamRunEvents(pb.StreamRunEventsRequest(run_id="run-7"), timeout=0.5):
                pass
            raise AssertionError("expected DEADLINE_EXCEEDED")
        except grpc.aio.AioRpcError as err:
            assert err.code() == grpc.StatusCode.DEADLINE_EXCEEDED

        # Bidirectional: one call, written and read independently.
        chat = stub.Chat()
        replies = []
        for text in ["hi", "status?"]:
            await chat.write(pb.ChatMessage(role="user", text=text))
            replies.append((await chat.read()).text)
        await chat.done_writing()
        assert await chat.read() == grpc.aio.EOF  # the server finished its side too
        assert replies == ["echo: hi", "echo: status?"]

    # Both the cancel and the deadline reached the server's handlers.
    await wait_until(lambda: servicer.cancelled_streams == 2)


asyncio.run(main())
```

Notice how cancellation **propagates to the server**: the handler is cancelled, so the work stops. Where it surfaces depends on where the generator is paused: `CancelledError` if it is at an `await`, `GeneratorExit` if it is at a `yield` while gRPC is sending the previous message. So put cleanup (closing the model stream, releasing locks) in `finally`, not in `except CancelledError`; testing this example under load is how that showed up. It is the gRPC equivalent of noticing an SSE client has closed the tab.

## Node.js with @grpc/grpc-js

In Node, `@grpc/proto-loader` reads the `.proto` at runtime (no code generation; `buf` or `ts-proto` can generate typed clients instead). This block runs a server-streaming call with metadata and a deadline, an authentication failure, and a client-streaming upload:

```ts
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO = `
syntax = "proto3";
package agents.v1;
service AgentRuns {
  rpc StreamRunEvents(StreamRunEventsRequest) returns (stream RunEvent);  // server streaming
  rpc UploadLogs(stream LogLine) returns (UploadSummary);                 // client streaming
}
message StreamRunEventsRequest { string run_id = 1; int64 after_seq = 2; }
message RunEvent { int64 seq = 1; string kind = 2; }
message LogLine { string level = 1; string text = 2; }
message UploadSummary { int32 lines = 1; int32 errors = 2; }
`;

type StreamRunEventsRequest = { run_id: string; after_seq: number };
type RunEvent = { seq: number; kind: string };
type LogLine = { level: string; text: string };
type UploadSummary = { lines: number; errors: number };

const dir = mkdtempSync(join(tmpdir(), 'proto-'));
writeFileSync(join(dir, 'agents.proto'), PROTO);
// longs: Number turns int64 into a JS number (fine below 2^53; otherwise use String).
const definition = protoLoader.loadSync(join(dir, 'agents.proto'), { keepCase: true, longs: Number, defaults: true });
rmSync(dir, { recursive: true });
const pkg = grpc.loadPackageDefinition(definition) as unknown as {
  agents: { v1: { AgentRuns: grpc.ServiceClientConstructor } };
};
const { AgentRuns } = pkg.agents.v1;

const KINDS = ['queued', 'running', 'tool_call', 'succeeded'];

const server = new grpc.Server();
server.addService(AgentRuns.service, {
  StreamRunEvents(call: grpc.ServerWritableStream<StreamRunEventsRequest, RunEvent>) {
    if (call.metadata.get('authorization')[0] !== 'Bearer good-token') {
      // A streaming handler reports failure by emitting a status object.
      call.emit('error', { code: grpc.status.UNAUTHENTICATED, details: 'missing or bad token' });
      return;
    }
    KINDS.forEach((kind, seq) => {
      if (seq > call.request.after_seq) call.write({ seq, kind });
    });
    call.end();
  },
  UploadLogs(call: grpc.ServerReadableStream<LogLine, UploadSummary>, done: grpc.sendUnaryData<UploadSummary>) {
    let lines = 0;
    let errors = 0;
    call.on('data', (line: LogLine) => {
      lines++;
      if (line.level === 'ERROR') errors++;
    });
    call.on('end', () => done(null, { lines, errors }));
  },
});

const port = await new Promise<number>((resolve, reject) =>
  server.bindAsync('localhost:0', grpc.ServerCredentials.createInsecure(), (err, p) => (err ? reject(err) : resolve(p))),
);
const client = new AgentRuns(`localhost:${port}`, grpc.credentials.createInsecure());

// Server streaming with metadata and a deadline.
const auth = new grpc.Metadata();
auth.set('authorization', 'Bearer good-token');
const events: RunEvent[] = [];
await new Promise<void>((resolve, reject) => {
  const stream = client.StreamRunEvents({ run_id: 'run-7', after_seq: 1 }, auth, { deadline: Date.now() + 10_000 });
  stream.on('data', (e: RunEvent) => events.push(e));
  stream.on('end', () => resolve());
  stream.on('error', reject);
});
assert.deepEqual(events, [{ seq: 2, kind: 'tool_call' }, { seq: 3, kind: 'succeeded' }]);

// No token: the call fails with a gRPC status, not an HTTP status code.
const failure = await new Promise<grpc.ServiceError>((resolve) => {
  const stream = client.StreamRunEvents({ run_id: 'run-7', after_seq: -1 });
  stream.on('data', () => assert.fail('no data expected'));
  stream.on('error', resolve);
});
assert.equal(failure.code, grpc.status.UNAUTHENTICATED);

// Client streaming: many messages up, one summary back.
const summary = await new Promise<UploadSummary>((resolve, reject) => {
  const upload = client.UploadLogs((err: grpc.ServiceError | null, res: UploadSummary) => (err ? reject(err) : resolve(res)));
  upload.write({ level: 'INFO', text: 'tool started' });
  upload.write({ level: 'ERROR', text: 'SAP API returned 503' });
  upload.write({ level: 'INFO', text: 'retry succeeded' });
  upload.end();
});
assert.deepEqual(summary, { lines: 3, errors: 1 });

client.close();
await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
```

A trap visible in this code: a streaming handler that neither ends the call nor emits an error leaves the client waiting until its deadline. Always finish every path, and always set deadlines on the client.

## Deadlines, cancellation and errors

- **Always set a deadline.** gRPC has no default deadline, so a call to a hung server waits forever. The deadline travels with the request (the `grpc-timeout` header), and the server can read the time left (`context.time_remaining()` in Python).
- **Propagate it.** A service that calls another should pass on *its own remaining time minus a small reserve*, not a fresh 30 seconds. Then the whole call tree gives up together, and no work continues for a caller that has already given up. The second coding problem builds this across two real services.
- **Cancellation** also propagates: when a client cancels, or its deadline passes, the server's handler is cancelled. Long work must stop at that point.

Errors are a **status code plus a message**, with optional rich details. These are the codes to know:

| Code | Use it when | Retry? |
|---|---|---|
| `INVALID_ARGUMENT` (3) | The request is malformed, whatever the system state | No |
| `DEADLINE_EXCEEDED` (4) | The deadline passed (the operation may still have completed) | Only if idempotent |
| `NOT_FOUND` (5) / `ALREADY_EXISTS` (6) | Missing resource / create conflict | No |
| `PERMISSION_DENIED` (7) / `UNAUTHENTICATED` (16) | Authorisation / authentication failure | No (refresh the credentials for 16) |
| `RESOURCE_EXHAUSTED` (8) | Quota or rate limit | With backoff |
| `FAILED_PRECONDITION` (9) | System not in the right state (for example, the run is already finished) | No, not until the state changes |
| `ABORTED` (10) | A concurrency conflict | Yes, at a higher level (redo the read-modify-write) |
| `UNIMPLEMENTED` (12) | The method doesn't exist on this server | No |
| `INTERNAL` (13) / `UNKNOWN` (2) | A bug or an unexpected failure | Rarely |
| `UNAVAILABLE` (14) | Transient: the server is down or overloaded, or the connection reset | **Yes**, with backoff |

For machine-readable detail, Google's rich error model (`google.rpc.Status` with details such as `ErrorInfo`, `BadRequest` field violations and `RetryInfo`) travels in the `grpc-status-details-bin` trailer.

## Retries, keepalive and load balancing

Retries are configured in the **service config**, per method, rather than hand-written around each call: which codes are retryable, how many attempts, and the backoff. There is also hedging (sending a duplicate request when the first one is slow). This test proves a client transparently retries two `UNAVAILABLE` responses:

```python
import asyncio
import importlib
import json
import sys
import tempfile
from pathlib import Path

import grpc
from grpc_tools import protoc

PROTO = """
syntax = "proto3";
package demo.v1;
message RunRef { int64 seq = 1; string status = 2; }
service Runs { rpc Get(RunRef) returns (RunRef); }
"""
with tempfile.TemporaryDirectory(dir=".") as tmp:
    (Path(tmp) / "runs.proto").write_text(PROTO)
    assert protoc.main(["protoc", f"-I{tmp}", f"--python_out={tmp}", f"--grpc_python_out={tmp}", f"{tmp}/runs.proto"]) == 0
    sys.path.insert(0, tmp)
    pb = importlib.import_module("runs_pb2")
    rpc = importlib.import_module("runs_pb2_grpc")

SERVICE_CONFIG = json.dumps({
    "methodConfig": [{
        "name": [{"service": "demo.v1.Runs"}],
        "timeout": "10s",  # a default deadline for every call to this service
        "retryPolicy": {
            "maxAttempts": 4,
            "initialBackoff": "0.01s",
            "maxBackoff": "0.1s",
            "backoffMultiplier": 2,
            "retryableStatusCodes": ["UNAVAILABLE"],
        },
    }]
})


class FlakyRuns(rpc.RunsServicer):
    def __init__(self) -> None:
        self.calls = 0

    async def Get(self, request, context):
        self.calls += 1
        if self.calls < 3:
            await context.abort(grpc.StatusCode.UNAVAILABLE, "warming up")
        return pb.RunRef(seq=request.seq, status="ok")


async def main() -> None:
    servicer = FlakyRuns()
    server = grpc.aio.server()
    rpc.add_RunsServicer_to_server(servicer, server)
    port = server.add_insecure_port("localhost:0")
    await server.start()
    try:
        options = [("grpc.service_config", SERVICE_CONFIG)]
        async with grpc.aio.insecure_channel(f"localhost:{port}", options=options) as channel:
            reply = await rpc.RunsStub(channel).Get(pb.RunRef(seq=1))
        assert reply.status == "ok" and servicer.calls == 3  # two UNAVAILABLE answers were retried for us
    finally:
        await server.stop(grace=None)


asyncio.run(main())
```

**Load balancing is the classic gRPC production trap.** A client opens one HTTP/2 connection and sends all its calls over it. An L4 (TCP) load balancer balances *connections*, so every call from that client lands on the same backend. New replicas get no traffic until clients reconnect. The fixes:

- An **L7 proxy** that balances individual requests: Envoy, a service mesh, Google's Application Load Balancer, or GKE's Gateway API.
- **Client-side load balancing:** resolve all backends (for example a Kubernetes headless Service through DNS) and use the `round_robin` policy, or xDS.
- Set a **max connection age** on servers, so clients reconnect and spread out over time.

**Keepalive:** for long-lived streams through NATs and proxies, configure HTTP/2 keepalive pings (client and server must agree on the allowed rate, or the server closes the connection with `ENHANCE_YOUR_CALM`). **Flow control** comes from HTTP/2: each stream has a window, so a slow reader makes the sender's writes wait instead of filling memory.

## Interceptors, metadata, health and reflection

- **Metadata** is gRPC's headers: auth tokens (`authorization`), trace context (`traceparent`), request ids. Keys ending in `-bin` carry binary values.
- **Interceptors** are middleware on either side: authentication, logging, metrics, tracing (OpenTelemetry has gRPC instrumentation), deadline enforcement, retries.
- **Health checking:** the standard `grpc.health.v1.Health` service (`Check`, `Watch`), which Kubernetes probes and load balancers can call.
- **Reflection:** a server can describe its own services, so tools like `grpcurl` can call it without the `.proto`. Enable it in development and internal environments.
- **Security:** TLS on every connection, mTLS between services (or a mesh doing it for you), per-call credentials in metadata. On Google Cloud, services calling a private Cloud Run service send a Google-signed ID token as `authorization: Bearer …`.

## gRPC and browsers

Browsers cannot speak native gRPC. Their fetch API does not give pages control of HTTP/2 framing and trailers. The options:

| Option | How | Notes |
|---|---|---|
| gRPC-Web | A browser client plus a proxy (Envoy) or server-side support that translates to gRPC | Unary and server streaming only, no client or bidirectional streaming from the browser |
| Connect (Buf) | One server speaks gRPC, gRPC-Web and the simple Connect protocol over HTTP/1.1 or HTTP/2 | Plain `fetch` from the browser; generated typed TypeScript clients. In browsers it is still unary and server streaming only |
| JSON transcoding | `google.api.http` annotations map RPCs to REST URLs; Envoy, ESPv2 or API Gateway translate | The browser sees an ordinary REST/JSON API |
| A BFF | The browser calls a backend-for-frontend over REST, SSE or WebSockets; the BFF calls gRPC services | Common: gRPC inside, web-friendly protocols at the edge |

For an agent platform, a sensible split is gRPC between services (orchestrator, tool workers, model gateway), and SSE or WebSockets from a BFF to the browser. The BFF turns a server-streaming RPC into an SSE stream almost one-to-one.

## gRPC on Cloud Run and GKE

- **Cloud Run** supports all gRPC call types, unary and streaming. Google recommends enabling **end-to-end HTTP/2** for gRPC (`gcloud run services update SERVICE --use-http2`), because streaming and metadata need it. Your container must then accept **cleartext HTTP/2 (h2c)**, while Google's front end terminates TLS. Some simple unary calls work without it, but don't rely on that.
- Each stream counts once against the instance's concurrency limit, and keepalive settings only affect the connection to Google's load balancer, not to your instance.
- Streams are requests, so the **request timeout** (default 5 minutes, maximum 60) caps them. Long-lived streams need resume logic (a sequence number in the request, as in `after_seq` above).
- Service-to-service calls to a private Cloud Run service authenticate with an **ID token** whose audience is the service URL, sent in metadata.
- On **GKE**, use the Gateway API or an Envoy-based mesh for per-request (L7) balancing, or a headless Service with client-side `round_robin`. A plain ClusterIP Service balances connections (L4), which brings back the trap above.

## REST vs gRPC vs GraphQL

| | REST + JSON | gRPC | GraphQL |
|---|---|---|---|
| Contract | OpenAPI (optional) | `.proto` (required), code generation | Schema (required) |
| Payload | Text JSON, readable | Binary protobuf, compact | JSON |
| Streaming | SSE, chunked responses | Four native call types | Subscriptions (usually over WebSockets) |
| Browser | Native | Needs gRPC-Web, Connect or transcoding | Native |
| Caching | HTTP caching works | No HTTP caching | Hard (POST, client-defined queries) |
| Best for | Public and web APIs, simple integrations | Internal service-to-service calls, streaming, polyglot microservices | Front ends that aggregate many data sources |

## Interview questions

### What is gRPC, and when would you choose it over REST? {core}

"gRPC is an RPC framework from Google. You define services and messages in a .proto file, generate typed clients and servers in many languages, and calls travel as Protocol Buffers over HTTP/2. I'd choose it for internal service-to-service APIs: strict contracts with code generation, compact binary messages, multiplexed connections, deadlines and cancellation built in, and real streaming in both directions. For public APIs or anything the browser calls directly, I'd stay with REST and JSON, or put a gateway in front."

For an agent platform, say: "gRPC between orchestrator, tool workers and model gateways. REST, SSE or WebSockets at the edge for the React app."

### What are Protocol Buffers, and why are they efficient? {core}

"Protocol Buffers are a language-neutral schema and binary format. Each field has a number, and on the wire a message is just a sequence of field-number tags and values: variable-length integers, length-prefixed strings and nested messages, with no field names and no default values sent. So messages are smaller than JSON and much faster to parse, and generated code gives you types in every language. The trade-off is that the payload isn't human-readable, so you need the schema, or reflection, to inspect it."

A concrete number helps: `seq = 1` encodes as two bytes, `08 01`, versus nine bytes for `{"seq":1}`.

### Explain the four kinds of gRPC calls, with an example of each. {core}

"Unary is one request and one response, like GetRun. Server streaming is one request and many responses: a client subscribes to a run's events and the server pushes them as they happen. Client streaming is many requests and one response: a worker uploads a batch of log lines and gets a summary back. Bidirectional streaming means both sides stream independently over one call: an orchestrator sending tasks to a tool worker and receiving results and progress, or an interactive agent session. All four share deadlines, cancellation and status codes."

### How do you evolve a .proto without breaking clients? {core}

"Treat field numbers as permanent. Adding fields with new numbers is safe: old readers skip them and even preserve them as unknown fields. Never change a field's number or type. When removing a field, mark its number and name `reserved` so nobody reuses them. Add enum values knowing old readers will see an unknown number, so code must handle 'unknown'. Breaking changes go into a new package version like agents.v2, served alongside v1. And I run `buf breaking` in CI so a breaking change fails the build."

### How do deadlines work in gRPC, and why propagate them? {core}

"The client sets a deadline, an absolute time by which it needs an answer. It's sent with the request, so the server knows how much time is left, and when it passes, both sides get DEADLINE_EXCEEDED and the server's handler is cancelled. Propagation means a service passes its own remaining time, minus a small reserve, to the services it calls, instead of starting a fresh timeout. Then the whole call tree gives up together, no work continues for a caller who's gone, and one slow dependency can't tie up threads and connections all the way up."

Also: gRPC has no default deadline, so a missing one is a bug. Set defaults in the service config.

### How does cancellation work in a streaming call?

"When the client cancels, or its deadline passes, gRPC sends a RST_STREAM and the server's handler is cancelled. In Python's asyncio API a streaming generator sees CancelledError at an await or GeneratorExit at a yield, so I put cleanup in `finally`. In Node the call emits 'cancelled', and in Go the context is done. My handlers stop the work: close the model stream, release locks, mark the step abandoned. It's the gRPC version of handling a closed browser tab."

### How are errors represented in gRPC? {core}

"Every call ends with a status: one of seventeen codes, from OK to UNAUTHENTICATED, plus a message, sent in HTTP/2 trailers. So 'not found' is NOT_FOUND, not an HTTP 404. I pick codes carefully because clients decide on retries from them: INVALID_ARGUMENT and FAILED_PRECONDITION never retry, UNAVAILABLE retries with backoff. For structured detail I use Google's rich error model: google.rpc.Status with details like BadRequest field violations or RetryInfo."

### Which status codes are safe to retry, and how do you configure retries?

"UNAVAILABLE is the standard retryable code: the server is down, overloaded, or the connection reset. RESOURCE_EXHAUSTED can be retried with backoff when it's a rate limit. DEADLINE_EXCEEDED and ABORTED only when the operation is idempotent, because the server may have done the work. I configure retries in the channel's service config per method, with max attempts, exponential backoff and the retryable codes, rather than writing loops around calls. Hedging is available for latency-sensitive idempotent reads. And retries always stay inside the overall deadline."

### Why is load balancing gRPC harder than load balancing HTTP/1.1 traffic? {deep}

"Because gRPC reuses one long-lived HTTP/2 connection for all calls. An L4 load balancer picks a backend per connection, so a client pins all its traffic to one pod, and new pods sit idle after a scale-up. You need per-request balancing: an L7 proxy like Envoy or a service mesh, Google's L7 load balancers, or client-side load balancing with a headless Service and the round_robin policy, or xDS. Setting a max connection age on servers also makes clients reconnect and redistribute over time."

### Can a browser call a gRPC service directly? {core}

"Not native gRPC: browsers don't give JavaScript the control over HTTP/2 framing and trailers that gRPC needs. The options are gRPC-Web through a proxy like Envoy, which supports unary and server streaming but not client or bidirectional streaming, Connect, which serves gRPC, gRPC-Web and a simple HTTP protocol from one server with typed TypeScript clients, or JSON transcoding through google.api.http annotations. Often the cleanest design is a backend-for-frontend: REST or SSE to the browser, gRPC behind it."

### How would you run a gRPC service on Cloud Run? {core}

"Build the container to serve cleartext HTTP/2 (h2c) on the PORT, deploy it, and enable end-to-end HTTP/2 with `--use-http2`. Google recommends that for gRPC, because streaming and metadata need HTTP/2 all the way to the container, while Google's front end terminates TLS. Each stream counts once against concurrency, and the request timeout, at most 60 minutes, caps a stream, so long streams need resume by sequence number. For private services, callers attach an ID token for the service URL in the authorization metadata."

**Your angle:** you have shipped containers through Artifact Registry to Cloud Run at Quantiphi. gRPC adds the HTTP/2 flag, h2c, and streaming timeouts.

### What are interceptors used for?

"They're gRPC's middleware, on client or server, for unary and streaming calls. I use them for cross-cutting concerns: validating auth tokens from metadata, attaching or propagating trace context, logging with request ids, metrics per method and status code, enforcing that every incoming call has a deadline, and client-side retries or circuit breaking. It keeps handlers focused on business logic."

### How do you authenticate gRPC calls?

"Transport first: TLS everywhere, mTLS between services, or let a service mesh handle mTLS and workload identity. Then per-call credentials in metadata: an OAuth or JWT access token as `authorization: Bearer`, validated in a server interceptor, with authorisation checked per method. On Google Cloud, a caller fetches an ID token for the target Cloud Run service's URL and sends it the same way, and IAM's invoker role decides who may call."

### How do you keep long-lived gRPC streams healthy? {deep}

"Four things. Keepalive pings, so idle streams survive NATs and proxies, with server and client agreeing on the allowed ping rate. Deadlines on streams too, or at least a maximum lifetime, because the platform will cut them anyway, as Cloud Run's request timeout does. Resume tokens or sequence numbers in the request, so a reconnect continues where it stopped. And max connection age on servers, so load rebalances. HTTP/2 flow control then handles backpressure per stream."

### How does flow control work in gRPC streaming? {deep}

"It comes from HTTP/2. Each stream and each connection has a receive window. The receiver grants more window as it consumes data, and a sender that runs out of window has to wait. So a slow consumer naturally slows the producer instead of filling memory. In application code that means honouring the write side's signals: in Node, `call.write()` returns false and you wait for 'drain'; in Python's asyncio API writes and yields await. Then I decide per stream whether to coalesce or drop updates for a slow consumer."

### REST, gRPC or GraphQL for an agent platform? {deep}

"A mix. gRPC for internal service-to-service traffic: orchestrator to tool workers, workers streaming events, typed contracts across Python and Node services. REST with OpenAPI for public and partner APIs and simple CRUD, because it's cacheable, debuggable and universally supported. SSE or WebSockets from a BFF to the browser for streams. GraphQL only if the front end really needs to aggregate many sources with flexible queries. I wouldn't add it just for fashion, because caching and authorisation get harder."

### How do you test gRPC services?

"Start the real server in-process on port 0 and call it with a real channel, as in the examples above, asserting on responses and status codes, including deadlines and cancellation. Keep handlers thin so the business logic is unit-tested without gRPC. Contract tests come from the .proto itself: `buf lint` and `buf breaking` in CI. For manual testing and smoke tests, `grpcurl` against a server with reflection enabled. For integration across services, test against containers in CI."

### How would you use gRPC streaming in the agent platform? {core}

"Between services. The orchestrator holds a bidirectional stream to each tool worker: it sends tasks, and the worker streams back progress, partial results and the final outcome, with cancellation propagating when a run is cancelled. A gateway subscribes to a run's events with server streaming and fans them out to browsers as SSE or WebSocket messages. Every event carries a sequence number, so after a reconnect the gateway asks for events after the last one it saw. Deadlines and cancellation flow from the user's request all the way down."

### What are gRPC health checking and server reflection?

"Health checking is a standard service, grpc.health.v1.Health, with Check and Watch methods returning SERVING or NOT_SERVING, optionally per service name. Kubernetes has native gRPC probes, and load balancers and meshes use it to route away from unhealthy pods. Reflection lets a server describe its own services and messages at runtime, so tools like grpcurl and Postman can call it without the .proto files. I enable reflection internally and keep it off on externally exposed endpoints."

## Coding problems

### Evolve a .proto contract without breaking old clients {medium core}

You own `RunEvent`. Version 1 has `seq`, `run_id`, a `status` enum and a `payload_json` string. For version 2 you must: remove `payload_json`, add a timestamp, add typed payloads (token, tool call, approval request), and add a new status `AWAITING_APPROVAL`. Write the new message so that old and new code can keep exchanging messages in both directions. Prove it with a test, including that protoc refuses to reuse the removed field number.

#### Hints

1. Removed fields: `reserved 4;` and `reserved "payload_json";`.
2. New fields get new numbers. A `oneof` of *new* fields is fine; moving existing fields into a `oneof` can lose data.
3. An old reader preserves an enum value it does not know. In Python it holds the plain number, and its generated enum has no name for it.

#### Solution

The new message keeps fields 1–3 untouched, retires 4, and adds 5–8. The test loads two snapshots of the contract side by side (different package names, only so both fit in one process) and crosses bytes between them.

```python
import importlib
import sys
import tempfile
from importlib.resources import files
from pathlib import Path

from grpc_tools import protoc

OLD = """
syntax = "proto3";
package snapshot.old;
enum RunStatus {
  RUN_STATUS_UNSPECIFIED = 0;
  RUN_STATUS_RUNNING = 1;
  RUN_STATUS_SUCCEEDED = 2;
}
message RunEvent {
  int64 seq = 1;
  string run_id = 2;
  RunStatus status = 3;
  string payload_json = 4;
}
"""
NEW = """
syntax = "proto3";
package snapshot.new;
import "google/protobuf/timestamp.proto";
enum RunStatus {
  RUN_STATUS_UNSPECIFIED = 0;
  RUN_STATUS_RUNNING = 1;
  RUN_STATUS_SUCCEEDED = 2;
  RUN_STATUS_AWAITING_APPROVAL = 3;           // appended
}
message TokenDelta { string text = 1; }
message ToolCall { string name = 1; string arguments_json = 2; }
message ApprovalRequest { string step_id = 1; string summary = 2; }
message RunEvent {
  reserved 4;                                 // payload_json is gone: its number and name are retired
  reserved "payload_json";
  int64 seq = 1;
  string run_id = 2;
  RunStatus status = 3;
  google.protobuf.Timestamp time = 5;
  oneof body {                                // typed payloads, all with new numbers
    TokenDelta token = 6;
    ToolCall tool_call = 7;
    ApprovalRequest approval = 8;
  }
}
"""
# A careless later edit that reuses number 4.
BROKEN = NEW.replace("package snapshot.new;", "package snapshot.broken;").replace(
    "google.protobuf.Timestamp time = 5;", "google.protobuf.Timestamp time = 5;\n  string notes = 4;"
)

well_known = str(files("grpc_tools") / "_proto")
with tempfile.TemporaryDirectory(dir=".") as tmp:
    def compile_proto(name: str, text: str) -> int:
        (Path(tmp) / f"{name}.proto").write_text(text)
        return protoc.main(["protoc", f"-I{tmp}", f"-I{well_known}", f"--python_out={tmp}", f"{tmp}/{name}.proto"])

    assert compile_proto("old", OLD) == 0 and compile_proto("new", NEW) == 0
    assert compile_proto("broken", BROKEN) != 0  # protoc rejects a reserved number
    sys.path.insert(0, tmp)
    old = importlib.import_module("old_pb2")
    new = importlib.import_module("new_pb2")

# New writer, old reader.
event = new.RunEvent(seq=9, run_id="run-7", status=new.RUN_STATUS_AWAITING_APPROVAL)
event.approval.step_id = "s3"
event.approval.summary = "Create SAP purchase order for $12,400"
event.time.FromJsonString("2026-10-14T09:30:00Z")
as_old = old.RunEvent.FromString(event.SerializeToString())
assert (as_old.seq, as_old.run_id) == (9, "run-7")
assert as_old.status == 3  # the old reader keeps the unknown enum number...
try:
    old.RunStatus.Name(as_old.status)  # ...but has no name for it: code must handle "unknown"
    raise AssertionError("old code should not know this value")
except ValueError:
    pass
# Unknown fields survive a round trip through an old service (a proxy, a queue consumer).
again = new.RunEvent.FromString(as_old.SerializeToString())
assert again.WhichOneof("body") == "approval" and again.approval.step_id == "s3"
assert again.time.ToJsonString() == "2026-10-14T09:30:00Z"

# Old writer, new reader: the retired field is skipped, and missing fields read as defaults.
legacy = old.RunEvent(seq=1, run_id="run-1", status=old.RUN_STATUS_RUNNING, payload_json='{"x": 1}')
as_new = new.RunEvent.FromString(legacy.SerializeToString())
assert as_new.status == new.RUN_STATUS_RUNNING and as_new.WhichOneof("body") is None
assert not as_new.HasField("time")
```

#### Follow-ups

- **How do you enforce this in a team?** `buf breaking --against` the main branch in CI, so a breaking change cannot merge unnoticed.
- **What about JSON clients (transcoding)?** JSON uses field names, so renaming *is* breaking for them. Treat names as part of the contract once a JSON gateway exists.
- **When is a v2 package justified?** When semantics change, not just shape. For example, `status` meaning something different. Serve v1 and v2 side by side and migrate clients.

### Propagate deadlines through a chain of services {medium}

A `Planner` service calls a `Tools` service. Implement `downstream_timeout(remaining)` that returns the remaining time minus a small reserve, raises `TimeoutError` when too little is left, and applies a default when the caller sent no deadline. Use it in `Planner.Plan`, so that when the client's deadline is short and the tool is slow, the whole chain fails fast with `DEADLINE_EXCEEDED` and the tool's work is cancelled.

#### Hints

1. In Python's asyncio API, `context.time_remaining()` returns the seconds left, or `None` if the client set no deadline.
2. Keep a reserve (tens of milliseconds up to about 100 ms) so the planner can still answer its own caller after the downstream call fails.
3. Pass the downstream error's code up with `context.abort(err.code(), ...)` instead of turning everything into INTERNAL.

#### Solution

The planner never gives the tool more time than its own caller is willing to wait. The tool's handler sees the cancellation, so no work continues for a caller who has gone.

```python
import asyncio
import importlib
import sys
import tempfile
import time
from pathlib import Path

import grpc
from grpc_tools import protoc

PROTO = """
syntax = "proto3";
package agents.v1;
service Planner { rpc Plan(PlanRequest) returns (PlanReply); }
service Tools { rpc RunTool(ToolRequest) returns (ToolReply); }
message PlanRequest { string goal = 1; }
message PlanReply { string summary = 1; }
message ToolRequest { string name = 1; double work_seconds = 2; }
message ToolReply { string output = 1; }
"""
with tempfile.TemporaryDirectory(dir=".") as tmp:
    (Path(tmp) / "agents.proto").write_text(PROTO)
    assert protoc.main(["protoc", f"-I{tmp}", f"--python_out={tmp}", f"--grpc_python_out={tmp}", f"{tmp}/agents.proto"]) == 0
    sys.path.insert(0, tmp)
    pb = importlib.import_module("agents_pb2")
    rpc = importlib.import_module("agents_pb2_grpc")

RESERVE = 0.1  # time kept back to handle a downstream failure and answer our own caller


def downstream_timeout(remaining: float | None, reserve: float = RESERVE, floor: float = 0.005) -> float:
    if remaining is None:
        return 10.0  # the caller set no deadline: apply our own default rather than waiting forever
    budget = remaining - reserve
    if budget < floor:
        raise TimeoutError("no time left for the downstream call")
    return budget


tool_calls = {"started": 0, "cancelled": 0}


class Tools(rpc.ToolsServicer):
    async def RunTool(self, request, context):
        tool_calls["started"] += 1
        try:
            await asyncio.sleep(request.work_seconds)
        except asyncio.CancelledError:
            tool_calls["cancelled"] += 1  # the propagated deadline reached us: stop working
            raise
        return pb.ToolReply(output=f"{request.name} done")


class Planner(rpc.PlannerServicer):
    def __init__(self, tools_stub) -> None:
        self.tools = tools_stub

    async def Plan(self, request, context):
        try:
            timeout = downstream_timeout(context.time_remaining())
        except TimeoutError:
            await context.abort(grpc.StatusCode.DEADLINE_EXCEEDED, "deadline too short to start")
        work = 0.01 if request.goal == "quick" else 5.0
        try:
            reply = await self.tools.RunTool(pb.ToolRequest(name="search", work_seconds=work), timeout=timeout)
        except grpc.aio.AioRpcError as err:
            await context.abort(err.code(), f"tool failed: {err.details()}")  # keep the real code
        return pb.PlanReply(summary=reply.output)


async def main() -> None:
    server = grpc.aio.server()
    port = server.add_insecure_port("localhost:0")
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    rpc.add_ToolsServicer_to_server(Tools(), server)
    rpc.add_PlannerServicer_to_server(Planner(rpc.ToolsStub(channel)), server)
    await server.start()
    try:
        planner = rpc.PlannerStub(channel)
        assert (await planner.Plan(pb.PlanRequest(goal="quick"), timeout=2)).summary == "search done"

        start = time.monotonic()
        try:
            await planner.Plan(pb.PlanRequest(goal="slow"), timeout=0.6)
            raise AssertionError("expected DEADLINE_EXCEEDED")
        except grpc.aio.AioRpcError as err:
            code, details = err.code(), err.details()
        assert code == grpc.StatusCode.DEADLINE_EXCEEDED and details.startswith("tool failed")
        assert time.monotonic() - start < 2  # nobody waited 5 seconds for the slow tool

        # The tool's handler was cancelled; poll, because cancellation arrives asynchronously.
        for _ in range(1000):
            if tool_calls["cancelled"]:
                break
            await asyncio.sleep(0.01)
        assert tool_calls == {"started": 2, "cancelled": 1}
    finally:
        await channel.close()
        await server.stop(grace=None)


assert downstream_timeout(1.0) == 1.0 - RESERVE
assert downstream_timeout(None) == 10.0
try:
    downstream_timeout(0.01)
    raise AssertionError("expected TimeoutError")
except TimeoutError:
    pass
asyncio.run(main())
```

Note that the client received the planner's own, explanatory `DEADLINE_EXCEEDED` ("tool failed: …"), because the reserve left the planner time to answer before the client's deadline.

#### Follow-ups

- **What if the planner calls three tools in parallel?** Each gets the same remaining budget. Use `asyncio.TaskGroup` so one failure cancels the siblings.
- **How does this look in Go or Java?** The context (Go) or `Context`/`Deadline` (Java) carries the deadline automatically into outgoing calls. In Python and Node you pass it explicitly, as here.
- **How do you find services that don't propagate?** Distributed tracing: a child span that outlives its parent's deadline is the smoking gun.

### Map gRPC status codes to HTTP and back {easy}

A REST gateway in front of gRPC services must turn gRPC status codes into HTTP status codes. A gRPC client behind a proxy may also receive plain HTTP errors from the proxy, which it must turn into gRPC codes. Write both mappings, plus `isRetryable(code, idempotent)`.

#### Hints

1. gRPC to HTTP follows Google's documented mapping: NOT_FOUND → 404, PERMISSION_DENIED → 403, UNAUTHENTICATED → 401, RESOURCE_EXHAUSTED → 429, UNAVAILABLE → 503, DEADLINE_EXCEEDED → 504, CANCELLED → 499, and so on.
2. The reverse mapping is **not** the inverse. gRPC's spec maps proxy errors coarsely: 401 → UNAUTHENTICATED, 403 → PERMISSION_DENIED, 404 → UNIMPLEMENTED, 429/502/503/504 → UNAVAILABLE, 400 → INTERNAL, anything else → UNKNOWN.
3. Use an `as const` object for the codes (Node runs these blocks by stripping types, so no `enum`).

#### Solution

Two tables and one rule. The asymmetry is the interesting part: an HTTP 404 from a proxy means "there is no such gRPC method here", not "the resource doesn't exist".

```ts
import assert from 'node:assert/strict';

export const Code = {
  OK: 0, CANCELLED: 1, UNKNOWN: 2, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, NOT_FOUND: 5,
  ALREADY_EXISTS: 6, PERMISSION_DENIED: 7, RESOURCE_EXHAUSTED: 8, FAILED_PRECONDITION: 9, ABORTED: 10,
  OUT_OF_RANGE: 11, UNIMPLEMENTED: 12, INTERNAL: 13, UNAVAILABLE: 14, DATA_LOSS: 15, UNAUTHENTICATED: 16,
} as const;
export type Code = (typeof Code)[keyof typeof Code];

const TO_HTTP: Record<Code, number> = {
  [Code.OK]: 200, [Code.CANCELLED]: 499, [Code.UNKNOWN]: 500, [Code.INVALID_ARGUMENT]: 400,
  [Code.DEADLINE_EXCEEDED]: 504, [Code.NOT_FOUND]: 404, [Code.ALREADY_EXISTS]: 409, [Code.PERMISSION_DENIED]: 403,
  [Code.RESOURCE_EXHAUSTED]: 429, [Code.FAILED_PRECONDITION]: 400, [Code.ABORTED]: 409, [Code.OUT_OF_RANGE]: 400,
  [Code.UNIMPLEMENTED]: 501, [Code.INTERNAL]: 500, [Code.UNAVAILABLE]: 503, [Code.DATA_LOSS]: 500,
  [Code.UNAUTHENTICATED]: 401,
};

export const grpcToHttp = (code: Code): number => TO_HTTP[code];

/** What a gRPC client should report when a proxy answers with plain HTTP instead of a gRPC status. */
export function httpToGrpc(status: number): Code {
  switch (status) {
    case 400:
      return Code.INTERNAL;
    case 401:
      return Code.UNAUTHENTICATED;
    case 403:
      return Code.PERMISSION_DENIED;
    case 404:
      return Code.UNIMPLEMENTED;
    case 429:
    case 502:
    case 503:
    case 504:
      return Code.UNAVAILABLE;
    default:
      return Code.UNKNOWN;
  }
}

/** UNAVAILABLE is always safe to retry; others only when repeating the call cannot do harm. */
export function isRetryable(code: Code, idempotent: boolean): boolean {
  if (code === Code.UNAVAILABLE) return true;
  const ifIdempotent: Code[] = [Code.DEADLINE_EXCEEDED, Code.ABORTED, Code.RESOURCE_EXHAUSTED];
  return idempotent && ifIdempotent.includes(code);
}

assert.equal(grpcToHttp(Code.NOT_FOUND), 404);
assert.equal(grpcToHttp(Code.RESOURCE_EXHAUSTED), 429);
assert.equal(grpcToHttp(Code.FAILED_PRECONDITION), 400);
assert.equal(grpcToHttp(Code.DEADLINE_EXCEEDED), 504);
assert.equal(httpToGrpc(404), Code.UNIMPLEMENTED); // not NOT_FOUND: the proxy didn't find a gRPC method
assert.equal(httpToGrpc(503), Code.UNAVAILABLE);
assert.equal(httpToGrpc(418), Code.UNKNOWN);
assert.ok(isRetryable(Code.UNAVAILABLE, false));
assert.ok(!isRetryable(Code.DEADLINE_EXCEEDED, false)); // the server may have done the work already
assert.ok(isRetryable(Code.DEADLINE_EXCEEDED, true));
assert.ok(!isRetryable(Code.INVALID_ARGUMENT, true)); // retrying a bad request just fails again
// Every code has an HTTP mapping.
assert.equal(Object.values(Code).filter((c) => grpcToHttp(c) === undefined).length, 0);
```

Complexity: O(1) per lookup.

#### Follow-ups

- **Where is the official table?** gRPC's `google.rpc.Code` definitions document the HTTP equivalents, and gRPC's `http-grpc-status-mapping` document covers the reverse direction.
- **What about the error message?** Return a problem-details JSON body (RFC 9457) with the gRPC code name and the safe part of the message. Don't leak internal details from INTERNAL errors.

### Retry a call within an overall deadline {medium}

Write `callWithRetry(fn, opts)` in TypeScript. It calls `fn(attemptTimeoutMs)` and retries errors whose `code` is in a retryable set, with full-jitter exponential backoff, up to `maxAttempts`. It must never exceed an **overall** deadline: each attempt gets only the time that is left, and it gives up without sleeping when the backoff would pass the deadline. Make `now`, `sleep` and `random` injectable so the test runs instantly.

#### Hints

1. Compute `deadline = now() + deadlineMs` once. Before each attempt, `remaining = deadline - now()`; if it is ≤ 0, stop.
2. Non-retryable errors and the last attempt rethrow immediately.
3. If `now() + delay >= deadline`, sleeping is pointless: rethrow the last error.

#### Solution

Two budgets work together: the number of attempts, and the time. The overall deadline is what protects the caller.

```ts
import assert from 'node:assert/strict';

type RpcError = Error & { code: number };
type Options = {
  deadlineMs: number;
  maxAttempts: number;
  retryable: ReadonlySet<number>;
  baseMs?: number;
  capMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

const UNAVAILABLE = 14;
const INVALID_ARGUMENT = 3;
const DEADLINE_EXCEEDED = 4;

const rpcError = (code: number, message: string): RpcError => Object.assign(new Error(message), { code });

export async function callWithRetry<T>(fn: (attemptTimeoutMs: number) => Promise<T>, opts: Options): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const baseMs = opts.baseMs ?? 100;
  const capMs = opts.capMs ?? 2_000;
  const deadline = now() + opts.deadlineMs;

  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) throw rpcError(DEADLINE_EXCEEDED, 'deadline exceeded before attempt');
    try {
      return await fn(remaining); // the attempt may use only what is left of the overall budget
    } catch (err) {
      const code = (err as RpcError).code;
      const lastAttempt = attempt + 1 >= opts.maxAttempts;
      if (!opts.retryable.has(code) || lastAttempt) throw err;
      const delay = Math.floor(random() * Math.min(capMs, baseMs * 2 ** attempt));
      if (now() + delay >= deadline) throw err; // no time for another try: fail now, not later
      await sleep(delay);
    }
  }
}

// A fake clock: sleeping just moves time forward.
let t = 0;
const clock = { now: () => t, sleep: async (ms: number) => void (t += ms), random: () => 1 };
const retryable = new Set([UNAVAILABLE]);

// Fails twice with UNAVAILABLE, then succeeds; each attempt sees a shrinking budget.
const budgets: number[] = [];
let calls = 0;
const result = await callWithRetry(
  async (budget) => {
    budgets.push(budget);
    t += 10; // each attempt takes 10 ms
    if (++calls < 3) throw rpcError(UNAVAILABLE, 'overloaded');
    return 'ok';
  },
  { deadlineMs: 1_000, maxAttempts: 5, retryable, ...clock },
);
assert.equal(result, 'ok');
assert.deepEqual(budgets, [1000, 890, 680]); // 1000; -10 -100 backoff; -10 -200 backoff

// Non-retryable: thrown at once.
t = 0;
calls = 0;
await assert.rejects(
  callWithRetry(async () => { calls++; throw rpcError(INVALID_ARGUMENT, 'bad run id'); }, { deadlineMs: 1_000, maxAttempts: 5, retryable, ...clock }),
  /bad run id/,
);
assert.equal(calls, 1);

// The deadline wins over maxAttempts: it stops without sleeping past the budget.
t = 0;
calls = 0;
await assert.rejects(
  callWithRetry(async () => { calls++; t += 50; throw rpcError(UNAVAILABLE, 'down'); }, { deadlineMs: 400, maxAttempts: 10, retryable, ...clock }),
  /down/,
);
// Attempt 1 runs 0-50 ms, then sleeps 100. Attempt 2 runs 150-200 ms. The next backoff (200 ms)
// would reach the 400 ms deadline, so it gives up at 200 ms instead of sleeping for nothing.
assert.equal(calls, 2);
assert.equal(t, 200);
```

Complexity: O(attempts).

#### Follow-ups

- **How do you avoid a retry storm when a whole service is down?** A retry budget (for example, retries at most 10% of calls) or a circuit breaker on top. gRPC's built-in retry policy also has retry throttling for this reason.
- **Should the server know it is a retry?** gRPC sends a `grpc-previous-rpc-attempts` header on transparent retries. For non-idempotent operations, send an idempotency key so the server can deduplicate.
