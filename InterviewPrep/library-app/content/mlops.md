---
title: Data pipelines, deployment and MLOps
goal: Explain how a model goes from a notebook to a monitored production service, serve a model behind FastAPI, and detect drift with PSI.
minutes: 45
---

Deploying and scaling AI and ML solutions in production enterprise environments is where you are strongest, because
production delivery is your background. Interviewers want to hear that you know a model is
not finished when it scores well in a notebook: it needs a reproducible pipeline, a serving API, monitoring for drift,
and a safe way to roll out and retrain.

Frame your answers with your own work: on the LDH Medicaid Document AI platform you containerised FastAPI services,
promoted them through Dev, SIT and UAT on Cloud Run, and put a Pydantic validation gate and human review between the
ML extraction and the downstream submission. That is MLOps thinking: never trust model output blindly.

## The production ML lifecycle

```text
 data sources ──► ingest ──► validate ──► features ──► train ──► evaluate ──► register
 (EHR, claims,     (batch or   (schema,     (same code     (tracked    (holdout,     (versioned
  documents)        stream)     ranges)      for serving)   runs)       fairness)     model)
                                                                                         │
       ┌─────────────── retrain (schedule, drift, or new labels) ◄──── monitor ◄──── deploy
       │                                                              (drift,        (API or
       └──────────────────────────────────────────────────────────►    latency,       batch job,
                                                                       accuracy)      canary)
```

Each arrow is code that runs automatically, is versioned, and can be re-run. That is the difference between a data
science project and an ML system.

### Data pipelines

| Choice | Option A | Option B |
|---|---|---|
| Timing | **Batch**: hourly or nightly jobs over files or tables; simple, cheap | **Streaming**: events processed in seconds (Kafka, Pub/Sub, Kinesis); for real-time features and alerts |
| Order of work | **ETL**: transform before loading into the warehouse | **ELT**: load raw data first, transform inside the warehouse with SQL (BigQuery, Snowflake, dbt) |
| Engine | **pandas**: one machine, data fits in memory | **Spark / Dataflow / Beam**: distributed, for data that does not fit on one machine |

**Orchestration** (Airflow, Dagster, Prefect, Vertex AI Pipelines, Azure Data Factory) runs the steps as a DAG with
dependencies, schedules, retries and alerts. Make every task **idempotent**: running it twice for the same date must
give the same result, so retries and backfills are safe.

```python norun
# Airflow 3 TaskFlow API (Airflow 2 imports dag and task from airflow.decorators). Not executed: Airflow is not installed.
from datetime import datetime
from airflow.sdk import dag, task

@dag(schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False)
def readmission_features():
    @task(retries=3)
    def extract(ds=None) -> str:            # ds = the logical date, so reruns process the same day
        return f"gs://raw/encounters/{ds}.parquet"

    @task
    def validate(path: str) -> str: ...     # fail fast on schema or range problems

    @task
    def build_features(path: str) -> None: ...  # write to the feature table, partitioned by date

    build_features(validate(extract()))

readmission_features()
```

### Training–serving skew and feature stores

**Training–serving skew** is when the features the model sees in production are computed differently from the ones it
was trained on (a different SQL query, a different default for missing values, a timezone bug). The model then
silently performs worse. Prevent it by using **one shared feature-engineering code path** (for example a scikit-learn
`Pipeline` saved with the model), or a **feature store** (Feast, Vertex AI Feature Store, SageMaker Feature Store) that
serves the same feature definitions offline for training and online for inference, with point-in-time correct joins.

### Experiment tracking and the model registry

Every training run should record its parameters, metrics, code version, data version and the model artefact.
**MLflow** is the common open-source tool; Vertex AI, SageMaker and Azure ML have equivalents. A **model registry**
holds versioned models with a stage or alias (for example "champion" and "challenger"), so deployment pulls an exact,
approved version instead of a file someone copied.

```python norun
# Not executed: MLflow is not installed in this lab. X_train, y_train, X_val, y_val come from your split.
import mlflow
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

model = HistGradientBoostingClassifier(max_depth=4, learning_rate=0.05)
with mlflow.start_run(run_name="readmission-gbm"):
    mlflow.log_params({"max_depth": 4, "learning_rate": 0.05})
    model.fit(X_train, y_train)
    mlflow.log_metric("val_auc", roc_auc_score(y_val, model.predict_proba(X_val)[:, 1]))
    # MLflow 3 names the model with name=...; MLflow 2 used artifact_path="model" (still accepted, deprecated).
    mlflow.sklearn.log_model(model, name="model", registered_model_name="readmission-risk")
```

