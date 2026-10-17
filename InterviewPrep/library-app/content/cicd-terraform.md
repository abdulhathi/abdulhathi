---
title: CI/CD and Terraform
goal: Describe a pipeline that tests, builds once and ships safely to Cloud Run with canaries and rollbacks, explain Terraform's model (state, plan, apply, modules), and design how a webhook or an agent orchestrator triggers Terraform runs with guardrails.
minutes: 45
---

Every senior role expects you to ship code safely through CI/CD: build once, promote the same artefact, release
gradually and roll back fast. Many also ask about infrastructure as code, and platform teams increasingly ask how
automation tools such as Terraform are invoked programmatically, from webhooks or backend orchestrators. On an agentic
platform that is concrete: an agent decides a tenant needs a new queue or a sandbox environment, and the backend has to
run Terraform for it safely. Expect pipeline questions, safe-release questions, Terraform basics, and one design
question about triggering infrastructure changes from code.

**Your angle, honestly:** you automated CI/CD with **GitHub Actions and AWS CodePipeline** at Medidata (with test
coverage via NUnit, Cypress and Cucumber), list **Azure DevOps** among your tools, and deployed Docker images through
Artifact Registry to **Cloud Run across Dev, SIT and UAT** at Quantiphi. **Terraform is not on your resume.** Say so,
show you understand the model and the risks, and connect the "invoked by an orchestrator" part to your agentic HITL
work: approvals before an agent acts are exactly the guardrail Terraform automation needs.

## The pipeline

```text
pull request ──► lint, type-check, unit tests, build, contract tests            (minutes; required to merge)
merge to main ──► build ONE image (commit SHA) ──► scan ──► push to Artifact Registry
              ──► deploy to dev ──► integration + E2E tests ──► staging ──► production
                     same image digest at every step; only configuration and secrets differ
production    ──► new revision with 0% traffic + tag ──► smoke tests on the tag URL
              ──► canary 5% → 25% → 50% → 100%, watching error rate, latency, time to first token
              ──► automatic rollback (shift traffic back) if the canary is worse than the baseline
```

Principles to say out loud:

- **Build once, promote the same artefact.** The image tested in staging is the image in production. Rebuilding per
  environment can pull different dependencies.
- **Fast feedback:** pull-request checks finish in minutes; slow suites run after merge, in parallel.
- **Gates:** required reviews and passing checks before merge; in regulated organisations, sign-off in SIT or UAT and a
  manual approval before production.
- **No long-lived cloud keys in CI:** CI authenticates with a short-lived OIDC token per job, through **Workload Identity
  Federation** on Google Cloud, federated credentials on Azure, or an IAM role assumed with web identity on AWS. Cloud
  Build uses its own service account.
- **Releasing is not deploying:** feature flags turn features on per tenant after the code is live.
- **Rollback is a traffic change:** revisions are immutable, so going back takes seconds.
- **Everything is reviewed:** application code, pipeline definitions and infrastructure code go through pull requests.

### GitHub Actions: test, build once, canary on Cloud Run

```yaml
name: chat-api
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write            # lets the job request an OIDC token for Workload Identity Federation

env:
  REGION: us-central1
  SERVICE: chat-api
  IMAGE: us-central1-docker.pkg.dev/acme-platform/apps/chat-api

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm test
      - uses: actions/setup-python@v7
        with: { python-version: "3.13", cache: pip }
      - run: pip install -r services/orchestrator/requirements-dev.txt && pytest -q services/orchestrator

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production  # protection rules: required reviewers approve before this job runs
    steps:
      - uses: actions/checkout@v7
      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v3
      - name: Build and push one image, tagged with the commit
        run: |
          gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
          docker build -t "$IMAGE:$GITHUB_SHA" .
          docker push "$IMAGE:$GITHUB_SHA"
      - name: Deploy a tagged revision that receives no traffic
        run: gcloud run deploy "$SERVICE" --image="$IMAGE:$GITHUB_SHA" --region="$REGION" --no-traffic --tag=canary
      - name: Smoke tests against the canary URL
        run: |
          URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format=json \
            | jq -r '.status.traffic[] | select(.tag=="canary") | .url')
          npx playwright install --with-deps chromium
          BASE_URL="$URL" npx playwright test --grep @smoke
      - name: Send 5% of traffic to the canary
        run: gcloud run services update-traffic "$SERVICE" --region="$REGION" --to-tags=canary=5
```

A later job (or Cloud Deploy, which supports canary releases to Cloud Run and GKE) compares the canary's metrics with
the stable revision, then promotes with `--to-latest` or rolls back. The coding problem below writes that decision.

### Release strategies

| Strategy | How | Rollback | Use it for |
|---|---|---|---|
| Rolling | Replace instances a few at a time (the Kubernetes default) | Roll forward or undo the rollout | Low-risk changes |
| Blue-green | Stand up the new version beside the old, switch all traffic at once | Switch back instantly | An all-at-once cut-over that must be reversible |
| Canary | Send a small percentage to the new version, compare metrics, ramp up | Move the percentage back to 0 | Risky changes |
| Feature flags | Ship code dark, turn features on per user or tenant | Turn the flag off, no deploy | Separating release from deploy |

### Safe database changes: expand and contract

A canary means old and new code run against the same database at the same time, so schema changes must be backward
compatible:

