---
title: Feature engineering and scikit-learn
goal: Turn raw patient data into model-ready features without leakage, and explain Pipeline, ColumnTransformer, tuning and model persistence in scikit-learn.
minutes: 70
---

The JD asks for "data processing pipelines, feature engineering, and model optimization". On tabular healthcare data,
**features usually matter more than the algorithm**. A gradient-boosted model on well-built features (prior
admissions in the last 12 months, days since last discharge, abnormal-lab flags) beats a clever model on raw columns.

Interviewers test three things here: whether you know the standard transformations and **when each one is
appropriate**, whether you can **prevent leakage** (every fitted step inside a `Pipeline`), and whether you can tune
and ship a model with scikit-learn. You already work with pandas and NumPy, so this chapter adds the ML layer on top.

## The scikit-learn API in one screen

Everything in scikit-learn follows three verbs:

| Method | On | What it does | Fit it on |
|---|---|---|---|
| `fit(X, y)` | Transformers and models | Learns from data: means for scaling, categories for encoding, weights for a model | Training data **only** |
| `transform(X)` | Transformers | Applies what was learned | Train, validation, test, production |
| `fit_transform(X, y)` | Transformers | Both, on the same data (sometimes optimised) | Training data only |
| `predict(X)` / `predict_proba(X)` | Models | Labels / class probabilities | Any data after fitting |

**Never call `fit` on validation or test data.** If the scaler learns the mean of the test set, information leaks.
The tool that makes this automatic is the `Pipeline`.

- **`Pipeline`** chains steps (impute → scale → model) into one estimator. `fit` fits every step on the training data,
  `predict` runs every step's `transform` and then the model. Inside cross-validation, each fold refits the whole
  chain, so nothing ever sees the validation fold.
- **`ColumnTransformer`** applies different preprocessing to different columns (numeric versus categorical) and
  concatenates the results.

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

# Synthetic discharge data with realistic messiness: missing labs, categorical columns.
rng = np.random.default_rng(0)
n = 2000
df = pd.DataFrame({
    "age": rng.integers(18, 95, n),
    "length_of_stay": rng.gamma(2.0, 2.5, n).round(1),
    "prior_admissions_12m": rng.poisson(0.8, n),
    "hba1c": np.where(rng.random(n) < 0.3, np.nan, rng.normal(7.0, 1.5, n).round(1)),
    "admission_type": rng.choice(["emergency", "elective", "urgent"], n, p=[0.6, 0.3, 0.1]),
    "payer": rng.choice(["medicare", "medicaid", "commercial"], n),
})
logit = (-4 + 0.02 * df.age + 0.6 * df.prior_admissions_12m + 0.08 * df.length_of_stay
         + 0.8 * (df.admission_type == "emergency") + 0.3 * np.nan_to_num(df.hba1c - 7, nan=0))
y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)    # about 22% readmitted

numeric = ["age", "length_of_stay", "prior_admissions_12m", "hba1c"]
categorical = ["admission_type", "payer"]
preprocess = ColumnTransformer([
    ("num", Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),   # also adds "hba1c was missing"
        ("scale", StandardScaler()),
    ]), numeric),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),           # unseen categories become all zeros
])
pipe = Pipeline([("prep", preprocess), ("model", LogisticRegression(max_iter=1000))])

X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.25, stratify=y, random_state=0)
search = GridSearchCV(pipe, {"model__C": [0.01, 0.1, 1, 10]}, scoring="average_precision",
                      cv=StratifiedKFold(5, shuffle=True, random_state=0))
search.fit(X_train, y_train)          # every fold refits imputer, scaler and encoder on its own training part

test_ap = average_precision_score(y_test, search.predict_proba(X_test)[:, 1])
print("best:", search.best_params_, "CV PR-AUC:", round(search.best_score_, 3), "test PR-AUC:", round(test_ap, 3))
assert test_ap > 1.5 * y_test.mean()  # clearly better than the prevalence baseline

names = search.best_estimator_.named_steps["prep"].get_feature_names_out()
assert "num__missingindicator_hba1c" in names and "cat__admission_type_emergency" in names

# Production-style input with an unseen category and a missing lab still works.
new = pd.DataFrame([{"age": 70, "length_of_stay": 6.0, "prior_admissions_12m": 3, "hba1c": np.nan,
                     "admission_type": "transfer", "payer": "medicare"}])