### Serving patterns

| Pattern | How | Use when |
|---|---|---|
| Online (real-time) | REST/gRPC API (FastAPI, Vertex AI or SageMaker endpoint) | A user or system waits for the answer: risk score at discharge |
| Batch | Scheduled job scores a whole table and writes results | Nightly risk lists for care managers; cheapest |
| Streaming | Consumer scores each event from Kafka or Pub/Sub | Real-time alerts from device or vitals streams |
| Embedded / edge | Model shipped inside an app or device (ONNX, TFLite) | Offline or very low latency |

The FastAPI serving pattern is a coding problem below: load the model once at start-up, validate input with Pydantic,
return a probability plus the model version, and expose a health endpoint for the load balancer.

### Deployment strategies

| Strategy | What happens | Why |
|---|---|---|
| Shadow | New model receives a copy of live traffic; its predictions are logged, not used | Compare with the current model on real data at zero risk |
| Canary | A small share of traffic (say 5%) goes to the new model, then more | Limit the blast radius; roll back fast |
| A/B test | Split users randomly and compare a business metric | Prove the new model actually helps outcomes |
| Blue-green | Two full environments; switch traffic at once | Instant rollback by switching back |

Cloud Run does canaries natively: deploy a new revision with no traffic, then split traffic by percentage.

### Monitoring and drift

| What to watch | Examples | How |
|---|---|---|
| Service health | Latency, error rate, throughput, memory | Standard API monitoring and alerts |
| Data quality | Nulls, out-of-range values, schema changes | Validation on every batch and request |
| **Data drift** (input distribution changes) | Patient mix shifts after a new clinic joins | PSI, KS test, comparing feature histograms with training |
| Prediction drift | Share of high-risk predictions jumps | Monitor the score distribution |
| **Concept drift** (the X→y relationship changes) | New treatment protocol changes who gets readmitted | Accuracy on newly labelled data; needs ground truth |

Labels often arrive late (readmission is known only 30 days later), so you monitor drift and prediction distributions
as early warnings and compute real accuracy once labels land.

### Model optimisation for inference

| Technique | Idea | Trade-off |
|---|---|---|
| Quantisation | Store weights in INT8 (or 4-bit for LLMs) instead of FP32 | 2–4× smaller and faster; small accuracy loss |
| Pruning | Remove weights or neurons that contribute little | Smaller model; needs fine-tuning to recover accuracy |
| Distillation | Train a small "student" model to mimic a large "teacher" | Much cheaper inference; extra training step |
| ONNX / ONNX Runtime | Export to a portable, optimised runtime | Framework-independent, often faster |
| Batching | Group requests to use the CPU/GPU efficiently | Higher throughput; slight added latency |
| Caching | Reuse results for identical inputs | Only when inputs repeat |

### Reproducibility and governance

- **Version everything:** code (Git), data (snapshots, DVC or table versions), environment (Docker image, pinned
  requirements), random seeds, and the model artefact in a registry.
- **Explainability:** SHAP (Shapley values, consistent per-feature contributions; TreeSHAP is fast for tree models)
  or LIME (fits a simple local model around one prediction). Clinicians and auditors want to know why.
- **Model cards:** document intended use, training data, metrics per subgroup, limitations.
- **Healthcare:** train on de-identified data where possible, keep PHI under a BAA, audit subgroup performance for
  bias, and keep a human in the loop for consequential decisions. Software that diagnoses or treats can be regulated
  by the FDA as Software as a Medical Device, which brings validation and change-control requirements.

## Interview questions

### Walk me through taking a model from a notebook to production. {core}

First I turn the notebook into versioned code: a data pipeline that extracts and validates data, a feature step shared
between training and serving, and a training script that logs parameters, metrics and the artefact to a tracker such
as MLflow and registers the model. Then I package inference as a service, typically FastAPI in a Docker image with a
Pydantic input schema, and deploy it through CI/CD to Dev, test and production, using a canary or shadow rollout.
Finally I monitor latency and errors, input drift and prediction distribution, and real accuracy once labels arrive,
with a retraining trigger.