1. **Expand:** add the new column or table (nullable or with a default). Old code ignores it.
2. **Deploy code** that writes both shapes and reads the new one with a fallback; backfill in batches.
3. **Contract:** once no running revision uses the old column, drop it in a later release.

Never rename a column in place or add a `NOT NULL` column without a default in the same release as the code that
needs it.

## Terraform in one page

Terraform describes infrastructure declaratively in HCL. `plan` compares the configuration with the **state** (what
Terraform believes exists) and the real resources, and shows the diff; `apply` makes the changes.

| Concept | Meaning | Practice |
|---|---|---|
| Provider | Plugin that talks to an API (`hashicorp/google`) | Pin a version range in `required_providers` |
| Resource / data source | Something Terraform manages / something it only reads | One resource per real object |
| Variables, outputs, locals | Inputs, results, computed values | Validate inputs with `validation` blocks |
| State | The mapping from resources in code to real IDs, plus their attributes | Remote backend (a GCS bucket with versioning); locking prevents two applies at once |
| Plan / apply | Preview / execute | In automation: `plan -out=tfplan`, review, then `apply tfplan` (applies exactly that plan, no prompt) |
| Module | A reusable package of resources | Versioned modules for "a Cloud Run service with its service account and secrets" |
| Environments | Separate state per environment | A directory (and backend prefix) per environment; workspaces for identical copies |
| Drift | Real infrastructure changed outside Terraform | `plan` in a scheduled job detects it; fix in code, never by hand |
| `import`, `moved`, `removed` blocks | Adopt existing resources, rename without destroying, stop managing without deleting | Refactor safely in code review |
| `lifecycle` | `prevent_destroy`, `ignore_changes`, `create_before_destroy` | Protect databases; let CI own the image tag |

The cloud-native alternatives are **CloudFormation** or the **CDK** on AWS and **Bicep** on Azure; Terraform works on all
three clouds. Terraform moved to a source-available licence (BUSL) in 2023; **OpenTofu** is the open-source fork with
the same language. **HCP Terraform** (formerly Terraform Cloud) runs plans and applies remotely with an API, and Google Cloud's
**Infrastructure Manager** runs Terraform for you on Cloud Build.

### Example: the resources behind one service

```hcl
terraform {
  required_version = ">= 1.10"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
  backend "gcs" {
    bucket = "acme-platform-tfstate"   # versioned bucket; the GCS backend locks state during runs
    prefix = "platform/prod"
  }
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "image" {
  type        = string
  description = "Initial image; CI deploys new images afterwards"
}

resource "google_service_account" "orchestrator" {
  account_id   = "orchestrator"
  display_name = "Agent orchestrator"
}

resource "google_secret_manager_secret" "erp_api_key" {
  secret_id = "erp-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "orchestrator_reads_erp_key" {
  secret_id = google_secret_manager_secret.erp_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.orchestrator.email}"
}

resource "google_pubsub_topic" "run_events" {
  name = "run-events"
}

resource "google_pubsub_topic" "run_events_dead_letter" {
  name = "run-events-dead-letter"
}

# The Pub/Sub service agent also needs publisher on the dead-letter topic and subscriber on this subscription.
resource "google_pubsub_subscription" "run_events_worker" {
  name                    = "run-events-worker"
  topic                   = google_pubsub_topic.run_events.id
  ack_deadline_seconds    = 60
  enable_message_ordering = true
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.run_events_dead_letter.id
    max_delivery_attempts = 10
  }
}

resource "google_cloud_run_v2_service" "orchestrator" {
  name     = "orchestrator"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account                  = google_service_account.orchestrator.email
    timeout                          = "3600s"
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = 1
      max_instance_count = 40
    }
    containers {
      image = var.image
      env {
        name = "ERP_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.erp_api_key.secret_id
            version = "3"                  # pinned: env vars are resolved when an instance starts
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]   # the deploy pipeline owns the running image
  }
}
```

The `ignore_changes` line settles a classic conflict: Terraform owns the service's configuration, the CI pipeline owns
which image runs. Without it, the next `terraform apply` would roll production back to the image in the variable.

## Invoking Terraform programmatically

On an agent platform the trigger might be a webhook from a ticketing system, a GitHub event, or an agent's tool call
("provision a sandbox for tenant X"). The pattern is the same:

```text
webhook / agent tool call
   │  1. verify the caller (HMAC signature or OIDC token), validate input against an allow-list
   ▼
orchestrator API ──► record the request with an idempotency key ──► enqueue (Cloud Tasks / Pub/Sub)
   ▼
runner (Cloud Build job, HCP Terraform run, Infrastructure Manager, or a container running the CLI)
   │  2. terraform init / plan -out=tfplan -input=false  (state lock held)
   │  3. terraform show -json tfplan  → policy check (no deletes of protected resources, cost limits)
   ▼
human approval (HITL) for anything destructive or expensive ──► 4. terraform apply tfplan
   ▼
5. outputs and status back to the orchestrator ──► run events to the UI ──► audit log
```

| Runner | How you trigger it | Good for |
|---|---|---|
| **Cloud Build** | Build trigger via the API (`projects.locations.builds.create`) or a **webhook trigger** URL; runs a `cloudbuild.yaml` with the Terraform image | GCP-native pipelines, private pools, its own service account |
| **HCP Terraform** | `POST /api/v2/runs` with a workspace id; `plan-only` or `auto-apply` attributes; run tasks and policy checks | Teams already using HCP Terraform, built-in approvals and policy |
| **Infrastructure Manager** | `gcloud infra-manager` or its API to create or update a deployment from a Git repo or bucket | Google-managed Terraform runs with stored revisions |
| **Atlantis** | Pull-request comments (`atlantis plan`, `atlantis apply`) via repository webhooks | Pull-request-driven workflows |
| **CLI in a worker** | Your worker shells out to `terraform` with `-input=false`, `-no-color`, and reads `-json` output | Full control; you build locking, logs and isolation yourself |