risk = search.predict_proba(new)[0, 1]
assert 0 < risk < 1
```

## Missing values

| Strategy | When it fits | Caveat |
|---|---|---|
| Drop rows | Very few rows missing, completely at random | Loses data and biases the sample if missingness is not random |
| Drop the column | Mostly empty and not informative | You may throw away signal |
| Mean or median imputation (`SimpleImputer`) | Numeric features, a quick baseline | Median is robust to skew. It shrinks variance. |
| Most frequent or a constant "missing" category | Categorical features | A "missing" category keeps the signal |
| **Missing indicator** (`add_indicator=True`) | Missingness itself is informative | Adds columns |
| kNN or iterative imputation | Strong relationships between features | Slower. Still fit inside the pipeline. |
| Native handling | `HistGradientBoosting`, XGBoost and LightGBM learn where to send missing values. Scikit-learn trees and random forests also support missing values in recent versions. | Linear models, SVMs and kNN do not |

**In healthcare, missingness is often informative.** An HbA1c that was never ordered says the clinician did not
suspect diabetes. Impute the value **and** add an indicator so the model can learn from the gap.

## Encoding categorical features

| Encoding | How | Use for | Watch out |
|---|---|---|---|
| One-hot (`OneHotEncoder`) | One 0/1 column per category | Nominal categories with few levels (admission type, payer) | Explodes with high cardinality. Use `handle_unknown="ignore"` and `min_frequency` or `max_categories` to group rare levels. |
| Ordinal (`OrdinalEncoder`) | Map to integers | Truly ordered categories (triage level 1–5). Also fine for tree models on any category. | Linear models will assume equal spacing |
| Target (mean) encoding (`TargetEncoder`) | Replace a category with the smoothed mean of the target | High cardinality: provider ID, ZIP code, DRG | **Leaks** unless computed out of fold. `TargetEncoder.fit_transform` uses internal cross-fitting for this reason. |
| Hashing | Hash the category into a fixed number of columns | Huge or open-ended vocabularies | Collisions, not interpretable |
| Grouping or hierarchy | Roll up codes (ICD-10 to its 3-character category or a clinical grouper) | Medical code sets | Needs domain knowledge, but gives the best signal |
| Embeddings | Learned dense vectors | Very high cardinality with deep models | Needs lots of data |

## Scaling and transforming numeric features

| Scaler | Formula | Use when |
|---|---|---|
| `StandardScaler` | (x − mean) / std | The default for linear models, SVMs, kNN, PCA and neural networks |
| `MinMaxScaler` | (x − min) / (max − min) | You need a bounded range [0, 1] (some neural networks, image pixels). Sensitive to outliers. |
| `RobustScaler` | (x − median) / IQR | Heavy outliers (lab values, costs) |
| Log or Box-Cox / Yeo-Johnson (`PowerTransformer`) | Compresses right-skewed values | Costs, length of stay, counts, for linear models |

**Which models need scaling?** Anything based on distances or gradients, or with a penalty on weights: linear and
logistic regression with regularisation, SVMs, kNN, k-means, PCA, neural networks. **Tree-based models do not**,
because splits only care about order.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = make_classification(n_samples=1000, n_features=5, n_informative=5, n_redundant=0, random_state=1)
# Add one irrelevant feature on a huge scale, like a cost in dollars next to z-scored labs.
X = np.hstack([X, np.random.default_rng(0).normal(scale=1000, size=(1000, 1))])
cv = StratifiedKFold(5, shuffle=True, random_state=0)

raw = cross_val_score(KNeighborsClassifier(), X, y, cv=cv).mean()
scaled = cross_val_score(make_pipeline(StandardScaler(), KNeighborsClassifier()), X, y, cv=cv).mean()
print(f"kNN accuracy raw={raw:.2f} scaled={scaled:.2f}")
assert raw < 0.6 < 0.85 < scaled   # unscaled distance is all noise; scaling restores the signal
```

## Building new features

- **Dates and times:** length of stay = discharge − admit; admit weekday, weekend flag, month or season; patient age
  at the event (from date of birth, not "age today"); time since the last admission. Use cyclical encodings (sin/cos
  of hour or month) for neural networks.
- **History aggregates (point in time):** prior admissions in the last 30, 90 and 365 days; ED visits in the last 6
  months; the last value, mean and trend of a lab. **Compute them only from events before the prediction time.**
- **Ratios and interactions:** BMI from weight and height, medications per diagnosis, age × comorbidity count.
  `PolynomialFeatures` generates interactions for linear models. Trees find interactions on their own.
- **Domain scores:** comorbidity indices (Charlson, Elixhauser), the LACE readmission index, abnormal-lab flags using
  reference ranges.
- **Binning:** age bands with `pd.cut` or `KBinsDiscretizer`. It helps linear models capture non-linearity and makes
  results explainable, but throws away information within each bin.
- **Text:** TF-IDF on clinical notes for a linear model, or sentence embeddings from a pre-trained model (a bridge to
  your LLM experience). Scrub PHI before notes leave a controlled environment.

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

notes = [
    "patient short of breath, worsening edema, missed diuretic doses",
    "elective knee replacement, uneventful recovery, ambulating well",
    "chf exacerbation, fluid overload, poor medication adherence",
    "routine follow up, stable, no complaints",
]
readmitted = [1, 0, 1, 0]
model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=1), LogisticRegression())
model.fit(notes, readmitted)