**Your angle:** "On the LDH Medicaid Document AI platform I built the application side: FastAPI services in Docker,
pushed to Artifact Registry and promoted through Dev, SIT and UAT on Cloud Run, with Pydantic schema validation as the
quality gate on ML-extracted fields before human review."

### Batch, online or streaming inference: how do you choose? {core}

I ask who is waiting for the prediction and how fresh it must be. If a person or system needs the answer in the
request (a risk score shown at discharge, a document field during review), I serve online through an API with a
latency budget. If the results are consumed later (a nightly list of high-risk members for care managers), batch
scoring is simpler, cheaper and easier to audit. Streaming is for continuous events where seconds matter, such as
alerts from device data.

Many systems mix them: batch-precompute what you can, and compute only the fresh part online.

### How would you serve a scikit-learn model with FastAPI? {core}

Save the whole fitted `Pipeline` (preprocessing plus model) with joblib, so serving applies exactly the same
transformations. In FastAPI, load it once at start-up in the lifespan handler, not per request. Define a Pydantic
request model with types and ranges so bad input gets a 422 before it reaches the model. The endpoint returns the
probability, the decision at an agreed threshold, and the model version, and there is a health endpoint for probes.

Prediction is CPU-bound, so I use a plain `def` endpoint (FastAPI runs it in a thread pool) or offload heavy models
to workers, and scale with multiple processes or container replicas. The coding problem below builds and tests this.

### What is training–serving skew, and how do you prevent it? {core}

It is a mismatch between how features are computed at training time and at prediction time, so the live model sees
inputs it was never trained on and quietly gets worse. Typical causes: features reimplemented in another language for
serving, different handling of missing values, data leakage in training features that are not available at serving
time, or time-zone and unit differences.

Prevention: one shared feature code path (a saved scikit-learn pipeline, or a feature store serving the same
definitions offline and online), validation of serving inputs against the training schema, and logging serving
features so you can compare their distributions with the training data.

### What is a feature store, and when is it worth it? {deep}

A feature store is a central system that defines features once and serves them two ways: an offline store with full
history for training (with point-in-time correct joins, so you never use information from the future) and a low-latency
online store for inference. Examples are Feast, Vertex AI Feature Store and SageMaker Feature Store.

It is worth it when several models and teams reuse the same features, or when online features must match training
exactly. For one model with a nightly batch job, a well-tested feature module and a warehouse table are enough.

### What do experiment tracking and a model registry give you?

Tracking records every run's parameters, metrics, code commit, data version and artefacts, so results are
comparable and reproducible ("which run produced the model in production?"). A registry stores approved model
versions with aliases or stages, approvals and lineage, so deployment pulls an exact version and rollback means
pointing back to the previous one. MLflow is the open-source standard; Vertex AI Model Registry, SageMaker Model
Registry and Azure ML provide the same managed.

### Data drift vs concept drift: what is the difference, and how do you detect each? {core}

**Data drift** means the input distribution changes, for example a new clinic brings older patients. You detect it
without labels by comparing live feature distributions with the training data, using PSI or a KS test per feature
and monitoring the prediction distribution. **Concept drift** means the relationship between inputs and outcome
changes, for example a new care programme lowers readmissions for the same patient profile. You can only confirm it
with fresh labels, by tracking accuracy, AUC or calibration on recent data.

Data drift does not always hurt the model, and concept drift can happen with no data drift at all, so you monitor both.

### What is PSI and how do you read it? {deep}

The Population Stability Index compares the distribution of a variable in a reference period (training) and a
current period. You bin the reference data (often into deciles), compute the share of each period in each bin, and sum
`(actual% − expected%) × ln(actual% / expected%)`. A common rule of thumb: below 0.1 is stable, 0.1 to 0.25 is a
moderate shift worth investigating, above 0.25 is a significant shift. It came from credit-risk scorecards and is
widely used for model monitoring. The coding problem below implements it.

### How do you monitor a model when labels arrive weeks later? {deep}

Use proxies until ground truth arrives: input data quality and drift, prediction-score distribution, the share of
positive decisions, and operational feedback such as how often human reviewers override the model. When labels land
(for example 30 days after discharge for readmission), join them back to the logged predictions by request ID and
compute AUC, precision and recall, and calibration on that cohort, broken down by subgroup.