### A Cloud Build job that plans for a tenant

```yaml
steps:
  - id: init
    name: hashicorp/terraform:1.16.6
    dir: infra/tenant-sandbox
    args: ["init", "-input=false"]
  - id: plan
    name: hashicorp/terraform:1.16.6
    dir: infra/tenant-sandbox
    args: ["plan", "-input=false", "-lock-timeout=5m", "-out=tfplan", "-var=tenant_id=${_TENANT_ID}"]
  - id: export-plan
    name: hashicorp/terraform:1.16.6
    dir: infra/tenant-sandbox
    entrypoint: sh
    args: ["-c", "terraform show -json tfplan > plan.json"]
  - id: upload-plan
    name: gcr.io/google.com/cloudsdktool/cloud-sdk:slim
    dir: infra/tenant-sandbox
    entrypoint: gcloud
    args: ["storage", "cp", "tfplan", "plan.json", "gs://acme-tf-plans/${BUILD_ID}/"]
# A user-specified service account needs an explicit logging option (or a logs bucket).
serviceAccount: projects/acme-platform/serviceAccounts/tf-sandbox-planner@acme-platform.iam.gserviceaccount.com
options:
  logging: CLOUD_LOGGING_ONLY
```

The orchestrator starts this build through the Cloud Build API with `_TENANT_ID` as a substitution, reads `plan.json`
from the bucket, runs its policy check, asks for approval if needed, and starts a second build that applies the saved
plan.

### Guardrails when code or an agent triggers infrastructure

- **Never let an LLM write HCL that gets applied.** The agent picks from **allow-listed modules** and fills
  **validated variables** (tenant id, size from an enum). The modules are reviewed code.
- **Plan, check, then apply the same plan.** Save the plan with `-out`, apply that file, and reject it if the state
  moved on in between.
- **Policy as code:** inspect the JSON plan (OPA/Conftest, Sentinel in HCP Terraform, or your own checks): no deletes
  of protected types, no public buckets, region and cost limits.
- **Human approval** for destroys, replacements and anything over a cost threshold, by someone other than the requester.
- **Least privilege per runner:** the sandbox planner's service account can touch only sandbox projects; plan and apply
  identities can differ.
- **State is sensitive:** it can contain secrets. Keep it in a locked-down, versioned bucket; prefer referencing Secret
  Manager over passing secret values. Recent Terraform versions add ephemeral values and write-only arguments so
  secrets need not be stored in state.
- **Serialise per state:** one run per workspace at a time (the backend lock enforces it; queue requests instead of
  failing them), idempotency keys on the trigger, timeouts, and a full audit trail.

## Interview questions

### What does a good CI/CD pipeline look like? {core}

On every pull request: lint, type-check, unit and contract tests and a build, all in a few minutes, plus code review.
On merge: build one image tagged with the commit, scan it, push it to the registry, deploy to dev and run integration
and E2E tests, then promote the same image through staging (or SIT and UAT, with sign-off where the organisation needs
it) to production. In production it goes out as a
tagged revision with no traffic, gets smoke-tested on its own URL, then a canary with automatic comparison against the
stable revision and rollback by shifting traffic. CI authenticates with Workload Identity Federation, never stored keys.

**Your angle:** GitHub Actions and AWS CodePipeline at Medidata; Dev, SIT and UAT promotion on Cloud Run at Quantiphi.

### Why build once and promote the same artefact? Tags or digests? {core}

If you rebuild per environment, production runs something you never tested: a dependency or base image can change
between builds. So the pipeline builds one image per commit and promotes it unchanged; only configuration and secrets
differ per environment. Tags are mutable, so the pipeline records and deploys the digest (Cloud Run also resolves a tag
to a digest when it creates a revision). Rollback then means redeploying an exact, known image.

### How should CI authenticate to the cloud? {core}

With OIDC federation, not long-lived keys stored as CI secrets, which leak and rarely get rotated. GitHub (or another CI)
issues a short-lived signed token for each job; the cloud trusts tokens from that specific repository (and branch or
environment) and exchanges them for short-lived credentials. On Google Cloud that is Workload Identity Federation,
optionally impersonating a deploy service account; on Azure, federated credentials on an Entra app or managed identity;
on AWS, an IAM role assumed with web identity. Nothing long-lived is stored in CI, and the deploy identity has only the
roles it needs, such as Cloud Run developer on specific services and Artifact Registry writer on one repository.

### How do you ship a risky change safely to production? {core}

Deploy it dark: a new revision with no traffic and its own tagged URL, smoke-tested there. Then a canary: 5% of traffic,
comparing error rate, latency and the product's key metric (time to first token, run success rate) against the stable
revision, stepping up only while it holds, rolling back automatically if it does not. Behind that, a feature flag so
the risky behaviour can be switched off per tenant without a deploy, and backward-compatible database changes so a
rollback is always possible.

### Rolling, blue-green, canary or feature flags: when do you use each? {core}

