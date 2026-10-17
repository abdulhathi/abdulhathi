---
title: "DropCheck: a serverless file-validation pipeline on Google Cloud, built with Terraform and GitHub Actions"
summary: Upload a CSV and get a validation report in seconds — Cloud Storage events trigger a Cloud Run service that validates every row with Pydantic, stores results in Firestore and notifies through Pub/Sub, with all infrastructure in Terraform and keyless CI/CD that canaries each release.
time: 4–5 days of evenings
---

## What you will build

A user asks the API for a signed upload URL and uploads a CSV (for example a product feed or an expense export) straight to Cloud Storage. From there everything is event-driven:

1. **Eventarc** sees the new object and calls the **validator**, a Cloud Run service (FastAPI) that streams the file, validates every row against a Pydantic schema and writes a report (row counts, the first 1,000 errors, an errors CSV in Cloud Storage) to **Firestore**.
2. The validator publishes `validation.completed` to **Pub/Sub**; a **notifier** service on a push subscription calls a webhook, with a dead-letter topic for deliveries that keep failing.
3. A nightly **Cloud Run job** writes a daily summary.
4. Secrets (the webhook signing key) live in **Secret Manager**; logs are structured JSON correlated with traces, and a log-based metric drives an alert.

All of it is created by **Terraform** with state in a Cloud Storage bucket, and deployed by **GitHub Actions** using Workload Identity Federation (no service-account keys): each release goes to a new revision with no traffic, is smoke-tested, then receives 10% and finally 100% of traffic.

You have built Cloud Run services and signed-URL flows at work; this is your own public, from-scratch version that adds infrastructure as code and a modern pipeline. Do not reuse any employer code, schemas or data.

## What it proves

- Serverless, event-driven design on Google Cloud: Cloud Storage, Eventarc, Cloud Run services and jobs, Pub/Sub push with dead-lettering, Firestore, Secret Manager
- Infrastructure as code with Terraform: remote state, modules, least-privilege service accounts
- Keyless CI/CD: GitHub Actions with Workload Identity Federation, Artifact Registry, canary releases with revision tags and traffic splitting, rollback
- Reliable processing: idempotency for at-least-once events, streaming large files, structured logging, alerting, cost controls
- Python services with FastAPI and Pydantic
- Keywords: Google Cloud (GCP), Cloud Run, Pub/Sub, Eventarc, Firestore, Terraform, GitHub Actions, CI/CD, serverless, event-driven architecture

## Architecture

```text
 browser ──POST /uploads──► api (Cloud Run) ──► signed PUT URL
    │
    └──PUT file──► Cloud Storage: uploads/  ──object finalized──► Eventarc ──► validator (Cloud Run, FastAPI)
                                                                               │  stream + Pydantic per row
                                                     Cloud Storage: reports/ ◄─┤  errors.csv
                                                     Firestore: reports/{id} ◄─┤  summary (idempotent on object generation)
                                                                               └─► Pub/Sub: validation-completed
                                                                                       │ push (OIDC-authenticated)
                                                                                       ▼
                                                                             notifier (Cloud Run) ──► webhook (HMAC-signed)
                                                                                       └─ failures ─► dead-letter topic
 Cloud Scheduler ──► Cloud Run job: daily summary          Secret Manager: webhook key        Cloud Logging/Monitoring: alert
 Terraform (state in GCS) creates all of it · GitHub Actions (WIF) builds → Artifact Registry → tagged revision → 10% → 100%
```

## Milestones

### Milestone 1: the validator, locally

Write the FastAPI validator as a pure core (`validate_rows(stream) -> Report`) plus a thin HTTP layer that accepts a CloudEvent. Stream the CSV row by row so a large file does not load into memory; collect counts and the first 1,000 errors with row numbers and field names.

**Done when:** unit tests cover good rows, every error type and an empty file, and a 100,000-row file validates in a few seconds with flat memory use.

### Milestone 2: Terraform foundation

Enable the APIs; create the buckets (uploads, reports, Terraform state), Artifact Registry repository, Firestore database, Pub/Sub topics (main and dead-letter) and one service account per service with only the roles it needs. Keep state in the GCS bucket.

**Done when:** `terraform apply` builds everything from an empty project and a second `terraform plan` shows no changes.

### Milestone 3: deploy and wire the events

Deploy the validator to Cloud Run (min instances 0, a sensible max), create the Eventarc trigger for object-finalized events on the uploads bucket, and write reports to Firestore keyed by bucket, object name and generation so a redelivered event does not create a second report. Add the API's signed-URL endpoint.

**Done when:** uploading a file through the API produces a report in Firestore within seconds, and replaying the same event leaves one report.

### Milestone 4: notifications with Pub/Sub

Publish `validation-completed`; deploy the notifier behind a push subscription that sends an OIDC token, and verify that token in the notifier. Sign the webhook body with an HMAC key read from Secret Manager. Configure a dead-letter topic and a retry policy.

**Done when:** a failing webhook is retried and ends on the dead-letter topic, and duplicate deliveries do not send two webhooks (dedupe on the message ID).