**Your angle:** HITL corrections on the Document AI platform are exactly this kind of early label signal: every field
a reviewer fixes is a labelled example of where extraction failed.

### When and how do you retrain a model? {core}

Three triggers: a **schedule** (monthly, when data changes steadily), **drift or performance alerts** past a
threshold, or a **meaningful amount of new labelled data**. The retraining pipeline is the same automated pipeline that
built the first model, with the new data window. The new model becomes a challenger: it must beat the current champion
on a recent holdout and on fairness checks, then go through shadow or canary before full promotion. Automatic
promotion without that gate is risky, especially in healthcare.

### Shadow, canary, A/B and blue-green: when do you use each for a model? {core}

**Shadow** first, when you want to compare a new model on real traffic with zero user impact: it scores a copy of the
requests and you compare offline. **Canary** when you are ready to serve: send 5% of traffic, watch errors, latency and
prediction distribution, then increase. **A/B** when you need to prove a business or clinical outcome improves, with
random assignment and a pre-agreed metric. **Blue-green** when you want an instant switch and instant rollback between
two complete environments.

On Cloud Run, revisions and traffic splitting make canary and instant rollback a one-line change.

### How is CI/CD for ML different from normal CI/CD? {core}

Normal CI/CD tests and ships code. ML adds data and models, so you also need **continuous training (CT)**. CI tests
include data-validation tests, feature-code unit tests and a small training smoke test. The pipeline produces a model
artefact that must pass **evaluation gates** (metrics above a threshold, no regression against the current model, no
subgroup getting worse) before registration. CD then deploys the serving container and the specific registered model
version, usually with shadow or canary. And the system can be triggered by new data or drift, not only by a commit.

### How do you make a model faster or cheaper to serve?

First measure where time goes: feature lookups and network calls often cost more than the model. For the model itself:
**quantisation** (INT8, or 4-bit for LLMs), **pruning**, **distillation** into a smaller student model, exporting to
**ONNX Runtime**, and **batching** requests on GPU. Around it: **cache** repeated inputs, precompute in batch where
freshness allows, right-size instances and autoscale on concurrency. Every optimisation is re-validated against the
evaluation set, because quantisation and distillation can cost accuracy.

### How do you make ML work reproducible?

Version the four things that determine a model: the **code** (a Git commit), the **data** (an immutable snapshot or
table version, with DVC or warehouse time travel), the **environment** (a Docker image with pinned dependencies), and
the **configuration and seeds**. Log all of them with the run in the tracker, and store the artefact in a registry
linked to that run. Then anyone can rebuild the same model, and auditors can trace a production prediction back to its
training data, which matters in regulated healthcare work.

### ETL vs ELT, and batch vs streaming pipelines?

**ETL** transforms data before loading it into the target, which suits strict schemas and sensitive data you want to
clean or de-identify before it lands. **ELT** loads raw data into a scalable warehouse first and transforms there with
SQL (dbt), which is the modern default with BigQuery or Snowflake because raw data stays available for re-processing.
**Batch** processes data on a schedule and is simpler and cheaper; **streaming** processes events continuously for
low-latency use cases, at the cost of more complex operations (ordering, exactly-once, late data).

### What does Airflow do, and what makes a good task?

Airflow orchestrates workflows as DAGs: tasks with dependencies, schedules, retries, backfills and alerting, written
in Python. It schedules and monitors the work; the heavy lifting should run elsewhere (BigQuery, Spark, a container),
not on the Airflow workers. A good task is **idempotent** (re-running it for the same date gives the same result, for
example overwrite a date partition instead of appending), **atomic**, small enough to retry cheaply, and parameterised
by the run's logical date rather than "now".

### When would you use Spark instead of pandas? {deep}

pandas runs on one machine and needs the data in memory, which is fine up to a few gigabytes and fastest to develop
with. When data is tens of gigabytes or more, or the job must scale with growth, I use a distributed engine: Spark
(PySpark, Databricks, Dataproc, EMR), or push the work into the warehouse with SQL. Spark is lazy: transformations
build a plan and actions such as `write` or `count` execute it across the cluster. Polars or DuckDB are good middle
grounds on a single large machine.

### How do you validate data in a pipeline? {core}