**Rolling** is the default on Kubernetes and fine for low-risk changes. **Blue-green** when you need an instant,
all-at-once switch and instant rollback, for example with a database-compatible release. **Canary** for risky changes:
send 5% of traffic, compare error rate and latency with the old version, then ramp up; Cloud Run revisions with traffic
splitting make this easy. **Feature flags** separate deploying code from releasing a feature, so you can turn a feature
on per tenant or off in seconds without a deploy.

### Feature flags or deployments: what is the difference?

A deployment changes what code is running; a feature flag changes what that code does, at runtime, for a chosen
audience. Flags decouple release from deploy: code ships dark, the feature turns on for internal users, then a tenant,
then everyone, and turns off in seconds if it misbehaves. The cost is complexity: flags need owners and clean-up
dates, and both paths need tests while the flag exists.

### How do you handle database migrations in continuous delivery? {core}

Expand and contract. First a backward-compatible migration: add the column or table, nullable or with a default. Then
the code that writes both shapes and reads the new one, plus a batched backfill. Only when no running version needs the
old shape, a later migration removes it. Migrations run as a separate pipeline step (a Cloud Run job, for example)
before the new code takes traffic, are tested against a production-like copy, and never lock big tables for long.

### Trunk-based development or GitFlow? Merge or rebase?

Trunk-based: short-lived branches merged to main at least daily, main always releasable, unfinished work behind flags.
It fits continuous delivery, keeps merges small and makes CI meaningful. GitFlow's long-lived develop and release
branches suit scheduled releases but cause painful merges. On merging: a **merge commit** preserves exact history,
**rebase** gives a linear history but rewrites commits (never rebase shared branches), and **squash merge** turns a pull
request into one clean commit on main. Either way, main is protected by required reviews and passing checks.

### How do you test a pull request in a realistic environment? {deep}

Deploy the pull request's image as a tagged Cloud Run revision with no traffic (or an ephemeral environment), run the
E2E suite against that URL with seeded test data, and post the URL on the pull request for reviewers. Tear it down when
the pull request closes. Shared dependencies, such as the database, use a separate schema or test tenant so preview
environments cannot corrupt each other.

### Your repository holds a React app, Node services and Python services. How do you keep CI fast? {deep}

Build and test only what changed and what depends on it, using the workspace graph (npm workspaces, Turborepo or Nx
for the JavaScript side, path filters for Python). Cache dependencies and build outputs, run jobs in parallel, shard
E2E tests, and keep a small smoke suite on every pull request with the full suite after merge. Each service has its own
image and deploy job, so one service's change does not redeploy everything.

### What is Terraform, and why is the state file important? {core}

Terraform is infrastructure as code: I declare resources in HCL, `plan` shows what would change, and `apply` makes it
so, through providers such as the Google provider. The state file maps each resource in the code to the real object and
stores its attributes, so Terraform knows what to update or destroy. It must be remote and locked so two people or
pipelines cannot apply at once (the GCS backend does both), versioned so it can be recovered, and protected because it
can contain secrets.

### Plan and apply in automation: what do you do differently?

Run non-interactively (`-input=false`, `TF_IN_AUTOMATION`), save the plan with `-out=tfplan`, export it with
`terraform show -json` for review and policy checks, and apply exactly that file, which needs no prompt. Use
`-detailed-exitcode` to tell "no changes" (0) from "changes" (2) from errors (1), and a lock timeout so a queued run
waits instead of failing. Plans and logs are stored for audit.

### How do you structure Terraform for several environments? {deep}

Reusable, versioned modules for building blocks (a Cloud Run service with its service account and secret access, a
Pub/Sub topic with dead-lettering), and a small root configuration per environment that calls them with that
environment's values and has its own state (a separate directory and backend prefix, often a separate project).
Workspaces suit identical copies, such as one per tenant sandbox, but not environments that differ in shape. Changes
flow through pull requests that show the plan.

### What is drift, and how do you handle it? {deep}

Drift is when real infrastructure no longer matches the code, usually because someone changed it in the console or
another tool manages the same resource. A scheduled `plan` detects it. The fix is in code: either bring the change into
the configuration or let Terraform revert it. To adopt resources created by hand, use `import` blocks; to rename or
move resources in code without destroying them, `moved` blocks.

### Terraform manages your Cloud Run service, but CI deploys new images. How do they not fight? {deep}

Split ownership explicitly. Terraform owns the service's configuration: service account, scaling, secrets, ingress. The
deploy pipeline owns the image. In Terraform I add `lifecycle { ignore_changes = [template[0].containers[0].image] }`,
so `apply` does not roll production back to an old image. The alternative is to have the pipeline pass the image to
Terraform and deploy only through Terraform, which is clean but slower for frequent releases.

### How do you keep secrets out of Terraform?

Terraform creates the secret container and the IAM bindings, but not the secret value: the value is added to Secret
Manager by a rotation job or a person, outside Terraform. Services reference the secret by name and version. If a value
must pass through Terraform, I use the newer ephemeral values and write-only arguments, or accept that state then holds
it and lock state down. Never commit `.tfvars` files with secrets.

### How would you trigger Terraform from a webhook or a backend orchestrator? {core}

The webhook handler verifies the caller (an HMAC signature or an OIDC token), validates the request against an
allow-list, records it with an idempotency key and enqueues it, then returns 202 with a run id. A runner, such as a
Cloud Build job started through its API, an HCP Terraform run created through its API, or Infrastructure Manager, runs
`init` and `plan -out`, exports the plan as JSON and reports back. The orchestrator checks the plan against policy,
gets human approval when needed, starts the apply of that exact plan, and streams status to the UI. Runs for the same
state are serialised.