vocab = model.named_steps["tfidfvectorizer"].vocabulary_
assert "medication adherence" in vocab                  # bigrams capture short phrases
p_high = model.predict_proba(["edema and missed diuretic, fluid overload"])[0, 1]
p_low = model.predict_proba(["stable after elective procedure, ambulating"])[0, 1]
assert p_high > p_low
```

## Feature selection and importance

| Family | Examples | Pros and cons |
|---|---|---|
| Filter | Variance threshold, correlation, mutual information, `SelectKBest(f_classif)` | Fast and model-agnostic. Ignores interactions. **Must be inside the pipeline.** |
| Wrapper | Recursive feature elimination (`RFE`, `RFECV`), forward/backward selection (`SequentialFeatureSelector`) | Model-aware. Expensive, can overfit the selection. |
| Embedded | L1 regularisation (`SelectFromModel` on a Lasso), tree-based importance | Selection happens during training |

**Importance is not causation**, and the methods differ:

- **Impurity importance** (`feature_importances_` on trees) is computed on training data and **inflates
  continuous and high-cardinality features**, even pure noise.
- **Permutation importance** (`sklearn.inspection.permutation_importance`) shuffles one feature on **held-out**
  data and measures how much the score drops. It is more honest, but it splits credit between correlated features.
- **SHAP values** give per-prediction attributions: a baseline (the average prediction) plus each feature's
  contribution adds up to that patient's prediction. They are useful for explaining an individual patient's risk to a
  clinician.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split

X, y = make_classification(n_samples=1000, n_features=4, n_informative=3, n_redundant=0, random_state=0)
random_id = np.random.default_rng(0).permutation(1000).reshape(-1, 1)   # a unique, meaningless "record id"
X = np.hstack([X, random_id])
X_tr, X_te, y_tr, y_te = train_test_split(X, y, random_state=0)

rf = RandomForestClassifier(n_estimators=100, random_state=0).fit(X_tr, y_tr)
impurity = rf.feature_importances_[-1]
perm = permutation_importance(rf, X_te, y_te, n_repeats=10, random_state=0).importances_mean[-1]
print(f"random id: impurity importance={impurity:.3f}, permutation importance={perm:.3f}")
assert impurity > 0.03      # the tree "used" the noise column to split on training data
assert abs(perm) < 0.02     # shuffling it on test data changes nothing
```

**PCA versus selection:** PCA builds new combined features that maximise variance (good for compression and for
correlated inputs, bad for explainability). Selection keeps original, explainable columns. In healthcare,
explainability usually wins.

## Hyperparameter tuning and "model optimisation"

| Method | How | When |
|---|---|---|
| `GridSearchCV` | Every combination of listed values, each cross-validated | Few hyperparameters with known good ranges |
| `RandomizedSearchCV` | A fixed number of random samples from distributions (`loguniform` for C and learning rate) | More hyperparameters. Usually finds as good a result with far fewer fits. |
| Successive halving (`HalvingRandomSearchCV`, experimental) | Many candidates on a small budget, keeping the best for more data | Large search spaces |
| Bayesian optimisation (Optuna, scikit-optimize) | Models the score surface and samples promising regions next | Expensive models with many hyperparameters |
| Early stopping | Stop adding trees or epochs when the validation score stops improving | Gradient boosting and neural networks |

Use **nested cross-validation** (an outer loop for evaluation, an inner loop for tuning) when you need an unbiased
estimate of the tuned model's performance, or tune on CV and report once on a held-out test set.

In a JD, **"model optimisation"** can mean two things. Mention both:

1. **Better predictions:** feature work, tuning, regularisation, ensembling, threshold and calibration.
2. **Cheaper or faster inference:** smaller models, quantisation, ONNX export, batching, caching. The MLOps chapter
   covers these.

```python
import numpy as np
from scipy.stats import loguniform, randint
from sklearn.datasets import make_classification
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold

X, y = make_classification(n_samples=1500, n_features=12, n_informative=6, weights=[0.8], random_state=0)

search = RandomizedSearchCV(
    HistGradientBoostingClassifier(random_state=0),
    param_distributions={
        "learning_rate": loguniform(0.01, 0.3),
        "max_depth": randint(2, 8),
        "min_samples_leaf": randint(10, 60),
        "l2_regularization": loguniform(1e-4, 1.0),
    },
    n_iter=8, scoring="roc_auc", cv=StratifiedKFold(3, shuffle=True, random_state=0), random_state=0,
)
search.fit(X, y)
print("best params:", {k: round(v, 3) if isinstance(v, float) else v for k, v in search.best_params_.items()})
assert search.best_score_ > 0.85 and len(search.cv_results_["params"]) == 8

# Early stopping: ask for up to 1,000 boosting rounds and let the validation score decide.
model = HistGradientBoostingClassifier(max_iter=1000, early_stopping=True, validation_fraction=0.1,
                                       n_iter_no_change=10, random_state=0).fit(X, y)
print("boosting rounds actually used:", model.n_iter_)
assert model.n_iter_ < 1000
```

## Saving and versioning a model

- **`joblib.dump(pipeline, path)`** saves the **whole fitted pipeline** (preprocessing and model), so serving
  applies exactly the same transformations. Load with `joblib.load`.