Validate at the boundaries: when data enters and before it is used for training or scoring. Checks include schema
(columns and types), required fields not null, value ranges (age 0–120), allowed categories, uniqueness of keys,
row counts within expected bounds, and freshness. Failures either stop the pipeline or quarantine the bad rows with an
alert. Tools: Great Expectations, Pandera, dbt tests, or Pydantic for record-level validation in Python services.

**Your angle:** the Pydantic validation gate on ML-extracted document fields at Quantiphi is the same idea applied
to model output: enforce the data contract before anything moves downstream.

### How do you explain a model's predictions to clinicians or auditors? {core}

Global explanations show which features matter overall (permutation importance, mean absolute SHAP values).
Local explanations show why this patient got this score: **SHAP** gives each feature an additive contribution that
sums to the prediction and is consistent; **LIME** fits a simple model around one prediction. I present them as
"the top factors raising this patient's risk", alongside a **model card** that documents intended use, training data,
performance per subgroup and limitations. Where possible I prefer an inherently interpretable model if it performs
nearly as well.

### What governance does an ML model in healthcare need? {deep}

Privacy first: train on de-identified or minimum-necessary data, keep PHI in HIPAA-eligible services under a BAA, and
control and audit access. Then fairness and safety: evaluate performance across age, sex, race and payer groups, check
calibration, and keep humans in the loop for consequential decisions. Then traceability: versioned data, code and
models, model cards, approval records and monitoring. If the software is intended to diagnose or treat, it may be
regulated by the FDA as Software as a Medical Device, which adds clinical validation and controlled change management
for model updates.

### Vertex AI, SageMaker or Azure ML? {deep}

They cover the same lifecycle: managed notebooks, training jobs, pipelines, a model registry, online and batch
endpoints, feature stores and monitoring. The choice mostly follows the organisation's cloud, data location, existing
contracts and BAA. I would say: "I have deployed services to GCP Cloud Run (through Dev, SIT and UAT) and to Azure
AKS; the concepts
transfer, and I would use whichever platform the client already runs on, keeping the model code portable (Docker,
standard formats) so we are not locked in."

### How would you scale an inference API under heavy load?

Make it stateless so replicas can be added freely, then scale horizontally on CPU, concurrency or request rate (HPA on
Kubernetes, Cloud Run autoscaling). Inside each instance, run several worker processes because CPU-bound prediction is
limited by the GIL, and load the model once per process. Add batching for GPU models, a cache for repeated requests, a
queue for work that can be asynchronous, and timeouts and rate limits to protect the service. Set min instances to
avoid cold starts if latency matters, and load-test before launch.

## Coding problems

### Serve a model behind FastAPI {medium core}

Train a scikit-learn model that predicts 30-day readmission risk from `age`, `prior_admissions`, `length_of_stay` and
`num_medications`, save it with joblib, and serve it with FastAPI:

- `POST /predict` takes one patient's features (validated: age 0–120, counts non-negative) and returns
  `{"risk": <probability>, "high_risk": <bool at threshold 0.5>, "model_version": "..."}`.
- Invalid input returns 422. `GET /health` returns `{"status": "ok"}` once the model is loaded.

Test it with `TestClient`.

#### Hints

1. Save the whole `Pipeline` (scaler plus model), so the API applies the same preprocessing as training.
2. Load the model once, in FastAPI's lifespan handler, and keep it on `app.state`.
3. Pydantic `Field(ge=0, le=120)` gives you validation and a 422 for free.

#### Solution

The model is trained and saved in the first half (in a real project, that is the training pipeline). The API loads it
at start-up, validates input with Pydantic, and converts the request into the same column order used in training.
Using `with TestClient(app) as client:` runs the lifespan handler, just as uvicorn would.