### An agent can request infrastructure changes. How do you stop it from doing damage? {core}

The agent never writes infrastructure code. It calls a tool that accepts a small, validated set of inputs, such as a
tenant id and a size from an enum, and maps them to reviewed, versioned modules. Every change is planned first; the
plan is checked by policy (no deletions of protected resources, cost and region limits); anything destructive or
expensive needs approval from a human other than the requester; the runner's service account can only touch the
allowed projects; and every step is audited. It is the same pattern I used for agentic workflows at Quantiphi: tool-use
boundaries, validation, and HITL checkpoints before anything acts.

### Which runner would you choose: Cloud Build, HCP Terraform, Infrastructure Manager, or the CLI in your own worker? {deep}

If the organisation already uses HCP Terraform, its run API, approvals and policy checks are the shortest path. On a
GCP-first platform, Cloud Build (or Infrastructure Manager, which runs Terraform on Cloud Build for you) keeps
everything inside Google Cloud with its own service accounts and audit logs, and both can be started through APIs. I
would avoid a homemade CLI runner unless we need full control, because then locking, isolation, log handling and
credential hygiene are ours to build.

### What is policy as code? {deep}

Rules about infrastructure written as code and checked automatically, usually against the JSON plan before apply:
"no public Cloud Storage buckets", "only these regions", "no deletion of databases", "every resource has an owner
label". Tools include OPA with Conftest, Sentinel in HCP Terraform, and on GCP the Organization Policy Service as a
backstop. It makes reviews faster and guarantees the rules apply even to automated runs.

### Have you used Terraform? {core}

Not on my resume, so I will be straightforward: my infrastructure work has been through pipelines and platform tools,
GitHub Actions, AWS CodePipeline and Azure DevOps, deploying to Cloud Run and AKS. I understand Terraform's model,
state and locking, plan and apply, modules, drift, and the risks of running it from automation, and I have worked
through it hands-on while preparing. Triggering Terraform runs safely from an orchestrator with approvals is close to
the agentic HITL workflows I built at Quantiphi.

Say the "worked through it hands-on" part only if you have actually run `terraform plan` on a small configuration
before the interview.

### Terraform, OpenTofu or Pulumi? {deep}

Terraform is the most widely used, with the largest provider and module ecosystem; since 2023 it is under a
source-available licence. OpenTofu is the open-source fork, compatible for most configurations. Pulumi uses general
programming languages (TypeScript, Python) instead of HCL, which helps with complex logic but makes reviews depend on
code style. CloudFormation (or the CDK) and Bicep are the single-cloud native options. I would follow what the team
already uses; the concepts of state, plan and apply are shared.

## Coding problems

### Verify a signed webhook {medium core}

Your orchestrator receives webhooks with a header `X-Signature: t=<unix seconds>,v1=<hex>` (several `v1` entries may be
present during secret rotation) and a delivery id header. The signature is HMAC-SHA256 over `` `${t}.${rawBody}` ``.
Write a `WebhookVerifier` that accepts one or more secrets and returns `{ ok: true }` or
`{ ok: false, reason }` with reason `'malformed'`, `'stale'` (more than 300 seconds from now, either way),
`'bad-signature'` or `'replay'` (the same delivery id seen before within the tolerance window).

#### Hints

1. Parse the header into `t` and a list of `v1` values; reject anything else as malformed.
2. Compute the expected signature for each secret and compare with `timingSafeEqual`, checking lengths first.
3. Record the delivery id only after the signature is valid, so attackers cannot fill your replay cache, and forget ids
   once they are older than the tolerance.

#### Solution

Signing the timestamp with the body means an attacker cannot reuse an old, validly signed request later: it goes stale.
The delivery-id cache stops a replay inside the window. Accepting a list of secrets lets you rotate: sign with the new
secret while still accepting the old one for a while.

