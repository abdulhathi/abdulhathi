---
title: "NoShow: an appointment no-show prediction service, end to end"
summary: A complete, honest machine learning project that predicts missed medical appointments from a public dataset, with a leakage-safe scikit-learn pipeline, cost-based threshold tuning, calibration, experiment tracking, a FastAPI prediction service, drift checks and a model card.
time: 4–5 days of evenings
---

## What you will build

NoShow uses a public appointment dataset (for example the "Medical Appointment No Shows" dataset on Kaggle; check its license and do not commit the raw data, only a download script) to predict which appointments are likely to be missed, so a clinic could send reminders to the right patients.

The project goes beyond a notebook:

1. A reproducible pipeline: download → validate → split by patient (no leakage) → feature engineering in a scikit-learn `Pipeline` with a `ColumnTransformer`.
2. Model comparison: a baseline, logistic regression, and gradient boosting, with cross-validation and PR-AUC as the main metric for the imbalanced target.
3. Calibration and a decision threshold chosen from the cost of a reminder versus the cost of a missed slot.
4. Experiment tracking with MLflow and a saved model artefact.
5. A FastAPI service: `POST /predict` and `POST /predict/batch`, input validation with Pydantic, and model version in every response.
6. A drift report comparing new data with training data (population stability index per feature).
7. A model card: intended use, data, metrics by subgroup, limitations and fairness considerations.

## What it proves

- The ML lifecycle you can explain in an interview, end to end
- Leakage awareness: patient-level group splits, features available at booking time only
- Metrics for imbalanced problems: precision and recall, PR-AUC, calibration, threshold tuning by cost
- scikit-learn pipelines, `ColumnTransformer`, cross-validation, hyperparameter search
- MLOps basics: experiment tracking (MLflow), a model registry or versioned artefacts, serving, monitoring for drift
- Responsible AI: subgroup metrics and a model card
- Keywords: Python, scikit-learn, pandas, machine learning, classification, MLflow, FastAPI, model deployment, data drift

## Architecture

```text
data/ (gitignored) ◄── scripts/download.py
        │
        ▼
noshow/data.py      load + validate (schema, ranges, missing values)
noshow/split.py     GroupShuffleSplit by patient_id; time-based holdout
noshow/features.py  ColumnTransformer: lead time, weekday, age bands, prior no-shows (computed from history only)
noshow/train.py     CV + search → calibrate → choose threshold by cost → log to MLflow → save model.joblib
        │
        ├──► reports/  metrics.md, PR curve, calibration plot, subgroup table, model_card.md
        ▼
service/app.py      FastAPI: /predict, /predict/batch, /healthz, /model  (loads model.joblib)
noshow/drift.py     PSI per feature: training sample vs new batch → drift report
```

## Milestones

### Milestone 1: data and an honest split

- Download script, schema validation (pandas checks or pandera), and an EDA notebook with five findings written as plain sentences.
- Patient-level split with `GroupShuffleSplit` plus a time-based holdout month.

Done when: a test proves no `patient_id` appears in both train and test.

### Milestone 2: features and a baseline

- Features only available at booking time: lead time, weekday, age band, SMS-reminder flag, the patient's prior no-show rate computed from earlier appointments only.
- A `DummyClassifier` baseline and logistic regression in one `Pipeline`.

Done when: cross-validated PR-AUC for the baseline and logistic regression is logged and reported.

### Milestone 3: better models, calibration and the threshold

- Gradient boosting (scikit-learn's `HistGradientBoostingClassifier`, or LightGBM/XGBoost) with a randomised search.
- Calibrate probabilities (`CalibratedClassifierCV`), plot the calibration curve, and choose the threshold that minimises expected cost from a simple cost table.
- Report precision, recall and F1 at the chosen threshold, overall and by age band and gender.

Done when: `reports/metrics.md` explains the chosen model and threshold in business terms.

### Milestone 4: tracking and serving

- Log parameters, metrics and the model to MLflow (a local `mlruns/` or SQLite backend).
- FastAPI service with Pydantic input models, batch prediction, the model version in responses, and tests with `TestClient`.

Done when: `curl` to `/predict` returns a probability, the decision and the model version, and the tests pass in CI.

### Milestone 5: monitoring and the model card

- PSI drift report comparing the holdout month with training data; flag features above 0.2.
- Model card: intended use, data source and license, metrics, subgroup results, limitations, and what a human must still decide.

Done when: the drift report and model card are linked from the README.

## Repository layout

```text
noshow/
├─ noshow/{data,split,features,train,evaluate,drift}.py
├─ service/{app.py,schemas.py}
├─ scripts/download.py
├─ notebooks/01_eda.ipynb
├─ reports/{metrics.md,model_card.md,figures/}
├─ tests/{test_split.py,test_features.py,test_service.py,test_drift.py}
├─ pyproject.toml, Makefile, Dockerfile
└─ .github/workflows/ci.yml
```

## Tests and CI

- No leakage: group-split test; features computed only from prior appointments (a test with a hand-made history).
- Pipeline: fit and predict on a tiny synthetic dataset, and the output shape and probability range.
- Service: `TestClient` tests for valid input, invalid input (422), batch, and the version field.
- Drift: PSI is 0 for identical distributions and large for shifted ones.
- CI trains on a small synthetic sample (not the real dataset), runs tests and builds the Docker image.

## README checklist

- Problem statement and why it matters, in three sentences
- Results table: baseline vs models (PR-AUC, recall at the chosen threshold), and the cost-based threshold explained
- PR curve and calibration plot images
- Architecture diagram and how to run (`make data train serve`)
- Model card and drift report links
- Limitations and what you would do next

## Stretch goals

- SHAP explanations per prediction, returned by the API
- A scheduled retraining workflow in GitHub Actions with a performance gate
- A small Streamlit or React page for clinic staff

## Talking about it in an interview

**60-second walkthrough:** "NoShow predicts missed appointments from a public dataset. I split by patient so the same person never appears in training and test, built features available at booking time only, and compared a baseline, logistic regression and gradient boosting on PR-AUC because only about one in five appointments is missed. I calibrated the probabilities and picked the threshold from the cost of a reminder versus a missed slot, then served the model with FastAPI, tracked experiments in MLflow, and added a drift report and a model card with subgroup metrics."

- **Why not accuracy?** With a 20% positive rate, predicting "shows up" for everyone scores 80%; PR-AUC and recall at a cost-based threshold measure what matters.
- **How did you avoid leakage?** Patient-level splits, no features recorded after booking, and prior no-show rates computed from earlier appointments only.
- **How would you monitor it in production?** Input drift (PSI), prediction distribution, and, once outcomes arrive, precision and recall by week and by subgroup, with alerts and a retraining gate.

## LinkedIn post template

> I finished NoShow, an end-to-end ML project that predicts missed medical appointments from a public dataset.
> The interesting parts weren't the model: patient-level splits to avoid leakage, choosing the threshold from real costs, calibration, a drift report and a model card with subgroup metrics.
> Served with FastAPI, tracked with MLflow, tested in CI: <repo link> #MachineLearning #Python #MLOps

## Resume bullet

Built NoShow, an end-to-end appointment no-show prediction service (scikit-learn pipelines, leakage-safe group splits, calibrated probabilities with a cost-based threshold, MLflow tracking, FastAPI serving, drift monitoring and a model card).