- Pickle and joblib files **execute code when loaded**. Only load files you trust, from your own registry.
- Pin library versions. A pickle from one scikit-learn version may not load, or may behave differently, in another.
  Store the version, training data snapshot, parameters and metrics alongside the model (an MLflow model registry
  does this).
- For cross-language or faster serving, export to **ONNX** (`skl2onnx`), or use `skops` for safer persistence.

```python
import tempfile
from pathlib import Path

import joblib
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = make_classification(n_samples=300, n_features=6, random_state=0)
pipe = make_pipeline(StandardScaler(), LogisticRegression()).fit(X, y)

with tempfile.TemporaryDirectory() as d:
    path = Path(d) / "readmission-v1.joblib"
    joblib.dump(pipe, path)
    loaded = joblib.load(path)
    assert np.array_equal(loaded.predict_proba(X), pipe.predict_proba(X))   # identical predictions
```

## Interview questions

### What is feature engineering, and why does it matter so much? {core}

Feature engineering means turning raw data into inputs that expose the signal to the model: aggregating event
histories, extracting date parts, encoding categories, handling missing values, scaling, and adding domain scores. On
tabular data it usually improves results more than switching algorithms. For readmission, "number of admissions in
the last 12 months" and "days since last discharge" carry far more signal than raw encounter rows.

It is also where most leakage bugs happen, so good feature engineering means point-in-time correctness and
preprocessing inside a pipeline.

### How do you handle missing values? {core}

First understand **why** values are missing: random data-entry gaps, a system that doesn't capture the field, or a
test never ordered. Then:

- Drop rows only if very few are missing at random.
- Impute numerics with the median (robust) and categoricals with the most frequent value or an explicit "missing"
  category.
- Add **missing indicators** when missingness is informative.
- Consider kNN or iterative imputation when features are strongly related.
- Let gradient-boosting models handle NaNs natively.

Whatever I choose, the imputer is fitted inside the pipeline on training folds only, so no test statistics leak.

### Missing data in healthcare is often informative. How do you treat it? {deep}

Whether a value was recorded is itself a signal: a lab not ordered, a field only captured for certain programmes, a
wearable that was not worn. Imputing a "normal" value erases that signal, so I'd impute **and** add an indicator column
(`SimpleImputer(add_indicator=True)`), or use a model that handles missing values natively.

If they ask for the terms: **MCAR** (missing completely at random, pure chance), **MAR** (explained by other recorded
data, such as the department) and **MNAR** (depends on the missing value itself). Clinical data is rarely MCAR, which
is why simply dropping rows biases the sample.

I'd also check that missingness patterns are the same in production. If a new EHR workflow starts always recording a
lab, the indicator's meaning shifts and the model drifts. Report missingness rates per site and over time as part of
monitoring.

### One-hot, ordinal or target encoding: when do you use each? {core}

**One-hot** for nominal categories with few levels (admission type, payer), with `handle_unknown="ignore"` for unseen
values. **Ordinal** for genuinely ordered categories (triage level, cancer stage), and for tree models, which cope
well with an arbitrary order because they can split many times. **Target encoding** for high-cardinality columns such as provider ID, ZIP code
or DRG: replace each category with the smoothed mean outcome.

Target encoding must be computed out of fold, or each row's own label leaks into its feature. Scikit-learn's
`TargetEncoder` does this cross-fitting in `fit_transform`. Smoothing toward the global mean protects rare
categories.

### How do you handle high-cardinality categoricals such as ICD-10 codes or provider IDs?

There are several options, often combined:

- Roll up the hierarchy: ICD-10 to its 3-character category, or clinical groupers (CCSR, HCC). This is usually the
  best for signal and explainability.
- Keep the top N frequent levels and group the rest as "other" (`OneHotEncoder(min_frequency=...)`).
- Out-of-fold target encoding.
- Count or frequency encoding.
- Feature hashing.
- Learned embeddings in a neural network.

For a patient with many codes, you aggregate into multi-hot flags or counts per group, rather than one column per
encounter code.

### Which models need feature scaling, and which scaler would you choose? {core}

Models that use distances, gradients or weight penalties need scaling: regularised linear and logistic regression,
SVMs, kNN, k-means, PCA and neural networks. Otherwise the feature with the largest units dominates. Tree-based models
(decision trees, random forests, gradient boosting) don't need it, because splits depend only on order.

`StandardScaler` is the default. `RobustScaler` (median and IQR) suits heavy outliers like costs or lab values.
`MinMaxScaler` suits a bounded range. Fit the scaler on training data only, inside the pipeline.

### When would you log-transform a feature?

When it is strongly right-skewed and spans orders of magnitude: costs, length of stay, counts of visits, income. A log
(or `log1p` for zeros) makes the distribution more symmetric, reduces the influence of extreme values, and often makes
relationships closer to linear, which helps linear models. You can also log-transform a skewed **target** (cost) and
transform predictions back, remembering that the back-transformed mean is biased low. Tree models rarely need it.