```ts
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

type Verdict = { ok: true } | { ok: false; reason: 'malformed' | 'stale' | 'bad-signature' | 'replay' };

export class WebhookVerifier {
  private readonly secrets: string[];
  private readonly toleranceSec: number;
  private readonly seen = new Map<string, number>(); // delivery id → timestamp

  constructor(secrets: string[], toleranceSec = 300) {
    this.secrets = secrets;
    this.toleranceSec = toleranceSec;
  }

  verify(header: string, deliveryId: string, rawBody: string, now: number): Verdict {
    const parts = header.split(',').map((p) => p.trim().split('='));
    const t = Number(parts.find(([k]) => k === 't')?.[1]);
    const given = parts.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v ?? '')).map(([, v]) => Buffer.from(v, 'hex'));
    if (!Number.isInteger(t) || given.length === 0 || !deliveryId) return { ok: false, reason: 'malformed' };
    if (Math.abs(now - t) > this.toleranceSec) return { ok: false, reason: 'stale' };

    const matches = this.secrets.some((secret) => {
      const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
      return given.some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected));
    });
    if (!matches) return { ok: false, reason: 'bad-signature' };

    for (const [id, ts] of this.seen) if (now - ts > this.toleranceSec) this.seen.delete(id);
    if (this.seen.has(deliveryId)) return { ok: false, reason: 'replay' };
    this.seen.set(deliveryId, t);
    return { ok: true };
  }
}

function sign(secret: string, t: number, body: string): string {
  return createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

const now = 1_760_000_000;
const body = JSON.stringify({ action: 'provision_sandbox', tenant: 't-42', size: 'small' });
const verifier = new WebhookVerifier(['whsec-new', 'whsec-old']);

assert.deepEqual(verifier.verify(`t=${now},v1=${sign('whsec-new', now, body)}`, 'd-1', body, now + 5), { ok: true });
assert.deepEqual(verifier.verify(`t=${now},v1=${sign('whsec-new', now, body)}`, 'd-1', body, now + 6), { ok: false, reason: 'replay' });
assert.deepEqual(verifier.verify(`t=${now},v1=${sign('whsec-old', now, body)}`, 'd-2', body, now), { ok: true });   // old secret still accepted
assert.deepEqual(verifier.verify(`t=${now},v1=${'0'.repeat(64)},v1=${sign('whsec-new', now, body)}`, 'd-3', body, now), { ok: true });
assert.deepEqual(verifier.verify(`t=${now},v1=${sign('whsec-new', now, body)}`, 'd-4', body.replace('small', 'huge'), now),
  { ok: false, reason: 'bad-signature' });
assert.deepEqual(verifier.verify(`t=${now - 301},v1=${sign('whsec-new', now - 301, body)}`, 'd-5', body, now), { ok: false, reason: 'stale' });
assert.deepEqual(verifier.verify('v1=abc', 'd-6', body, now), { ok: false, reason: 'malformed' });
assert.deepEqual(verifier.verify(`t=${now},v1=${sign('whsec-new', now, body)}`, '', body, now), { ok: false, reason: 'malformed' });
```

Complexity: O(s × v) HMACs for s secrets and v signatures, plus O(n) to prune the cache (fine for small windows; use a
TTL store such as Redis `SET id 1 NX EX 300` across instances).

#### Follow-ups

- **Why the raw body?** Re-serialising parsed JSON can change whitespace or key order and break the signature. Verify
  first, then parse.
- **Several instances?** The replay cache must be shared: Redis `SET NX EX`, or a unique constraint on the delivery id
  in the database.

### Review a Terraform plan before anything is applied {medium core}

`terraform show -json tfplan` produces `{"resource_changes": [{"address", "type", "change": {"actions": [...]}}]}`
where actions are `["create"]`, `["update"]`, `["delete"]`, `["read"]`, `["no-op"]`, or a replacement
`["delete", "create"]` / `["create", "delete"]`. Write `review_plan(plan, protected_types, approved)` that counts each
kind of change and decides:

- `"blocked"` if a protected type (for example `google_sql_database_instance`) would be deleted or replaced and its
  address is not in `approved`;
- `"needs-approval"` if anything else is deleted or replaced, or an action is unknown;
- `"no-changes"` if everything is `no-op` or `read`;
- otherwise `"auto-apply"`.

#### Hints

1. Turn the actions list into a tuple and map it to a kind; anything you do not recognise is `"unknown"`.
2. Treat both replacement orders as `"replace"`: either way, the old object is destroyed.
3. Collect blocked addresses so the reviewer sees exactly what tripped the rule.

#### Solution

This is the policy step between plan and apply. It is deliberately conservative: unknown actions and any destruction
need a human, and destroying protected resources is blocked unless someone approved that exact address.

```python
from dataclasses import dataclass, field

KINDS = {
    ("create",): "create", ("update",): "update", ("delete",): "delete", ("read",): "read", ("no-op",): "no-op",
    ("delete", "create"): "replace", ("create", "delete"): "replace",
}


@dataclass
class Review:
    decision: str
    counts: dict[str, int] = field(default_factory=dict)
    blocked: list[str] = field(default_factory=list)


def review_plan(plan: dict, protected_types: set[str], approved: frozenset[str] = frozenset()) -> Review:
    counts: dict[str, int] = {}
    blocked: list[str] = []
    risky = False
    for rc in plan.get("resource_changes", []):
        kind = KINDS.get(tuple(rc["change"]["actions"]), "unknown")
        counts[kind] = counts.get(kind, 0) + 1
        if kind in {"delete", "replace", "unknown"}:
            risky = True
            if kind != "unknown" and rc["type"] in protected_types and rc["address"] not in approved:
                blocked.append(rc["address"])
    if blocked:
        decision = "blocked"
    elif risky:
        decision = "needs-approval"
    elif set(counts) <= {"no-op", "read"}:
        decision = "no-changes"
    else:
        decision = "auto-apply"
    return Review(decision, counts, blocked)


def change(address: str, type_: str, *actions: str) -> dict:
    return {"address": address, "type": type_, "change": {"actions": list(actions)}}


PROTECTED = {"google_sql_database_instance", "google_storage_bucket"}

new_tenant = {"format_version": "1.2", "resource_changes": [
    change("module.sandbox.google_project.tenant", "google_project", "create"),
    change("module.sandbox.google_pubsub_topic.events", "google_pubsub_topic", "create"),
    change("data.google_client_config.current", "google_client_config", "read"),
]}
assert review_plan(new_tenant, PROTECTED) == Review("auto-apply", {"create": 2, "read": 1}, [])

resize = {"resource_changes": [
    change("google_cloud_run_v2_service.orchestrator", "google_cloud_run_v2_service", "update"),
    change("google_pubsub_subscription.worker", "google_pubsub_subscription", "delete", "create"),
]}
assert review_plan(resize, PROTECTED).decision == "needs-approval"

dangerous = {"resource_changes": [
    change("google_sql_database_instance.main", "google_sql_database_instance", "create", "delete"),
    change("google_storage_bucket.documents", "google_storage_bucket", "update"),
]}
review = review_plan(dangerous, PROTECTED)
assert review.decision == "blocked" and review.blocked == ["google_sql_database_instance.main"]
assert review_plan(dangerous, PROTECTED, frozenset({"google_sql_database_instance.main"})).decision == "needs-approval"

assert review_plan({"resource_changes": [change("x.y", "google_x", "no-op")]}, PROTECTED).decision == "no-changes"
assert review_plan({}, PROTECTED).decision == "no-changes"
assert review_plan({"resource_changes": [change("x.y", "google_x", "future-action")]}, PROTECTED).decision == "needs-approval"   # unknown: a human looks
```