```python
from contextlib import asynccontextmanager

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = ["age", "prior_admissions", "length_of_stay", "num_medications"]
MODEL_PATH = "readmission-v1.joblib"

# Training (normally a separate pipeline): synthetic data where risk rises with every feature.
rng = np.random.default_rng(0)
train = pd.DataFrame({
    "age": rng.integers(18, 95, 2000),
    "prior_admissions": rng.poisson(1.0, 2000),
    "length_of_stay": rng.integers(1, 20, 2000),
    "num_medications": rng.integers(0, 25, 2000),
})
logit = -9 + 0.05 * train.age + 0.9 * train.prior_admissions + 0.12 * train.length_of_stay + 0.08 * train.num_medications
train["readmitted"] = rng.random(2000) < 1 / (1 + np.exp(-logit))
pipeline = make_pipeline(StandardScaler(), LogisticRegression()).fit(train[FEATURES], train.readmitted)
joblib.dump({"model": pipeline, "version": "readmission-v1"}, MODEL_PATH)

# Serving
class Patient(BaseModel):
    age: int = Field(ge=0, le=120)
    prior_admissions: int = Field(ge=0)
    length_of_stay: int = Field(ge=0)
    num_medications: int = Field(ge=0)

class Prediction(BaseModel):
    risk: float
    high_risk: bool
    model_version: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    bundle = joblib.load(MODEL_PATH)          # once per process, not per request
    app.state.model, app.state.version = bundle["model"], bundle["version"]
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.post("/predict", response_model=Prediction)
def predict(patient: Patient) -> Prediction:   # def, not async: prediction is CPU-bound, FastAPI runs it in a thread pool
    row = pd.DataFrame([patient.model_dump()], columns=FEATURES)
    risk = float(app.state.model.predict_proba(row)[0, 1])
    return Prediction(risk=round(risk, 4), high_risk=risk >= 0.5, model_version=app.state.version)

with TestClient(app) as client:
    assert client.get("/health").json() == {"status": "ok"}

    low = client.post("/predict", json={"age": 25, "prior_admissions": 0, "length_of_stay": 1, "num_medications": 1})
    high = client.post("/predict", json={"age": 90, "prior_admissions": 5, "length_of_stay": 18, "num_medications": 22})
    assert low.status_code == high.status_code == 200
    assert low.json()["high_risk"] is False and high.json()["high_risk"] is True
    assert 0 <= low.json()["risk"] < high.json()["risk"] <= 1
    assert high.json()["model_version"] == "readmission-v1"

    bad = client.post("/predict", json={"age": 150, "prior_admissions": -1, "length_of_stay": 2, "num_medications": 3})
    assert bad.status_code == 422
    assert {e["loc"][-1] for e in bad.json()["detail"]} == {"age", "prior_admissions"}
```

Complexity: each prediction is O(number of features) for a linear model; the cost that matters is loading the model,
which happens once per process.

#### Follow-ups

- **How would you add a batch endpoint?** Accept `list[Patient]` and call `predict_proba` once on a DataFrame of all
  rows: vectorised scoring is much faster than looping.
- **How would you roll out readmission-v2 safely?** Log both models' predictions in shadow mode, then canary 5% of
  traffic with Cloud Run traffic splitting, comparing errors, latency and score distribution.
- **What would you log for monitoring?** Request ID, model version, input features (without PHI or de-identified),
  risk score and latency, so drift and later accuracy can be computed.
- **Why `def` and not `async def`?** `predict_proba` is blocking CPU work; in an `async def` it would block the event
  loop for every other request.

### Compute the Population Stability Index {medium core}

Write `psi(expected, actual, bins=10)` that measures how much a feature's distribution has shifted between the
training data (`expected`) and recent production data (`actual`). Use bins from the training data's quantiles. Return
a float, and show that the same distribution gives a value near 0 while a shifted one exceeds 0.25.

#### Hints

1. Use `np.quantile(expected, ...)` for the bin edges, and make the outer edges −∞ and +∞ so every value lands in a bin.
2. Turn bin counts into proportions for each sample, then sum `(a − e) × ln(a / e)`.
3. An empty bin makes `ln(0)` blow up: clip proportions to a small epsilon.

#### Solution

Quantile bins put about 10% of the training data in each bin, so a change in any part of the distribution shows up.
Each bin contributes `(a − e) × ln(a / e)`, which is never negative (both factors have the same sign), so PSI is 0 only
when the distributions match bin for bin.