### Milestone 5: keyless CI/CD with canary releases

Set up Workload Identity Federation for the GitHub repository. The workflow tests, builds and pushes images to Artifact Registry, deploys a new revision with `--no-traffic --tag candidate`, smoke-tests the tagged URL, moves 10% of traffic, then 100%. A manual workflow rolls back to the previous revision.

**Done when:** merging to `main` releases without any JSON key in GitHub, and a deliberately broken release fails at the smoke test without receiving traffic.

### Milestone 6: observability and cost

Log structured JSON with the trace ID so logs group by request; create a log-based metric for validation failures and an alerting policy; add the nightly Cloud Run job via Cloud Scheduler; set a budget alert.

**Done when:** the README shows the dashboard or alert, the architecture, and what the project costs to run idle (scale-to-zero means close to nothing).

## Repository layout

```text
dropcheck/
├── services/
│   ├── api/          # signed upload URLs
│   ├── validator/    # FastAPI + Pydantic, CloudEvent handler
│   ├── notifier/     # Pub/Sub push + HMAC webhook
│   └── summary_job/  # Cloud Run job
├── infra/
│   ├── main.tf  variables.tf  outputs.tf  backend.tf
│   └── modules/{service,pubsub,storage}/
├── .github/workflows/{ci,deploy,rollback}.yml
├── samples/          # good and bad CSV files
└── README.md
```

## Tests and CI

- **Unit tests:** validation rules, report building, idempotency keys, OIDC and HMAC verification (with test keys).
- **Integration tests:** run the validator locally against the Firestore and Pub/Sub emulators from the gcloud CLI, or against a dedicated dev project.
- **Infrastructure checks:** `terraform fmt -check`, `terraform validate`, `tflint`, and a `terraform plan` posted on pull requests.
- **GitHub Actions outline:** `test` → `build` (push to Artifact Registry) → `deploy-candidate` (no traffic, tagged) → `smoke` → `promote` (10% → 100%), all authenticating with `google-github-actions/auth` and Workload Identity Federation.

## README checklist

- Pipeline badge
- Architecture diagram
- A GIF: upload a bad file and watch the report and the webhook arrive
- How to deploy from scratch (`terraform apply`, then the first release) and how to tear down
- Design decisions: why Eventarc and Pub/Sub, idempotency on object generation, why keyless CI, canary steps
- Cost notes and the budget alert
- What you would do next (Cloud Tasks for rate-limited webhooks, a BigQuery sink, multiple schemas)

**Local development on this Mac:** Docker Hub pulls currently fail here, so build images with Cloud Build (`gcloud builds submit`) or in GitHub Actions rather than locally, and run the services with `uvicorn` against the gcloud emulators. Use a fresh personal Google Cloud project with a budget alert from day one.

## Stretch goals

- Swap the webhook for **Cloud Tasks** to rate-limit outgoing calls per customer
- Stream reports into **BigQuery** for analytics
- Add an **AI summary** of the errors with Gemini on Google Cloud, behind a feature flag
- A second Terraform environment (staging) with separate state and promotion between them

## Talking about it in an interview

**60-second walkthrough:** "DropCheck is an event-driven validation pipeline on Google Cloud. Users upload straight to Cloud Storage with a signed URL; Eventarc triggers a Cloud Run service that streams the file and validates each row with Pydantic, so memory stays flat even for large files. Results go to Firestore, keyed by the object's generation so redelivered events are harmless, and a Pub/Sub push subscription notifies a webhook with retries and a dead-letter topic. Everything is in Terraform with remote state, and GitHub Actions deploys without any service-account keys using Workload Identity Federation, releasing each version as a tagged no-traffic revision that is smoke-tested before it gets 10% and then 100% of traffic."

**Likely follow-ups:**

- *Why are events delivered more than once, and how do you cope?* Eventarc and Pub/Sub are at-least-once, so the handler must be idempotent: I key the report on bucket, object and generation, and the notifier dedupes on the message ID.
- *Why Workload Identity Federation instead of a key?* No long-lived secret to leak or rotate: GitHub's OIDC token is exchanged for short-lived Google credentials, scoped to that repository and branch.
- *What happens with a 5 GB file?* Streaming keeps memory flat, but Cloud Run has a request timeout (60 minutes at most), so for very large files I'd hand off to a Cloud Run job or split the file, and report progress in Firestore.

## LinkedIn post template

> I built DropCheck, an event-driven file-validation pipeline on Google Cloud: Cloud Storage → Eventarc → Cloud Run (FastAPI + Pydantic) → Firestore and Pub/Sub, all in Terraform.
> Releases go out through GitHub Actions with Workload Identity Federation (no service-account keys) as canary revisions: smoke test, 10%, then 100%.
> Architecture and code: <repo link> #GoogleCloud #CloudRun #Terraform #Serverless

## Resume bullet

Built DropCheck, an open-source event-driven pipeline on Google Cloud (Cloud Storage, Eventarc, Cloud Run, Pub/Sub, Firestore) provisioned with Terraform and released through keyless GitHub Actions CI/CD with canary traffic splitting. *(Use only after it is built and public.)*