Complexity: O(r) for r resource changes.

#### Follow-ups

- **What else would you check?** Resources outside allowed regions, public access settings in `change.after`, missing
  owner labels, and an estimated monthly cost from a cost tool against a threshold.
- **Why not just use `prevent_destroy`?** Use it too, on databases and buckets. But it lives in the configuration, which
  a change can remove; the policy check runs outside the change and also covers resources nobody remembered to protect.

### Coordinate Terraform runs: idempotent, serialised, approved {medium}

Write a `RunCoordinator` for the orchestrator:

- `request(key, workspace, action, requester)` creates a run (`action` is `"plan"` or `"apply"`) or, for a repeated
  idempotency key, returns the existing run; reusing a key with different parameters raises `ValueError`.
- Only one run per workspace is active (`running`, `awaiting_approval` or `applying`); others wait as `queued` and start
  in order when the workspace frees up. Different workspaces run in parallel.
- `plan_finished(run_id, has_changes)`: a plan-only run, or an apply run with no changes, becomes `done`; an apply run
  with changes becomes `awaiting_approval`.
- `approve(run_id, approver)`: the approver must not be the requester; the run becomes `applying`.
- `apply_finished(run_id, ok)`: `done` or `failed`, and the next queued run on that workspace starts.

#### Hints

1. Keep runs in a dict by id, an idempotency index by key, and a FIFO queue per workspace.
2. Write one helper, `_start_next(workspace)`, and call it after every transition that frees a workspace.
3. Guard each transition: approving a run that is not awaiting approval is an error.

#### Solution

The coordinator turns "many triggers" into "one orderly run at a time per state file", which is what the Terraform state
lock needs anyway, but with a queue instead of failures. The approval step is a four-eyes HITL checkpoint.

```python
from collections import defaultdict, deque
from dataclasses import dataclass
from itertools import count

ACTIVE = {"running", "awaiting_approval", "applying"}


@dataclass
class Run:
    id: str
    workspace: str
    action: str
    requester: str
    status: str = "queued"
    approver: str | None = None


class RunCoordinator:
    def __init__(self) -> None:
        self.runs: dict[str, Run] = {}
        self.by_key: dict[str, str] = {}
        self.queues: dict[str, deque[str]] = defaultdict(deque)
        self._ids = count(1)

    def request(self, key: str, workspace: str, action: str, requester: str) -> Run:
        if action not in {"plan", "apply"}:
            raise ValueError(f"unknown action {action!r}")
        if key in self.by_key:
            run = self.runs[self.by_key[key]]
            if (run.workspace, run.action, run.requester) != (workspace, action, requester):
                raise ValueError("idempotency key reused with different parameters")
            return run
        run = Run(f"run-{next(self._ids)}", workspace, action, requester)
        self.runs[run.id] = run
        self.by_key[key] = run.id
        self.queues[workspace].append(run.id)
        self._start_next(workspace)
        return run

    def _start_next(self, workspace: str) -> None:
        if any(r.workspace == workspace and r.status in ACTIVE for r in self.runs.values()):
            return
        if self.queues[workspace]:
            self.runs[self.queues[workspace].popleft()].status = "running"

    def _expect(self, run_id: str, status: str) -> Run:
        run = self.runs[run_id]
        if run.status != status:
            raise ValueError(f"{run_id} is {run.status}, not {status}")
        return run

    def plan_finished(self, run_id: str, has_changes: bool) -> None:
        run = self._expect(run_id, "running")
        run.status = "awaiting_approval" if run.action == "apply" and has_changes else "done"
        self._start_next(run.workspace)

    def approve(self, run_id: str, approver: str) -> None:
        run = self._expect(run_id, "awaiting_approval")
        if approver == run.requester:
            raise PermissionError("the requester cannot approve their own run")
        run.status, run.approver = "applying", approver

    def apply_finished(self, run_id: str, ok: bool) -> None:
        run = self._expect(run_id, "applying")
        run.status = "done" if ok else "failed"
        self._start_next(run.workspace)


c = RunCoordinator()
a = c.request("hook-1", "tenant-42", "apply", requester="agent:provisioner")
assert c.request("hook-1", "tenant-42", "apply", requester="agent:provisioner") is a     # webhook redelivered
b = c.request("hook-2", "tenant-42", "apply", requester="agent:provisioner")
other = c.request("hook-3", "tenant-7", "plan", requester="alice")
assert (a.status, b.status, other.status) == ("running", "queued", "running")           # serialised per workspace

c.plan_finished(a.id, has_changes=True)
assert a.status == "awaiting_approval" and b.status == "queued"                          # still holds the workspace
try:
    c.approve(a.id, approver="agent:provisioner")
    raise AssertionError("self-approval must fail")
except PermissionError:
    pass
c.approve(a.id, approver="bob")
c.apply_finished(a.id, ok=False)
assert a.status == "failed" and a.approver == "bob" and b.status == "running"            # next run starts

c.plan_finished(b.id, has_changes=False)
assert b.status == "done"
c.plan_finished(other.id, has_changes=True)
assert other.status == "done"                                                            # plan-only never applies

try:
    c.request("hook-1", "tenant-42", "plan", requester="agent:provisioner")
    raise AssertionError("key reuse with other parameters must fail")
except ValueError:
    pass
try:
    c.apply_finished(b.id, ok=True)
    raise AssertionError("invalid transition must fail")
except ValueError:
    pass
```

