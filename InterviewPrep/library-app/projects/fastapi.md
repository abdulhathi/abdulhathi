---
title: "DocIntake: a FastAPI service for document extraction and human review"
summary: A production-style FastAPI backend that ingests documents, extracts fields through a pluggable extractor, validates them with Pydantic as a quality gate, queues low-confidence results for human review, and exposes a secure, tested, documented API.
time: 4–5 days of evenings
---

## What you will build

DocIntake is a public, generic version of the pattern you know from document-processing work: upload a document (an invoice or a receipt works well, using public sample files), extract structured fields, validate them, and route anything doubtful to a human reviewer before it is "submitted". It is your own code from scratch, built only on public data; it is not a copy of any employer's system.

- `POST /v1/documents` uploads a PDF or image and returns `202 Accepted` with a document id.
- A background worker extracts fields with a pluggable `Extractor`: a rules-based extractor that works offline, and an optional LLM extractor (for example the Claude API) behind a feature flag.
- Extracted data is validated with Pydantic models (types, required fields, cross-field rules such as total = sum of line items). Valid and confident results are auto-approved; the rest go to a review queue.
- `GET /v1/review-queue`, `POST /v1/documents/{id}/corrections` and `POST /v1/documents/{id}/approve` support the human review step, with an audit log of every change.
- OAuth2 password flow with JWTs, and two roles: `reviewer` and `admin`.

## What it proves

- FastAPI in depth: routers, dependencies (including `yield` dependencies), lifespan, background work, exception handlers, OpenAPI
- Pydantic 2 as an API contract and a data-quality gate (validators, discriminated unions, `extra="forbid"`)
- Async SQLAlchemy 2 with PostgreSQL, Alembic migrations, transactions and idempotent writes
- Security: OAuth2 + JWT, role-based authorisation, object-level checks
- API design: `202` + a status resource for long-running work, cursor pagination, RFC 9457 problem details
- Testing with pytest and `httpx.AsyncClient`, dependency overrides, and a real PostgreSQL in CI
- Keywords: Python, FastAPI, Pydantic, SQLAlchemy, PostgreSQL, REST API, JWT, Docker, CI/CD, human-in-the-loop

## Architecture

```text
client ──► FastAPI (uvicorn)
             ├─ /v1/auth        OAuth2 password flow → JWT
             ├─ /v1/documents   upload → 202 + status URL
             ├─ /v1/review-queue, corrections, approve   (role: reviewer)
             └─ /v1/admin/...   (role: admin)
                   │
                   ▼
        PostgreSQL ◄────── worker (same codebase, `python -m docintake.worker`)
   documents, fields,        claims jobs with FOR UPDATE SKIP LOCKED
   reviews, audit_log        → Extractor (rules | LLM) → Pydantic validation
                             → auto-approve or queue for review
   uploads stored on local disk in dev; S3/GCS-compatible storage behind an interface
```

## Milestones

### Milestone 1: skeleton, settings and health

- `uv` project, FastAPI app factory, `pydantic-settings` config, structured logging, `/healthz` and `/readyz`.
- Docker Compose for readers (API, worker, PostgreSQL). Docker Hub pulls currently fail on this Mac, so develop against your local Homebrew PostgreSQL and run the app with `uv run fastapi dev`.

Done when: `GET /readyz` checks the database, and CI runs ruff, mypy and pytest.

### Milestone 2: data model and uploads

- SQLAlchemy 2 async models and Alembic migrations: `documents`, `extracted_fields`, `reviews`, `audit_log`.
- `POST /v1/documents` validates type and size, stores the file and creates a `pending` row; returns `202` with `Location: /v1/documents/{id}`.
- `GET /v1/documents/{id}` returns status and fields; `GET /v1/documents` uses cursor pagination.

Done when: integration tests upload a sample, poll the status resource, and page through results.

### Milestone 3: worker, extraction and the validation gate

- A worker that claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, retries with backoff, and marks poison documents as `failed`.
- `Extractor` protocol; a rules-based implementation (regular expressions over text extracted with `pypdf`) and an optional LLM implementation that returns JSON validated by the same Pydantic model.
- Validation results decide: `approved` (valid and confident) or `needs_review`.

Done when: tests cover a valid document, an invalid one, a crash mid-job (the job is retried), and the same document submitted twice (idempotent).