### What are the pros and cons of binning a continuous feature?

Binning (age bands, BMI categories) lets a linear model capture non-linear effects, reduces noise and outlier
influence, and produces explainable results ("patients over 75 have higher risk"). The cost is lost information within
each bin and arbitrary cut-offs. Choose clinically meaningful edges or quantiles (`pd.cut`, `pd.qcut`,
`KBinsDiscretizer`), and fit quantile edges on training data only.

### How do you create features from dates and event histories? {core}

From timestamps: durations (length of stay), weekday and weekend, month or season, hour (cyclical sin/cos for neural
networks), and age at the event. From histories: rolling counts and recency per patient, such as admissions in the
last 30, 90 and 365 days, days since the last discharge, last lab value and trend.

The critical rule is **point-in-time correctness**: aggregate only events strictly before the prediction moment. In
pandas that means sorting by patient and time, then using `groupby().shift()` and time-based rolling windows. In SQL,
it means window functions with the right frame.

### How would you turn clinical notes into features?

There are three levels. **TF-IDF** n-grams with a regularised linear model is a strong, explainable baseline.
**Pre-trained embeddings** (sentence transformers, clinical language models) capture meaning better. **LLM
extraction** pulls structured fields (smoking status, social determinants) into columns, validated against a schema.

PHI handling matters: de-identify or keep processing inside a HIPAA-compliant environment with a BAA. **Your
angle:** schema-validated LLM extraction into structured fields with Pydantic is exactly what you did on the
Document AI platform.

### What feature selection methods do you know? {core}

There are three families:

- **Filter** methods score features independently: variance threshold, correlation, mutual information,
  `SelectKBest`.
- **Wrapper** methods search subsets using a model: RFE, `RFECV`, sequential forward or backward selection.
- **Embedded** methods select during training: L1 regularisation, tree-based importance with `SelectFromModel`.

The selection must happen inside the cross-validation pipeline. Selecting on the full dataset first is a classic leak:
on pure noise it can produce 85% "accuracy". Domain review matters as much as the algorithm, to remove leaky or
unstable features.

### Impurity importance, permutation importance or SHAP: which do you trust? {deep}

Impurity importance from trees is computed on training data and biased toward continuous and high-cardinality
features: a random ID column can look important. **Permutation importance** shuffles each feature on held-out data
and measures the score drop, which is more reliable, although correlated features share credit. **SHAP** gives
per-prediction attributions that, added to a baseline (the average prediction), sum to the model's output for that
patient. It is useful for global importance plots and for
explaining an individual patient's score to a clinician.

None of them is causal. A feature can be predictive because it is a proxy, for example payer type as a proxy for
socioeconomic status.

### What are Pipeline and ColumnTransformer, and why use them? {core}

`Pipeline` chains preprocessing steps and a model into one estimator. `ColumnTransformer` routes different columns to
different preprocessing (impute and scale numerics, one-hot categoricals) and concatenates the results.

Together they guarantee that every fitted step learns only from training data, including within each
cross-validation fold, which prevents leakage. They let you tune preprocessing and model hyperparameters together
(`prep__num__impute__strategy`, `model__C`), and they give you **one artefact to save and serve**, so production
applies exactly the same transformations as training. That removes a whole class of training–serving skew bugs.

### What is the difference between fit, transform and fit_transform, and why never fit on test data? {core}