Complexity: O(1) per transition, apart from the O(n) scan in `_start_next` (keep an active-run index per workspace in
production).

#### Follow-ups

- **Where does this state live?** In Postgres, with a unique index on the idempotency key and a row lock (or
  `FOR UPDATE SKIP LOCKED` worker queue) so several orchestrator instances agree.
- **What if an approval never comes?** Give `awaiting_approval` a timeout that discards the saved plan, because the
  state may have changed; a later apply must re-plan.

### Decide the next canary step {easy}

Write `decideCanary(baseline, canary, currentPercent)` for an automated Cloud Run rollout. Each side has
`{ requests, errors, p95Ms }`. Rules, in order:

1. Fewer than `minRequests` (default 500) canary requests: `wait` at the current percentage.
2. Canary error rate above the baseline's by more than `maxErrorDelta` (default 0.5 percentage points): `rollback` to 0.
3. Canary p95 latency above `maxLatencyRatio` (default 1.2) times the baseline: `rollback` to 0.
4. Otherwise move to the next step in `[5, 25, 50, 100]`; reaching 100 is `promote`.

#### Hints

1. Error rate is `errors / requests`; guard against a baseline with zero requests.
2. Find the next step with `steps.find((s) => s > currentPercent)`.
3. Return a reason string: whoever reads the rollout log needs it.

#### Solution

The rules are deliberately simple and ordered: not enough data means no decision, any regression means rollback, and
only a healthy canary moves forward. Real systems add statistical tests, but the shape is the same.

```ts
import assert from 'node:assert/strict';

type Stats = { requests: number; errors: number; p95Ms: number };
type Decision = { action: 'wait' | 'rollback' | 'continue' | 'promote'; nextPercent: number; reason: string };
type Options = { minRequests?: number; maxErrorDelta?: number; maxLatencyRatio?: number; steps?: number[] };

export function decideCanary(baseline: Stats, canary: Stats, currentPercent: number, opts: Options = {}): Decision {
  const { minRequests = 500, maxErrorDelta = 0.005, maxLatencyRatio = 1.2, steps = [5, 25, 50, 100] } = opts;
  if (canary.requests < minRequests) {
    return { action: 'wait', nextPercent: currentPercent, reason: `only ${canary.requests} canary requests` };
  }
  const rate = (s: Stats) => (s.requests === 0 ? 0 : s.errors / s.requests);
  if (rate(canary) - rate(baseline) > maxErrorDelta) {
    return { action: 'rollback', nextPercent: 0, reason: `error rate ${(rate(canary) * 100).toFixed(2)}% vs ${(rate(baseline) * 100).toFixed(2)}%` };
  }
  if (canary.p95Ms > baseline.p95Ms * maxLatencyRatio) {
    return { action: 'rollback', nextPercent: 0, reason: `p95 ${canary.p95Ms} ms vs ${baseline.p95Ms} ms` };
  }
  const next = steps.find((s) => s > currentPercent) ?? 100;
  return next >= 100
    ? { action: 'promote', nextPercent: 100, reason: 'canary healthy at every step' }
    : { action: 'continue', nextPercent: next, reason: 'canary healthy' };
}

const baseline: Stats = { requests: 20_000, errors: 40, p95Ms: 800 };   // 0.2% errors

assert.equal(decideCanary(baseline, { requests: 120, errors: 0, p95Ms: 700 }, 5).action, 'wait');
assert.deepEqual(decideCanary(baseline, { requests: 1000, errors: 2, p95Ms: 820 }, 5),
  { action: 'continue', nextPercent: 25, reason: 'canary healthy' });
assert.equal(decideCanary(baseline, { requests: 1000, errors: 9, p95Ms: 820 }, 25).action, 'rollback');      // 0.9% errors
assert.equal(decideCanary(baseline, { requests: 1000, errors: 2, p95Ms: 1100 }, 25).action, 'rollback');     // p95 regression
assert.equal(decideCanary(baseline, { requests: 5000, errors: 10, p95Ms: 790 }, 50).action, 'promote');
assert.equal(decideCanary({ requests: 0, errors: 0, p95Ms: 800 }, { requests: 600, errors: 0, p95Ms: 790 }, 5).nextPercent, 25);
```

Complexity: O(k) for k steps.

#### Follow-ups

- **What metric matters most for a chat platform?** Besides errors and latency: time to first token, stream completion
  rate (streams that end with `done` rather than an error), and run success rate.
- **Why compare with the baseline instead of a fixed threshold?** Traffic and upstream latency (the LLM provider) change
  through the day; comparing canary and baseline at the same moment removes that noise.