### Milestone 4: auth and the review workflow

- OAuth2 password flow, JWT access tokens, password hashing, `reviewer` and `admin` roles as dependencies.
- Review endpoints with object-level checks; every correction and approval writes to `audit_log` with who, what and when.
- Errors as RFC 9457 `application/problem+json`.

Done when: tests prove a reviewer can correct and approve, a user without the role gets 403, and an unknown document gets 404 (not a leak).

### Milestone 5: polish and deploy

- OpenAPI tags, examples and descriptions; a short `docs/` page with sequence diagrams.
- Optional: deploy the API to a free tier (Cloud Run, Fly.io or Render) with a managed PostgreSQL.

Done when: the README links a live `/docs` page (or a recorded demo GIF) and CI is green.

## Repository layout

```text
docintake/
├─ src/docintake/
│  ├─ main.py            app factory, lifespan, routers
│  ├─ settings.py        pydantic-settings
│  ├─ api/{auth,documents,review,admin}.py
│  ├─ domain/{models.py,schemas.py,validation.py}
│  ├─ extract/{base.py,rules.py,llm.py}
│  ├─ db/{session.py,repositories.py}
│  └─ worker.py
├─ migrations/ (alembic)
├─ tests/{unit,integration}/
├─ samples/              public sample invoices
├─ docker-compose.yml, Dockerfile
└─ .github/workflows/ci.yml
```

## Tests and CI

- Unit: validation rules (cross-field checks), extractor parsing, JWT helpers.
- Integration: `httpx.AsyncClient` against the app with a real PostgreSQL database; dependency overrides for the clock and the extractor.
- Worker: claim, retry and idempotency tests using two concurrent sessions.
- CI: a PostgreSQL service container in GitHub Actions (services pull from Docker Hub fine on GitHub's runners), `alembic upgrade head`, then `pytest --cov`.

## README checklist

- Badges: CI, coverage, Python version
- Architecture diagram and the document state machine (`pending → extracting → approved | needs_review → approved | rejected`)
- Demo GIF: upload → review queue → correct → approve
- How to run locally without Docker (Homebrew PostgreSQL) and with Docker Compose
- Design decisions: why `202` + polling, why Pydantic as the quality gate, why SKIP LOCKED instead of a separate queue for v1
- What you would do next (a message queue, object storage, OpenTelemetry)

## Stretch goals

- Server-Sent Events on `GET /v1/documents/{id}/events` for live status
- Per-field confidence and a reviewer UI in React
- Replace the database queue with Redis Streams or Cloud Tasks and compare

## Talking about it in an interview

**60-second walkthrough:** "DocIntake is a FastAPI service for document extraction with human review. Uploads return 202 with a status resource, and a worker claims jobs with SKIP LOCKED, extracts fields through a pluggable extractor, and validates them with Pydantic models that act as a quality gate. Anything invalid or low-confidence goes to a review queue; reviewers correct and approve, and every change is audited. It has OAuth2 with role-based access, async SQLAlchemy with Alembic, and integration tests against real PostgreSQL in CI."

- **Why not FastAPI's BackgroundTasks?** They run in the web process after the response; if the process dies the work is lost. A durable job row with a worker survives restarts and retries.
- **How do you stop two workers processing the same document?** `FOR UPDATE SKIP LOCKED` claims a row atomically; the update that finishes a job also checks the attempt number, so a stale worker cannot overwrite a newer result.
- **400 or 422 for bad input?** FastAPI returns 422 for validation errors by default; I keep that for schema errors and use 409 for state conflicts, such as approving a document twice.

## LinkedIn post template

> New portfolio project: DocIntake, a FastAPI service for document extraction with a human-review step.
> Uploads are processed by a worker, validated with Pydantic as a quality gate, and anything doubtful goes to a review queue with a full audit trail.
> Built with FastAPI, async SQLAlchemy, PostgreSQL, OAuth2/JWT and pytest; CI runs integration tests against a real database.
> Code and demo: <repo link> #Python #FastAPI #PostgreSQL

## Resume bullet

Built DocIntake, a FastAPI document-extraction service with a Pydantic validation gate, a SKIP LOCKED job worker, a human-review workflow with audit logging, and OAuth2/JWT role-based access, tested against PostgreSQL in CI.
