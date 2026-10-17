---
title: Worked designs for healthcare AI systems
goal: Walk through four healthcare designs (a Document AI pipeline with human review, a readmission-risk service, a claims-status API at scale and a RAG assistant over clinical policies) and defend the decisions that healthcare makes different.
minutes: 45
---

Healthcare designs use the same building blocks as any other system, but four things change the answer: protected
health information (PHI) in every flow, an audit trail for every access, integration with slow or old partner systems
(HL7 v2, FHIR, X12 EDI), and humans who must review high-impact decisions. Interviewers for healthcare and health-AI
roles probe exactly those parts.

Each case follows the framework from [System design](#/system-design): requirements, estimates, architecture, key
decisions and deep dives. Practise each one out loud in 20 to 25 minutes. Memorise the **decisions** and why, not the
diagrams, because the interviewer will change a requirement to see whether you can adapt. Raise the
[regulated-data constraints](#/system-design/s-regulated-and-sensitive-data) early in every one.

## Design 1: Document AI pipeline with human review

**Requirements.** Caseworkers or applicants upload documents (Medicaid application forms, paystubs). The system
classifies each document, extracts fields, validates them, sends uncertain items to human review, and submits approved
data to a downstream eligibility system. Non-functional: PHI-grade security, full audit trail, no lost documents,
throughput of about 20,000 documents a day, results within minutes for clean documents.

**Estimate.** About one document per second at peak is easy for any stateless service. At a 15% review rate and 3
minutes per review, the queue needs about 19 reviewers a day: the human queue is the bottleneck, so extraction quality
and validation matter more than servers. The [estimate in System design](#/system-design/s-back-of-envelope-estimates)
works it through in code.

```text
 Browser (SSO / SAML)
     │  1. request upload URL                       6. review UI: document + extracted fields
     ▼                                                     ▲
 API service (FastAPI on Cloud Run) ──────────────► review queue (DB table: status, assignee, SLA)
     │  2. signed URL                                      ▲
     ▼                                                     │ 5. invalid or low confidence
 Object storage (encrypted bucket) ─3. upload event─► processing workers
                                                        │  OCR + layout → classify → extract
                                                        │  4. validate (Pydantic schema + business rules)
                                                        ▼
                                              valid & confident ──► submission service ──► downstream API
                                                                       (idempotent, retries, DLQ)
 Every step writes: status table (document state machine) + audit log
```

**Key decisions.**

- **Direct upload with signed URLs:** large files go straight to object storage, not through the API, and access is
  time-limited and scoped to one object.
- **Event-driven processing:** the storage event (or a queue message) triggers workers, so spikes queue up instead of
  timing out. Workers are stateless and autoscale.
- **A document state machine** (`uploaded → extracted → validated → in_review → approved → submitted`, plus `failed`)
  stored in the database: every transition is recorded, which gives the audit trail and makes reprocessing safe.
- **The validation gate:** Pydantic schemas enforce types and formats, business rules check cross-field logic, and a
  confidence threshold decides straight-through processing versus human review.
- **Human review UI:** shows the document image next to the extracted fields, highlights failing fields, records every
  correction (who, what, when). Corrections become labelled data for evaluation.
- **Submission:** idempotent calls with an idempotency key per document, retries with exponential backoff, and a
  dead-letter queue for items that keep failing, with alerting.

**Deep dives to offer.** Exactly-once effects with at-least-once events (idempotent workers keyed by document id and
version); reprocessing when the extraction model changes; measuring straight-through rate and field-level accuracy;
security (SSO, role-based access to review queues, no PHI in logs).

**Your angle:** this design has the shape of the LDH Medicaid Document AI platform you built at Quantiphi. What your
resume supports: an Angular SSR front end and a Python/FastAPI backend on GCP, SAML authentication with Passport.js, GCS
signed URLs for document rendering, Pydantic schema validation as the quality gate on ML-extracted fields from MAGI and
Non-MAGI forms and paystubs, human-in-the-loop review and editing, external API submission, and Docker images deployed
through Artifact Registry to Cloud Run across Dev, SIT and UAT. Present the other parts (upload-event triggers, the
dead-letter queue, review SLAs) as how you would design them, unless you remember building them.

## Design 2: Readmission-risk prediction service

**Requirements.** Predict each inpatient's risk of an unplanned readmission within 30 days of discharge, so care
managers can prioritise follow-up calls. Hospitals care because CMS's Hospital Readmissions Reduction Program reduces
payments for excess readmissions on selected conditions. Scores are needed daily for all current inpatients and on
demand at discharge, with the top contributing factors shown, and fair performance across patient groups.

```text
 EHR (FHIR API, HL7 ADT feed) + claims history
        │ ingestion (batch + ADT events)
        ▼
 data warehouse / lake ──► feature pipeline ──► feature store (offline for training, online for serving)
                                │                         │
                                ▼                         ▼
                      training pipeline            scoring service (FastAPI)
                      (patient-level, time-based      ├─ daily batch job: score all inpatients
                       validation; gradient boosting) └─ on discharge event: score one patient
                                │                         │
                                ▼                         ▼
                      model registry (MLflow) ──► risk scores + top factors ──► care-management worklist
                                                          │
                     monitoring: drift, calibration, outcomes 30 days later, subgroup performance ──► retrain
```

**Deep dives to offer.**

- **Label definition:** unplanned readmission within 30 days; exclude planned readmissions, transfers and deaths. A
  wrong label makes everything downstream wrong.
- **Leakage:** every feature must be available at prediction time. Nothing recorded after discharge, and split by
  patient and by time so the same patient never appears in both training and test data.
- **Features:** prior admissions in the last year, length of stay, diagnoses and comorbidity burden, abnormal labs,
  number of medications, discharge disposition, whether follow-up is scheduled.
- **Metric tied to capacity:** if care managers can call 50 patients a day, optimise precision among the top 50 and
  recall overall, report PR-AUC, and make sure the probabilities are calibrated.
- **Explainability and fairness:** per-patient top factors (for example SHAP values) on the worklist; check
  sensitivity and calibration per age, sex, race and payer group.
- **Training–serving consistency:** the same feature code for training and serving (a feature store or shared
  library), versioned with the model.

The ML chapters cover the techniques: [ML fundamentals](#/ml-fundamentals), [Evaluating models](#/ml-metrics) and
[MLOps](#/mlops).

## Design 3: Claims status API at scale

**Requirements.** Providers and partner portals look up claim status by claim number, or list a member's claims in a
date range. Read-heavy: say 50 million lookups a day, about 580 requests per second on average and perhaps 1,700 at
peak. p95 latency under 300 ms, 99.9% or better availability. Status changes come from the adjudication system. Partners
also send X12 276 claim status inquiries through a clearinghouse and expect 277 responses.

```text
 partners / portal ──► API gateway (OAuth2 client credentials, per-partner rate limits, WAF)
                            │
                            ▼
                 claims status service (stateless, autoscaled, multi-zone)
                    │ cache-aside (Redis, short TTL)
                    ▼
              read model: claim_status table (denormalised, indexed by claim_id and member_id + date)
                    ▲            on read replicas
                    │ projector (idempotent upserts by claim_id + version)
 adjudication system ──► status-change events (Kafka / Service Bus) ──► also invalidates cache keys
 clearinghouse X12 276 ──► EDI translator ──► same service ──► X12 277 response
 every lookup ──► audit log (who accessed which member's claim)
```

**Key decisions.** Separate the read model from the system of record (CQRS), so heavy reads never load the
adjudication system; update it from events and make the projector idempotent with version checks, so out-of-order or
duplicate events are harmless; cache hot claims briefly and invalidate on change; use cursor pagination for claim
lists; enforce that a partner sees only claims for its own providers; and audit every PHI access.

**Your angle:** at Cognizant you delivered mission-critical healthcare REST APIs in C# and .NET Core with 99.99% uptime,
and integrated Availity multi-payer appeals with Molina Healthcare: real experience of partner integration, uptime and
claims workflows. The [payer workflows](#/payer-workflows) chapter covers the X12 transactions.

## Design 4: RAG assistant over clinical policy documents

**Requirements.** Utilisation-management nurses ask questions about medical policies and coverage criteria ("What are
the criteria for outpatient MRI of the lumbar spine?") and get answers with citations, using only the version in effect
for the member's plan and state. Answers in a few seconds. Refuse rather than guess.

```text
 policy PDFs (document management) ──► parse (layout, tables) ──► structure-aware chunks
        ──► embed ──► hybrid index (vectors + BM25) with metadata: plan, state, line of business,
                       effective_from / effective_to, version, access labels

 nurse ──► API (SSO) ──► redact PHI from the question ──► rewrite query
       ──► hybrid search filtered by plan, state, date and access ──► rerank top 50 → 5
       ──► prompt with numbered sources ──► LLM (under BAA) ──► verify citations ──► stream answer
       ──► feedback buttons ──► evaluation set; traces (no PHI) ──► dashboards
```

**Deep dives to offer.** Versioning (filter on effective dates so retired criteria never appear); tables of criteria
kept intact as chunks; evaluation with a nurse-labelled question set (recall@k for retrieval, faithfulness for
answers); "not found in policy" as a valid answer; guardrails against off-topic and injected instructions; cost control
with caching of common questions per plan and version. The [RAG chapter](#/rag) goes deeper.

## Interview questions

### How would you design a Document AI pipeline with human review? {core}

Direct uploads to an encrypted bucket with signed URLs; an upload event triggers stateless workers that run OCR,
classify, extract and validate; a document state machine in the database tracks every step; documents that fail
validation or have low confidence go to a review queue with a UI that shows the image next to the fields; approved data
is submitted downstream with idempotent calls, retries and a dead-letter queue; and every step is audited.

**Your angle:** say plainly that you built a platform of this shape on GCP for LDH Medicaid: FastAPI and Pydantic
validation, HITL review, signed URLs, SAML, Cloud Run. Then offer the deep dives (idempotency, reprocessing, measuring
straight-through rate) as design choices, claiming only the parts you actually built.

### How do you decide which documents go to human review? {core}

Two gates, in order. First the hard gate: schema validation (types, formats, required fields) and business rules
(cross-field checks such as pay-period dates matching the pay date). Anything that fails goes to review with the failing
fields highlighted. Second the soft gate: a confidence threshold on the extraction. I set that threshold from data, not
by feel: plot field-level accuracy against confidence on reviewer-corrected samples, pick the point where
straight-through documents meet the accuracy target, and check that the resulting review volume fits reviewer capacity.
Then I keep measuring, because the right threshold drifts when document types or the model change.

### How do you reprocess documents when the extraction model changes? {deep}

Treat each extraction as a versioned result, not an overwrite: the document keeps its history of extractions, each
tagged with the model version, and the state machine allows a controlled transition back to "extracted" for a re-run.
Workers are idempotent, keyed by document id and model version, so a retried message cannot duplicate work. A backfill
job feeds documents through a throttled queue so it never starves live traffic. Before switching production to the new
version, run both on a labelled sample and compare field accuracy and straight-through rate. Documents already submitted
downstream are not silently changed: any correction goes through the normal review and amendment path.

### How do you measure whether a document pipeline is working?

Product metrics: straight-through rate (share of documents with no human touch), field-level accuracy measured against
reviewer corrections, time from upload to decision, and review queue age against its SLA. Reliability metrics: worker
error rate, dead-letter queue depth, submission failures to the downstream API, and end-to-end latency per stage. I put
these on one dashboard per document type, because an average across types hides the one form that is failing.

### How would you design a readmission-risk prediction service? {core}

Define the label carefully (unplanned readmission within 30 days, with exclusions), build features only from data
available at prediction time, train a gradient-boosting model with patient-level, time-based validation, register it,
and serve scores both as a daily batch over current inpatients and on demand from discharge events. Show top factors to
care managers, choose the operating point from their call capacity, check calibration and fairness by subgroup, and
monitor drift and real outcomes 30 days later to trigger retraining.

### How do you avoid data leakage in a clinical prediction model? {core}

Ask of every feature: would I know this value at the moment the prediction is made? Anything recorded after discharge,
or after the outcome, is out, including codes added during billing weeks later. Build training rows with point-in-time
joins so each feature uses only data timestamped before the prediction time. Split by patient, so one patient never
appears in both training and test, and by time, training on earlier months and testing on later ones, which also shows
how the model ages. A suspiciously high validation score is the usual symptom of leakage.

### How do you choose the operating threshold for a risk model that care managers use?

From their capacity, not from a default of 0.5. If the team can call 50 patients a day, the useful question is how many
true readmissions are in the top 50 each day, so I optimise and report precision at that k, alongside recall and PR-AUC
for the whole population. The scores must be calibrated, so a 30% risk really means about 30%, which lets managers trust
and compare them. I revisit the threshold when capacity changes, and check it per subgroup so one group is not
systematically under-prioritised.

### How do you keep training and serving features consistent? {deep}

One definition of each feature, used by both paths: a feature store with offline and online views, or a shared feature
library that the training pipeline and the scoring service both import. Version the feature code with the model, so a
model always runs with the features it was trained on, and log the feature values at serving time so you can compare
their distributions with training data. Training–serving skew is one of the most common reasons a model that looked
good offline underperforms in production.

### How would you design a claims status API for heavy read traffic? {core}

Put a gateway in front for OAuth2, rate limits and a WAF; run stateless, autoscaled services across zones; serve reads
from a denormalised read model on replicas plus a short-TTL cache, never from the adjudication system directly; keep the
read model current with status-change events processed by an idempotent, version-aware projector; support X12 276/277
through an EDI translator onto the same service; and audit every access to member data. At 10× scale, partition the read
model by claim id and add regional deployments.

### Why separate the read model from the system of record?

Because the two have opposite needs. The adjudication system is optimised for correct writes and complex rules, and it is
often old and fragile; a flood of partner lookups would slow down claims processing. A separate read model is shaped for
the queries partners actually make (by claim number, by member and date), can live on replicas and behind a cache, and
scales independently. The cost is staleness measured in seconds and the work of keeping it in sync, which an
event-driven projector with version checks handles. I say that trade-off out loud: partners may see a status a few
seconds late, which is acceptable for status lookups but not for, say, an eligibility decision.

### How do you support X12 276/277 alongside a REST API?

Put an EDI translator at the edge that parses the 276 claim status inquiry into the same internal request the REST API
uses, calls the same claims status service, and formats the answer as a 277 response. That keeps one implementation of the
business logic and the access rules, with two protocols in front. The translator handles envelopes, acknowledgements and
validation errors; partner-specific quirks live in configuration. Volume often arrives in batches through a
clearinghouse, so the translator queues requests and processes them at a controlled rate.

### How would you design a RAG assistant over clinical policies? {core}

Ingest policy documents with layout-aware parsing, structure-aware chunks and rich metadata (plan, state, effective
dates, access labels); search with hybrid retrieval filtered by that metadata, then rerank; prompt with numbered sources
and instructions to answer only from them; verify citations; stream the answer; collect feedback into an evaluation set.
Redact PHI from questions, run the model under a BAA, and refuse when the policies do not answer the question.

### How do you stop a RAG assistant from citing retired policy criteria?

Make the date part of retrieval, not part of the prompt. Every chunk carries `effective_from`, `effective_to` and a
version; queries filter on the date that matters (usually the date of service) along with plan and state, so retired
criteria are never retrieved at all. When a policy is published or retired, the ingestion pipeline re-indexes it and
closes the old version's date range. I add regression tests to the evaluation set: questions whose correct answer changed
between versions, checked on every index update.

### How do you keep PHI out of an LLM-based assistant?

Minimise first: the assistant usually needs the policy question, not the patient, so redact names, identifiers and dates
from the question before it leaves the trusted boundary. Where PHI must reach the model, use a provider and deployment
covered by a BAA, with data retention and training use contractually excluded. Keep PHI out of traces, logs and
evaluation sets, enforce access labels on retrieved documents so a user only sees what they are allowed to, and audit
every request. The [HIPAA chapter](#/hipaa) has the safeguards in detail.