```python
import numpy as np

def psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10, eps: float = 1e-6) -> float:
    expected = np.asarray(expected, dtype=float)
    actual = np.asarray(actual, dtype=float)
    edges = np.quantile(expected, np.linspace(0, 1, bins + 1))
    edges[0], edges[-1] = -np.inf, np.inf          # catch values outside the training range
    e = np.histogram(expected, edges)[0] / len(expected)
    a = np.histogram(actual, edges)[0] / len(actual)
    e, a = np.clip(e, eps, None), np.clip(a, eps, None)
    return float(np.sum((a - e) * np.log(a / e)))

def label(value: float) -> str:
    return "stable" if value < 0.1 else "moderate shift" if value < 0.25 else "significant shift"

rng = np.random.default_rng(0)
training_ages = rng.normal(50, 10, 20_000)

same = psi(training_ages, rng.normal(50, 10, 5_000))
small = psi(training_ages, rng.normal(53, 10, 5_000))
large = psi(training_ages, rng.normal(60, 12, 5_000))

assert same < 0.01 and label(same) == "stable"
assert same < small < large
assert large > 0.25 and label(large) == "significant shift"
assert psi(training_ages, training_ages) < 1e-9
print(f"same {same:.3f}, +3 years {small:.3f}, +10 years {large:.3f}")
```

```text
same 0.003, +3 years 0.083, +10 years 0.776
```

Complexity: O(n log n) for the quantiles (sorting), then O(n log b) to bin; O(b) extra space.

#### Follow-ups

- **What about categorical features?** Use each category as a bin (plus an "other" bin for unseen categories).
- **What else could you use?** A two-sample Kolmogorov–Smirnov test (`scipy.stats.ks_2samp`). With large samples it
  flags tiny, harmless shifts as significant, so teams often prefer PSI with thresholds.
- **Is drift always bad?** No. Check whether model performance actually dropped before retraining; some drift is harmless.

### Validate a scoring batch before it reaches the model {easy}

Before nightly batch scoring, check a pandas DataFrame of patients. Return a list of human-readable problems, empty if
the batch is clean. Rules: required columns `member_id`, `age`, `length_of_stay` present; `member_id` unique and not
null; `age` between 0 and 120; `length_of_stay` non-negative; and the batch has at least `min_rows` rows.

#### Hints

1. Check missing columns first and return early: the other checks cannot run without them.
2. Use boolean masks (`~df.age.between(0, 120)`) and report the offending IDs so someone can fix the source.

#### Solution

Validation at the pipeline boundary turns silent bad predictions into a loud, specific failure. Collect all problems
instead of stopping at the first, so one run reports everything.

```python
import pandas as pd

REQUIRED = ["member_id", "age", "length_of_stay"]

def validate_batch(df: pd.DataFrame, min_rows: int = 1) -> list[str]:
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        return [f"missing columns: {missing}"]
    problems: list[str] = []
    if len(df) < min_rows:
        problems.append(f"only {len(df)} rows, expected at least {min_rows}")
    if df.member_id.isna().any():
        problems.append(f"{int(df.member_id.isna().sum())} rows with no member_id")
    dupes = df.member_id[df.member_id.duplicated() & df.member_id.notna()].unique().tolist()
    if dupes:
        problems.append(f"duplicate member_id: {dupes}")
    bad_age = df.loc[~df.age.between(0, 120), "member_id"].tolist()   # NaN ages fail between() too
    if bad_age:
        problems.append(f"age missing or outside 0-120 for: {bad_age}")
    bad_los = df.loc[df.length_of_stay < 0, "member_id"].tolist()
    if bad_los:
        problems.append(f"negative length_of_stay for: {bad_los}")
    return problems

clean = pd.DataFrame({"member_id": ["M1", "M2"], "age": [40, 71], "length_of_stay": [3, 0]})
assert validate_batch(clean) == []

dirty = pd.DataFrame({
    "member_id": ["M1", "M1", None, "M4"],
    "age": [40, 130, 55, None],
    "length_of_stay": [3, 2, 4, -1],
})
assert validate_batch(dirty) == [
    "1 rows with no member_id",
    "duplicate member_id: ['M1']",
    "age missing or outside 0-120 for: ['M1', 'M4']",
    "negative length_of_stay for: ['M4']",
]
assert validate_batch(pd.DataFrame({"member_id": ["M1"]})) == ["missing columns: ['age', 'length_of_stay']"]
assert validate_batch(clean, min_rows=100) == ["only 2 rows, expected at least 100"]
```

Complexity: O(n) per check, O(n) extra space for the masks.

#### Follow-ups

- **Stop the pipeline or quarantine rows?** Stop on structural problems (missing columns, a near-empty batch); write
  row-level failures to a quarantine table, score the rest, and alert.
- **Which library would you use at scale?** Pandera or Great Expectations for declarative checks with reports, or dbt
  tests when the data is in a warehouse.