`fit` learns parameters from data (a scaler's mean and standard deviation, an encoder's categories, a model's weights).
`transform` applies them. `fit_transform` does both on the same data. If you fit on test data, the preprocessing
encodes information about the test set, so your evaluation is optimistic and won't match production, where future
data is unknown.

So fit on the training data, then only transform validation, test and live data. A pipeline enforces this
automatically.

### GridSearchCV, RandomizedSearchCV or Bayesian optimisation? {core}

Grid search tries every combination. It is fine for one or two hyperparameters, but the cost explodes combinatorially.
Randomized search samples a fixed budget from distributions (log-uniform for learning rate and C). With several
hyperparameters it usually finds an equally good result much faster, because only a few hyperparameters really
matter. Bayesian optimisation (Optuna) models which regions look promising and samples there next, which is best when
each fit is expensive.

In all cases, tune with cross-validation on the training data, use a metric that matches the decision (PR-AUC rather
than accuracy for rare outcomes), and confirm on a held-out test set.

### What is nested cross-validation? {deep}

It is two loops. The inner loop tunes hyperparameters, and the outer loop evaluates the whole tuning procedure on folds
the tuning never saw. Reporting the best inner-loop CV score is optimistically biased, because you selected the
maximum of many noisy estimates. Nested CV gives an unbiased estimate of how the **tuned** model generalises. In
scikit-learn you pass a `GridSearchCV` object into `cross_val_score`. It costs inner × outer fits, so it is used
mostly for small datasets or rigorous comparisons.

### What is early stopping?

Training iteratively (boosting rounds, neural network epochs) while monitoring a validation set, and stopping when the
validation score hasn't improved for N rounds. Then you keep the best iteration. It is a regulariser: it prevents
overfitting from too many rounds and saves compute. In scikit-learn, `HistGradientBoostingClassifier(early_stopping=True,
n_iter_no_change=10)` does it automatically (the default, `early_stopping="auto"`, switches it on only above 10,000
samples), and `n_iter_` tells you how many rounds were used. XGBoost and LightGBM
use an evaluation set with early-stopping rounds.

### How do you save, version and load a trained model? {core}

I save the **entire fitted pipeline** with `joblib.dump`, so preprocessing and model travel together. I version it
with metadata: library versions, git commit, training data snapshot or query, hyperparameters, metrics and the
decision threshold. In practice that goes into a model registry such as MLflow, Vertex AI Model Registry or Azure ML,
with stages such as staging and production.

Two cautions. Pickle and joblib execute code on load, so only load trusted artefacts. And pin the scikit-learn
version between training and serving. For other runtimes or lower latency, export to ONNX.

### How do you prevent training–serving skew in features? {deep}

Compute features with the **same code** in both places: ship the fitted pipeline, or use a shared feature library or a
**feature store** that serves point-in-time-correct features offline for training and the same definitions online for
serving. Validate the schema of incoming requests (Pydantic in a FastAPI service), log the features actually used at
inference, and compare their distributions with the training data as part of monitoring.

Typical skew sources: different defaults for missing values, unit differences (mg/dL versus mmol/L), time zones, and
aggregates computed with data that wasn't available yet.

### What are interaction and polynomial features, and when do you need them?

An interaction feature combines two features, for example age × number of comorbidities, or a medication flag ×
kidney function, so a model can learn that one feature's effect depends on another. `PolynomialFeatures` generates
products and powers automatically. They matter for **linear models**, which can't learn interactions otherwise. Tree
ensembles and neural networks discover interactions on their own. Too many polynomial terms cause overfitting, so
regularise or select.

### How do you handle outliers?

First decide whether they are **errors** or **real extremes**. A heart rate of 600 or a negative age is a data error:
fix it, set it to missing or drop it. A genuine $2M claim is real and possibly the most important case. For real
extremes: robust scaling, log transforms, capping at percentiles (winsorising, with caps fitted on training data), or
robust models (trees, Huber loss). Detect them with domain ranges, IQR or z-score rules, or isolation forests, and
never silently drop rows that the production system will still see.

### Your JD mentions "model optimisation". What would you do? {core}

I'd cover both meanings. **Predictive** optimisation: improve features, tune hyperparameters with randomized or
Bayesian search under cross-validation, regularise, use early stopping, try ensembles, then tune the decision
threshold and calibrate the probabilities against the business cost. **Operational** optimisation: reduce latency
and cost with smaller or distilled models, ONNX export, quantisation, batching and caching predictions, then
monitor drift so performance holds up after deployment.

For a full-stack role, the operational side connects to what you've done: containerised FastAPI services on Cloud Run
with versioned releases through Dev, SIT and UAT.

## Coding problems

### Find and fix the leak {medium core}

A colleague reports 85% cross-validated accuracy for a model on 100 patients × 5,000 genomic features. You suspect the
data is pure noise. The code selects the top 20 features on the full dataset, then cross-validates. Show the problem
and fix it.

```python norun
X_selected = SelectKBest(f_classif, k=20).fit_transform(X, y)
cross_val_score(LogisticRegression(), X_selected, y, cv=5)
```

#### Hints

1. List every step that looks at `y`, and ask which rows each step saw.
2. With 5,000 random features, some correlate with `y` by chance. Choosing them using the validation labels makes
   the validation score meaningless.
3. Put the selector inside a `Pipeline`, so each fold selects features using only its training part.

#### Solution

Any step that looks at `y` (or even at the distribution of `X`) must be fitted inside the cross-validation loop. A
pipeline does exactly that.

```python
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline

rng = np.random.default_rng(0)
X = rng.normal(size=(100, 5000))        # pure noise
y = rng.integers(0, 2, size=100)        # random labels: no real signal exists
cv = StratifiedKFold(5, shuffle=True, random_state=0)

# Leaky: selection saw every label, including the validation folds.
X_selected = SelectKBest(f_classif, k=20).fit_transform(X, y)
leaky = cross_val_score(LogisticRegression(), X_selected, y, cv=cv).mean()

# Fixed: selection is refit on each training fold only.
honest = cross_val_score(make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression()), X, y, cv=cv).mean()

print(f"leaky CV accuracy={leaky:.2f}, honest CV accuracy={honest:.2f}")
assert leaky > 0.75      # an impressive-looking score on random data
assert honest < 0.65     # about a coin flip, which is the truth
```

#### Follow-ups

- **Other steps that leak the same way?** Scaling, imputation, PCA, target encoding, SMOTE and outlier capping. Any
  fitted step belongs in the pipeline.
- **How would you notice in real life?** A score too good for the problem, a huge gap to the held-out or production
  score, or one feature dominating importance.

### Build a leak-free preprocessing pipeline for mixed patient data {medium core}

Write `build_pipeline(numeric, categorical)` that returns an unfitted scikit-learn pipeline:

- Numeric columns: impute with the median, add missing indicators, standardise.
- Categorical columns: impute with the constant "missing", one-hot encode, ignore unseen categories.
- Model: logistic regression with balanced class weights.

It must train on a pandas DataFrame and predict on new rows with unseen categories and NaNs.

#### Hints

1. Use a `ColumnTransformer` with two named sub-pipelines, `num` and `cat`.
2. `SimpleImputer(strategy="median", add_indicator=True)`, then `StandardScaler()` for numbers.
3. `SimpleImputer(strategy="constant", fill_value="missing")`, then `OneHotEncoder(handle_unknown="ignore")` for
   categories.

#### Solution

```python
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def build_pipeline(numeric: list[str], categorical: list[str]) -> Pipeline:
    num = Pipeline([
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
    ])
    cat = Pipeline([
        ("impute", SimpleImputer(strategy="constant", fill_value="missing")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    prep = ColumnTransformer([("num", num, numeric), ("cat", cat, categorical)])
    return Pipeline([("prep", prep), ("model", LogisticRegression(class_weight="balanced", max_iter=1000))])


rng = np.random.default_rng(1)
n = 600
df = pd.DataFrame({
    "age": rng.integers(20, 90, n).astype(float),
    "creatinine": np.where(rng.random(n) < 0.2, np.nan, rng.normal(1.0, 0.3, n)),
    "discharge_to": rng.choice(["home", "snf", "home_health", None], n),
})
y = ((df.age > 70) & (df.discharge_to == "snf")).astype(int) | (rng.random(n) < 0.05).astype(int)

pipe = build_pipeline(["age", "creatinine"], ["discharge_to"])
scores = cross_val_score(pipe, df, y, cv=5, scoring="roc_auc")
assert scores.mean() > 0.8

pipe.fit(df, y)
new = pd.DataFrame([{"age": 82.0, "creatinine": np.nan, "discharge_to": "hospice"}])   # unseen category + NaN
assert 0 <= pipe.predict_proba(new)[0, 1] <= 1
names = list(pipe.named_steps["prep"].get_feature_names_out())
assert "num__missingindicator_creatinine" in names and "cat__discharge_to_missing" in names
```

#### Follow-ups

- **Tune the imputation strategy too?** Grid over `prep__num__impute__strategy: ["mean", "median"]` together with
  `model__C`.
- **Swap in gradient boosting?** Drop the scaler (not needed) and consider `OrdinalEncoder` for categories, or let
  `HistGradientBoostingClassifier` handle categoricals and NaNs natively.

### Target-encode a high-cardinality column, out of fold {medium}

Implement smoothed target encoding: each category becomes `(count * category_mean + m * global_mean) / (count + m)`.
Write `fit_target_encoding(cats, y, m)` returning a mapping plus the global mean, and `oof_target_encode(cats, y, m,
k)` producing training-set encodings where each row's value is computed **without its own fold**.

```text
cats = ["A", "A", "B", "C"], y = [1, 0, 1, 1], m = 1
global mean = 0.75; A -> (2*0.5 + 0.75)/3 = 0.583; B -> (1*1 + 0.75)/2 = 0.875
```

#### Hints

1. Group by category to get counts and means, for example with `pandas.groupby(...).agg(["count", "mean"])`.
2. Unseen categories at inference get the global mean.
3. For out-of-fold encoding, split rows into k folds. For each fold, fit on the other folds and transform that fold.

#### Solution

Smoothing pulls rare categories toward the global mean (a provider with one patient and one readmission should not get
an encoding of 1.0). The out-of-fold version stops a row's own label leaking into its feature.

```python
import numpy as np
import pandas as pd
from sklearn.model_selection import KFold


def fit_target_encoding(cats, y, m: float = 10.0) -> tuple[dict, float]:
    df = pd.DataFrame({"cat": cats, "y": y})
    global_mean = float(df.y.mean())
    stats = df.groupby("cat").y.agg(["count", "mean"])
    enc = (stats["count"] * stats["mean"] + m * global_mean) / (stats["count"] + m)
    return enc.to_dict(), global_mean


def apply_target_encoding(cats, mapping: dict, global_mean: float) -> np.ndarray:
    return np.array([mapping.get(c, global_mean) for c in cats])


def oof_target_encode(cats, y, m: float = 10.0, k: int = 5, seed: int = 0) -> np.ndarray:
    cats, y = np.asarray(cats, dtype=object), np.asarray(y)
    out = np.empty(len(y))
    for train_idx, val_idx in KFold(k, shuffle=True, random_state=seed).split(cats):
        mapping, gm = fit_target_encoding(cats[train_idx], y[train_idx], m)
        out[val_idx] = apply_target_encoding(cats[val_idx], mapping, gm)
    return out


mapping, gm = fit_target_encoding(["A", "A", "B", "C"], [1, 0, 1, 1], m=1)
assert gm == 0.75 and round(mapping["A"], 3) == 0.583 and mapping["B"] == 0.875
assert apply_target_encoding(["Z"], mapping, gm)[0] == 0.75          # unseen -> global mean

# Why out-of-fold matters: on random labels, in-sample encoding of rare IDs "predicts" y; OOF does not.
rng = np.random.default_rng(0)
ids = rng.integers(0, 400, 1000).astype(str)                         # ~2.5 rows per provider id
y = rng.integers(0, 2, 1000)                                         # no real relationship
in_sample = apply_target_encoding(ids, *fit_target_encoding(ids, y, m=1))
oof = oof_target_encode(ids, y, m=1)
corr_in = np.corrcoef(in_sample, y)[0, 1]
corr_oof = np.corrcoef(oof, y)[0, 1]
print(f"correlation with y: in-sample={corr_in:.2f}, out-of-fold={corr_oof:.2f}")
assert corr_in > 0.4 and abs(corr_oof) < 0.15
```

Complexity: O(n) per fit, O(k · n) for out-of-fold encoding.

#### Follow-ups

- **scikit-learn's version?** `sklearn.preprocessing.TargetEncoder` does cross-fitting inside `fit_transform`, and
  plain `transform` for new data. Use it inside a pipeline.
- **How to pick m?** Treat it as a hyperparameter. Larger m trusts the global mean more for small categories.

### Build the 30-day readmission label and time features with pandas {medium core}

Given an admissions table `(patient_id, admit, discharge)`, add these columns:

- `los_days`: length of stay in days.
- `admit_weekday`: 0 = Monday.
- `days_since_last_discharge`: NaN for a patient's first admission.
- `prior_admissions`: the count of this patient's earlier admissions.
- `readmit_30d`: 1 if the patient's **next** admission starts within 30 days of this discharge.

#### Hints

1. Sort by patient and admit time first. Everything else is `groupby("patient_id")` plus `shift`.
2. The previous discharge is `groupby(...).discharge.shift(1)`, and the next admit is
   `groupby(...).admit.shift(-1)`.
3. `cumcount()` gives the number of earlier rows per patient. Compare time differences with `pd.Timedelta(days=30)`.

#### Solution

Features look **backward** (shift 1, cumcount). The label looks **forward** (shift −1). Keeping that distinction
explicit is how you avoid leaking the label into the features.

```python
import numpy as np
import pandas as pd


def add_readmission_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["admit"] = pd.to_datetime(out["admit"])
    out["discharge"] = pd.to_datetime(out["discharge"])
    out = out.sort_values(["patient_id", "admit"]).reset_index(drop=True)
    g = out.groupby("patient_id")

    out["los_days"] = (out["discharge"] - out["admit"]).dt.total_seconds() / 86400
    out["admit_weekday"] = out["admit"].dt.weekday
    out["days_since_last_discharge"] = (out["admit"] - g["discharge"].shift(1)).dt.days      # backward-looking
    out["prior_admissions"] = g.cumcount()                                                  # backward-looking
    gap_to_next = g["admit"].shift(-1) - out["discharge"]                                   # forward-looking: label only
    out["readmit_30d"] = (gap_to_next <= pd.Timedelta(days=30)).astype(int)
    return out


admissions = pd.DataFrame({
    "patient_id": ["P1", "P1", "P2", "P1", "P2"],
    "admit":     ["2025-01-01", "2025-01-20", "2025-02-01", "2025-04-01", "2025-05-15"],
    "discharge": ["2025-01-05", "2025-01-25", "2025-02-03", "2025-04-04", "2025-05-16"],
})
f = add_readmission_features(admissions)

p1 = f[f.patient_id == "P1"]
assert p1.los_days.tolist() == [4.0, 5.0, 3.0]
assert p1.readmit_30d.tolist() == [1, 0, 0]                # 15 days, then 66 days, then no next admission
assert p1.prior_admissions.tolist() == [0, 1, 2]
assert np.isnan(p1.days_since_last_discharge.iloc[0]) and p1.days_since_last_discharge.iloc[1] == 15
p2 = f[f.patient_id == "P2"]
assert p2.readmit_30d.tolist() == [0, 0]                   # 101 days apart
assert f.loc[0, "admit_weekday"] == 2                      # 2025-01-01 was a Wednesday
```

Complexity: O(n log n) for the sort, then O(n).

#### Follow-ups

- **Exclude planned readmissions?** Filter or flag elective follow-up admissions (planned chemotherapy, staged
  surgery) before computing the label, as CMS readmission measures do.
- **Admissions in the last 365 days?** Use a time-based rolling count per patient, for example a rolling window of
  `"365D"` on an admit-indexed series, minus the current row.
- **Patients who died after discharge?** They can't be readmitted. Exclude them or treat death as a competing outcome.
