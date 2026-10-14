---
title: Evaluating models
goal: Choose, compute and defend the right metric for a healthcare model, covering precision and recall, ROC and PR curves, calibration, thresholds, imbalance and regression error.
minutes: 60
---

"How would you evaluate that model?" is the most common ML follow-up question, and it is where weak candidates say
"accuracy". In healthcare the positive class is usually rare and the two kinds of error cost very different amounts,
so a strong answer ties the **metric to the decision**: who acts on the prediction, and what a miss or a false alarm
costs.

This chapter gives you the definitions cold, the reasoning behind choosing between them, and tested code that
computes each one by hand and with scikit-learn.

## The confusion matrix and the metrics built on it

| | Predicted positive | Predicted negative |
|---|---|---|
| **Actually positive** | True positive (TP) | False negative (FN): a missed case |
| **Actually negative** | False positive (FP): a false alarm | True negative (TN) |

| Metric | Formula | Question it answers | Also called |
|---|---|---|---|
| Accuracy | (TP + TN) / all | How often is it right overall? | |
| Precision | TP / (TP + FP) | When it flags someone, how often is it right? | Positive predictive value (PPV) |
| Recall | TP / (TP + FN) | Of the real cases, how many did it catch? | Sensitivity, true positive rate (TPR) |
| Specificity | TN / (TN + FP) | Of the healthy, how many did it clear? | True negative rate (TNR) |
| False positive rate | FP / (FP + TN) | Of the healthy, how many did it alarm on? | 1 − specificity |
| Negative predictive value | TN / (TN + FN) | When it says "negative", how often is it right? | NPV |
| F1 | 2 · P · R / (P + R) | A single number balancing precision and recall | Harmonic mean |
| Fβ | (1 + β²) · P · R / (β² · P + R) | F1 with recall weighted β times as much | F2 favours recall |

**Worked example:** a screening model runs on 1,000 patients, 50 of whom have the disease. It flags 80, and 40 of
those are real cases.

```python
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, fbeta_score,
                             precision_score, recall_score)

# Build label lists that match the story: TP=40, FN=10, FP=40, TN=910.
y_true = [1] * 40 + [1] * 10 + [0] * 40 + [0] * 910
y_pred = [1] * 40 + [0] * 10 + [1] * 40 + [0] * 910

tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()   # sklearn orders it [[TN, FP], [FN, TP]]
assert (tp, fn, fp, tn) == (40, 10, 40, 910)

assert accuracy_score(y_true, y_pred) == 0.95       # looks great...
assert precision_score(y_true, y_pred) == 0.5       # ...but half the alarms are false
assert recall_score(y_true, y_pred) == 0.8          # and 1 in 5 sick patients is missed
specificity = tn / (tn + fp)
assert round(specificity, 3) == 0.958
assert round(f1_score(y_true, y_pred), 3) == 0.615
assert fbeta_score(y_true, y_pred, beta=2) > f1_score(y_true, y_pred)   # F2 rewards the higher recall
```

### The accuracy trap

With 5% prevalence, a model that **always says "no"** is 95% accurate and catches nobody. Always report the
prevalence alongside accuracy, and prefer precision, recall, PR-AUC or cost. That is why the baseline matters.

```python
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, recall_score

y = np.array([1] * 50 + [0] * 950)
X = np.zeros((len(y), 1))
always_no = DummyClassifier(strategy="most_frequent").fit(X, y)
pred = always_no.predict(X)
assert accuracy_score(y, pred) == 0.95
assert recall_score(y, pred) == 0.0
```

## Precision or recall? Tie it to the decision

| Use case | What a false negative costs | What a false positive costs | Optimise for |
|---|---|---|---|
| Cancer or diabetic retinopathy screening (a positive leads to a confirmatory test) | A missed cancer | An extra test | **Recall**, at acceptable specificity |
| Sepsis alert in the ICU | A missed sepsis | **Alert fatigue**: nurses start ignoring alerts | Recall, with a precision floor |
| Readmission outreach with 50 nurse calls per day | A missed high-risk patient | A wasted call | **Precision at k** (the top 50) |
| Claims fraud investigation | Lost money | Investigator time, friction for providers | Precision at the top of the list |
| Auto-approving prior authorisations | Not applicable | Approving something that should be reviewed | **Precision of approvals**; send the rest to humans |
| Document AI field extraction | A missed field means manual entry | A **wrong value accepted silently** | Precision on auto-accepted fields; route low confidence to HITL |

**Your angle:** In the LDH Medicaid Document AI platform, the Pydantic validation gate and HITL review together are a
precision safeguard. Uncertain or invalid extractions go to a human instead of being auto-submitted. That is exactly
the "precision of the automated path, recall through review" pattern.

## Threshold-free metrics: ROC-AUC and PR-AUC

A classifier outputs a score. Every threshold gives a different confusion matrix. Curves summarise all thresholds at
once.

- **ROC curve:** true positive rate (recall) against false positive rate. **ROC-AUC** is the probability that a
  randomly chosen positive gets a higher score than a randomly chosen negative. 0.5 is random and 1.0 is perfect
  ranking. It ignores prevalence, which makes it stable but flattering when positives are rare.
- **Precision–recall curve:** precision against recall. **PR-AUC** (average precision) has a baseline equal to the
  **prevalence**, not 0.5. It focuses on how clean the top of the ranking is, so it is the better headline metric
  for rare outcomes.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split

X, y = make_classification(n_samples=3000, n_features=10, n_informative=4, weights=[0.95], flip_y=0.01, random_state=3)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, stratify=y, random_state=0)
scores = LogisticRegression().fit(X_tr, y_tr).predict_proba(X_te)[:, 1]

roc = roc_auc_score(y_te, scores)
pr = average_precision_score(y_te, scores)
prevalence = y_te.mean()
print(f"prevalence={prevalence:.3f}  ROC-AUC={roc:.3f}  PR-AUC={pr:.3f}")
assert roc > 0.8          # looks strong...
assert pr < roc           # ...while PR-AUC tells you the top of the list is much less clean
assert pr > 3 * prevalence  # still far better than the random baseline, which is the prevalence

# A random scorer: ROC-AUC about 0.5, PR-AUC about the prevalence.
rand = np.random.default_rng(0).random(len(y_te))
assert abs(roc_auc_score(y_te, rand) - 0.5) < 0.1
assert abs(average_precision_score(y_te, rand) - prevalence) < 0.05
```

## Probabilities: log loss and calibration

When a care manager sees "risk 0.30", they read it as "30 in 100 patients like this are readmitted". That is only
true if the model is **calibrated**.

- **Log loss** (cross-entropy) is −mean(y·log p + (1 − y)·log(1 − p)). It punishes confident wrong answers hard.
  It is what logistic regression and neural networks minimise.
- **Brier score** is the mean of (p − y)²: the mean squared error of probabilities. Lower is better.
- A **calibration curve** (reliability diagram) bins predictions and compares the mean predicted probability with
  the observed rate in each bin. A calibrated model sits on the diagonal.
- **Fix poor calibration** with `CalibratedClassifierCV`: Platt scaling (`method="sigmoid"`) for small data,
  isotonic regression for larger data. Calibrate on data the model was not trained on. Boosted trees, SVMs, Naive
  Bayes and models trained on resampled data are often miscalibrated. Logistic regression is usually well calibrated.

```python
from sklearn.calibration import CalibratedClassifierCV
from sklearn.datasets import make_classification
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import GaussianNB

# Redundant (correlated) features break Naive Bayes' independence assumption, so it is overconfident.
X, y = make_classification(n_samples=4000, n_features=20, n_informative=4, n_redundant=10, weights=[0.8], random_state=0)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.5, stratify=y, random_state=0)

raw = GaussianNB().fit(X_tr, y_tr).predict_proba(X_te)[:, 1]
cal = CalibratedClassifierCV(GaussianNB(), method="isotonic", cv=5).fit(X_tr, y_tr).predict_proba(X_te)[:, 1]

print(f"Brier raw={brier_score_loss(y_te, raw):.4f} calibrated={brier_score_loss(y_te, cal):.4f}")
assert brier_score_loss(y_te, cal) < brier_score_loss(y_te, raw)
assert log_loss(y_te, cal) < log_loss(y_te, raw)
# Calibration fixes the probabilities, not the ranking: ROC-AUC barely moves.
assert abs(roc_auc_score(y_te, cal) - roc_auc_score(y_te, raw)) < 0.01
```

## Choosing the threshold

0.5 is just a default. Pick the threshold from the **costs**, or from **capacity**:

- **Cost-based:** if a missed readmission costs 10 times a wasted call, choose the threshold that minimises
  10·FN + 1·FP on validation data.
- **Capacity-based:** if the team can call 50 patients a day, take the top 50 scores. The metric is then
  **precision at 50**.
- **Constraint-based:** "recall at least 90%" (screening), then maximise precision under that constraint.
- In scikit-learn 1.5 and later, `TunedThresholdClassifierCV` tunes the threshold with cross-validation for a
  scorer you choose, and `FixedThresholdClassifier` applies a chosen threshold.

Tune the threshold on validation data, never on the test set.

## Multi-class averaging

For more than two classes (for example, document type: MAGI form, Non-MAGI form, paystub), compute precision and
recall per class, then average:

- **Macro:** a plain mean over classes, so every class counts equally. Use it when rare classes matter.
- **Weighted:** a mean weighted by class support.
- **Micro:** pools all TP, FP and FN first. For single-label multi-class it equals accuracy.

```python
from sklearn.metrics import accuracy_score, f1_score

y_true = ["paystub"] * 8 + ["magi"] * 3 + ["non_magi"] * 1
y_pred = ["paystub"] * 8 + ["magi", "magi", "paystub"] + ["paystub"]

macro = f1_score(y_true, y_pred, average="macro", zero_division=0)
micro = f1_score(y_true, y_pred, average="micro")
weighted = f1_score(y_true, y_pred, average="weighted", zero_division=0)
print(f"macro={macro:.3f} weighted={weighted:.3f} micro={micro:.3f}")
assert micro == accuracy_score(y_true, y_pred)   # 10 of 12 right
assert macro < weighted < micro                  # the missed rare class drags macro down most
```

## Regression metrics

| Metric | Formula | Read it as | Watch out for |
|---|---|---|---|
| MAE | mean(abs(y − ŷ)) | "Off by 1.2 days on average" | Treats all errors linearly; robust to outliers |
| MSE | mean((y − ŷ)²) | Squared units, hard to explain | Dominated by large errors |
| RMSE | sqrt(MSE) | Same units as y; penalises big misses | Sensitive to outliers |
| R² | 1 − SS_res / SS_tot | Share of variance explained (1 is perfect, 0 is "predict the mean") | Can be negative; says nothing about bias |
| MAPE | mean(abs((y − ŷ) / y)) | "Off by 12%" | Undefined at y = 0 and explodes for small actual values; penalises over-prediction more than under-prediction |

For **length of stay**, MAE is easy to explain to operations staff. Use RMSE if long-stay misses are the costly
ones. Costs are skewed, so consider predicting log(cost), or use a quantile loss.

```python
import numpy as np
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, r2_score, root_mean_squared_error

los_true = np.array([2.0, 3.0, 5.0, 4.0, 10.0])
los_pred = np.array([2.5, 3.0, 4.0, 4.5, 7.0])
err = los_pred - los_true

mae = np.abs(err).mean()
rmse = np.sqrt((err ** 2).mean())
r2 = 1 - (err ** 2).sum() / ((los_true - los_true.mean()) ** 2).sum()

assert np.isclose(mae, mean_absolute_error(los_true, los_pred)) and np.isclose(mae, 1.0)
assert np.isclose(rmse, root_mean_squared_error(los_true, los_pred))
assert np.isclose(r2, r2_score(los_true, los_pred))
assert rmse > mae      # the single 3-day miss on the long stay weighs more in RMSE
assert np.isclose(mean_absolute_percentage_error(los_true, los_pred), np.abs(err / los_true).mean())
```

## Class imbalance

Rare positives are the norm in healthcare. In order of preference:

1. **Use the right metric** (PR-AUC, recall at a precision floor, precision at k) and a **stratified** split.
2. **Move the threshold.** Often this is all you need, because the ranking (AUC) is fine.
3. **Class weights:** `class_weight="balanced"` weights each class by n_samples / (n_classes · class_count), so
   errors on the rare class cost more during training.
4. **Resampling:** random undersampling of the majority, oversampling of the minority, or SMOTE (synthetic minority
   samples from the `imbalanced-learn` library). Resample **only the training folds**, inside the pipeline, never
   before splitting.
5. **More positive data**, or reframe the problem as anomaly detection when positives are extremely rare.

Weights and resampling distort predicted probabilities, so **recalibrate** afterwards if you need real risk numbers.

```python
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

X, y = make_classification(n_samples=3000, n_features=10, n_informative=4, weights=[0.95], flip_y=0.01, random_state=3)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, stratify=y, random_state=0)

plain = LogisticRegression().fit(X_tr, y_tr)
weighted = LogisticRegression(class_weight="balanced").fit(X_tr, y_tr)

r_plain, r_weighted = recall_score(y_te, plain.predict(X_te)), recall_score(y_te, weighted.predict(X_te))
print(f"recall plain={r_plain:.2f} balanced={r_weighted:.2f}")
assert r_weighted > r_plain + 0.4                                                     # catches far more positives
assert precision_score(y_te, weighted.predict(X_te)) < precision_score(y_te, plain.predict(X_te))  # at a precision cost
# The ranking barely changes: class weights act mostly like moving the threshold.
auc_gap = abs(roc_auc_score(y_te, weighted.predict_proba(X_te)[:, 1]) - roc_auc_score(y_te, plain.predict_proba(X_te)[:, 1]))
assert auc_gap < 0.02
```

## PPV, NPV and prevalence

Sensitivity and specificity are properties of the test. **PPV depends on prevalence.** By Bayes' rule:

PPV = sens · prev / (sens · prev + (1 − spec) · (1 − prev))

```python
def ppv(sensitivity: float, specificity: float, prevalence: float) -> float:
    tp = sensitivity * prevalence
    fp = (1 - specificity) * (1 - prevalence)
    return tp / (tp + fp)


def npv(sensitivity: float, specificity: float, prevalence: float) -> float:
    tn = specificity * (1 - prevalence)
    fn = (1 - sensitivity) * prevalence
    return tn / (tn + fn)


# The same 90%-sensitive, 95%-specific model in two populations:
general = ppv(0.90, 0.95, 0.01)     # population screening, 1% prevalence
referred = ppv(0.90, 0.95, 0.20)    # specialist clinic, 20% prevalence
print(f"PPV at 1% prevalence = {general:.1%}, at 20% prevalence = {referred:.1%}")
assert round(general, 3) == 0.154    # 85% of alarms are false
assert round(referred, 3) == 0.818
assert npv(0.90, 0.95, 0.01) > 0.998
```

This is why a model validated in one hospital can disappoint in another with a different case mix. Always re-check
precision when the population changes.

## Fairness across groups

Report metrics **per subgroup** (age band, sex, race and ethnicity, language, payer such as Medicaid versus
commercial), not just overall:

- **Equal opportunity:** similar recall (TPR) across groups, so sick patients are equally likely to be caught.
- **Equalised odds:** similar TPR and FPR.
- **Calibration within groups:** a score of 0.3 means 30% in every group.
- **Demographic parity:** similar flag rates. This is often inappropriate when base rates differ.

These criteria generally cannot all hold at once when base rates differ, so choose with clinical and compliance
stakeholders. Watch **proxy labels**: a widely cited 2019 study in *Science* (Obermeyer et al.) found an algorithm
used healthcare **cost** as a proxy for health **need**. Because less money was historically spent on Black patients
with the same level of need, it systematically under-referred them.

## A/B testing basics

To prove a model **changes outcomes** (not just offline AUC), run a controlled experiment:

- **Hypothesis and primary metric**, fixed in advance: "AI-prioritised outreach lowers the 30-day readmission rate."
- **Randomise** the unit (patient, clinic or nurse) into control and treatment, with a sample size from a
  **power** calculation (typically 80% power at α = 0.05 for the smallest effect worth detecting).
- **Analyse** with the right test (two-proportion z-test, t-test), report a confidence interval, and don't peek and
  stop early without a sequential design. Correct for multiple metrics.
- In healthcare, start with **silent (shadow) mode**: the model scores but nobody acts, so you can compare against
  outcomes. Then do a staged rollout with clinical oversight.

```python
from math import sqrt

from scipy.stats import norm


def two_proportion_z_test(x1: int, n1: int, x2: int, n2: int) -> tuple[float, float]:
    """Return (z, two-sided p-value) for H0: the two rates are equal."""
    p1, p2 = x1 / n1, x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    z = (p1 - p2) / se
    return z, 2 * norm.sf(abs(z))


# Control: 100 of 1,000 readmitted (10%). Treatment: 70 of 1,000 (7%).
z, p = two_proportion_z_test(100, 1000, 70, 1000)
print(f"z={z:.2f}, p={p:.4f}")
assert round(z, 2) == 2.41 and round(p, 3) == 0.016   # significant at 0.05
```

## Interview questions

### Define precision, recall and specificity using the confusion matrix. {core}

Precision is TP / (TP + FP): of everyone the model flags, the share that really are positive. Recall (sensitivity) is
TP / (TP + FN): of all real positives, the share it catches. Specificity is TN / (TN + FP): of all real negatives,
the share it correctly clears.

A memory aid: precision asks about the **predictions** ("when I say yes, am I right?"), recall asks about the
**actual cases** ("did I find them all?"). Precision is also called PPV, and recall is also called TPR.

### Why is accuracy misleading on imbalanced data? {core}

With a rare outcome, the majority class dominates accuracy. If 5% of patients are readmitted, predicting "no" for
everyone scores 95% accuracy with zero recall. Accuracy hides the errors you care about.

Use metrics that focus on the positive class: precision, recall, F1 or Fβ, PR-AUC, precision at k, or an explicit
cost function. Always report the prevalence so readers can judge the numbers.

### For cancer screening, would you optimise precision or recall? And for a sepsis alert? {core}

Screening is recall-first. A missed cancer is far worse than a false positive that leads to a confirmatory test, so I'd
set the threshold for high sensitivity (say 95%) and maximise specificity under that constraint.

A sepsis alert also needs high recall, but precision matters more. Too many false alarms cause alert fatigue, and
clinicians start ignoring the alert, which destroys real-world recall. So I'd agree a precision floor with the
clinical team, tune on validation data, and monitor override rates after go-live.

### What is F1, and when would you use F-beta instead?

F1 is the harmonic mean of precision and recall, 2PR / (P + R). It is high only if both are high, which makes it a
reasonable single number when both matter equally and classes are imbalanced.

Fβ weights recall β times as much as precision. F2 suits screening, where misses are worse. F0.5 suits fraud
investigation, where false positives waste investigator time. Better still is to state the actual costs and optimise
expected cost.

### Explain the ROC curve and AUC. What does an AUC of 0.8 mean? {core}

The ROC curve plots the true positive rate against the false positive rate as the threshold moves from 1 to 0. AUC is
the area under it. An AUC of 0.8 means that if you pick one random positive and one random negative, the model scores
the positive higher 80% of the time. 0.5 is a coin flip and 1.0 is perfect ranking.

AUC measures **ranking** only. It says nothing about calibration or about performance at your actual operating
threshold, so pair it with a threshold-specific metric.

### ROC-AUC versus PR-AUC: when do you prefer PR-AUC? {core}

When positives are rare and you care about the top of the ranking, which is most healthcare problems. ROC-AUC
includes true negatives through the false positive rate. With 99% negatives, many false positives still produce a
small FPR, so ROC-AUC looks flattering. PR-AUC uses precision, which collapses when false positives swamp the true
positives.

The PR baseline is the prevalence (0.05 for a 5% outcome), not 0.5. So report it next to the prevalence: "PR-AUC 0.37
against a 0.05 baseline."

### How do you choose a classification threshold? {core}

From the decision, not the default 0.5. There are three common approaches:

1. Minimise expected cost on validation data, for example 10·FN + 1·FP.
2. Meet a constraint, such as "recall ≥ 90%", and maximise precision under it.
3. Match capacity: if care managers can call 50 patients a day, take the top 50 and report precision at 50.

Tune on validation data or with cross-validation (scikit-learn's `TunedThresholdClassifierCV`), never on the test
set, and revisit it when prevalence or capacity changes.

### What is log loss, and why would you use it?

Log loss (cross-entropy) is the negative mean log-probability the model assigned to the true class. It rewards
confident correct predictions and heavily punishes confident wrong ones (predicting 0.99 for a negative). It
evaluates the **probabilities** themselves, which matters when the scores drive decisions as risks. It is the loss
that logistic regression and neural networks minimise. Lower is better. Compare models on the same data, because
its scale depends on prevalence.

### What is calibration, and why does it matter in healthcare? {core}

A model is calibrated if, among patients it scores at 0.3, about 30% actually have the outcome. Clinicians and care
managers read scores as probabilities, set thresholds on them, and combine them with costs. Miscalibrated scores lead
to wrong decisions even when the ranking (AUC) is good.

Check it with a calibration curve and the Brier score. Fix it with `CalibratedClassifierCV` (Platt or isotonic) on
held-out data. Boosted trees, SVMs, Naive Bayes and anything trained with class weights or resampling usually need
recalibration. Re-check calibration per subgroup and after deployment, because it drifts.

### How do you handle class imbalance? {core}

First, evaluate correctly: a stratified split, plus PR-AUC, recall and precision rather than accuracy. Often the
ranking is fine and only the **threshold** needs moving. If the model still under-learns the minority class, use
`class_weight="balanced"`, or resample the training folds (undersample the majority, oversample, or SMOTE), then
recalibrate, because weighting and resampling distort probabilities.

Getting more positive examples or better features usually beats any trick. For extremely rare events, consider
anomaly detection.

### Should you oversample before or after splitting the data? {deep}

After, and only on the training portion: inside each cross-validation fold, as a pipeline step. If you oversample or
apply SMOTE before splitting, copies or synthetic neighbours of the same patient land in both train and validation.
The model is then tested on near-duplicates of its training data, which inflates the score. The validation and test
sets must keep the real-world class ratio.

### MAE, RMSE or R²: how do you choose a regression metric? {core}

MAE is the average absolute error in the target's units, easy to explain ("off by 1.2 days") and robust to outliers.
RMSE squares errors before averaging, so it penalises large misses more. Use it when big errors are
disproportionately costly. R² is the share of variance explained compared with predicting the mean. It is useful for
comparing models on the same data, but it is unitless and can hide bias.

I'd report MAE or RMSE in business units and look at errors by segment, for example long stays versus short stays.

### Why can MAPE be a bad choice? {deep}

It divides by the true value, so it is undefined at zero and explodes near zero: a 1-day error on a 1-day stay is 100%.
It is also asymmetric: under-predictions are capped at 100% error, but over-predictions are not. That biases models
toward under-forecasting. Alternatives: MAE, weighted MAPE (sum of absolute errors divided by the sum of actuals), or
errors on a log scale.

### Macro, micro or weighted averaging: what is the difference?

For multi-class metrics: **macro** averages the per-class scores equally, so rare classes count as much as common
ones. **Weighted** averages them by class frequency. **Micro** pools all the counts first. For single-label
multi-class problems, micro-F1 equals accuracy.

If a rare document type or diagnosis matters, report macro (and the per-class table), because micro and weighted can
look fine while a rare class is never predicted.

### What are PPV and NPV, and how does prevalence change them? {deep}

PPV (precision) is the probability a flagged patient is truly positive. NPV is the probability a cleared patient is
truly negative. Unlike sensitivity and specificity, they depend on prevalence.

A test with 90% sensitivity and 95% specificity has a PPV of only about 15% at 1% prevalence, but about 82% at 20%
prevalence. That is why the same model performs very differently in population screening and in a specialist clinic.
Re-validate it in each deployment population.

### Your model scored very well in testing but performs poorly in production. What happened? {core}

I'd check, in order:

1. **Leakage** in the evaluation: features unavailable at prediction time, patients in both train and test,
   preprocessing fitted on all data, or random splits on time-ordered data.
2. **Training–serving skew:** the features are computed differently online (different code, units, defaults for
   missing values).
3. **Data drift:** a new population, coding changes (an ICD update), a new EHR workflow, or seasonality.
4. **Prevalence change**, which lowers precision even when the model is unchanged.
5. **Concept drift:** the relationship itself changed, for example a new care programme that reduces readmissions.

The fixes are point-in-time features, a shared feature pipeline for training and serving, time-based validation,
drift monitoring, and recalibration or retraining.

### How do you evaluate a model for fairness? {deep}

Slice every metric by subgroup: age, sex, race and ethnicity, language, payer type, site. Compare recall (equal
opportunity), false positive rates (equalised odds) and calibration within each group, with confidence intervals,
because small groups are noisy.

Audit the **label** too: proxy targets such as cost can encode historical under-treatment, as the 2019 *Science* study
of a care-management algorithm showed. Mitigations: better labels, more representative data, per-group thresholds
where clinically and legally appropriate, and ongoing monitoring. Agree the fairness criterion with clinical,
compliance and patient stakeholders, because the criteria conflict when base rates differ.

### How would you test whether a new model actually improves outcomes?

Offline metrics show the model ranks well, not that acting on it helps. I'd first run it in **shadow mode** to confirm
real-time performance and calibration. Then I'd run a randomised rollout: patients (or clinics, to avoid
contamination) are randomly assigned to model-driven or usual-care workflows. The primary outcome, for example the
30-day readmission rate, is fixed in advance, with a sample size from a power analysis.

I'd analyse with a two-proportion test and a confidence interval, watch guardrail metrics (alert volume, clinician
overrides, subgroup outcomes), and avoid stopping early on a lucky p-value.

### What does a p-value actually mean? {deep}

It is the probability of seeing a difference at least as extreme as the one observed **if the null hypothesis were
true**. It is not the probability that the null is true, and not the size of the effect. A p-value below 0.05 means
the result would be surprising under "no effect". Report it with the effect size and a confidence interval, and
remember that testing many metrics inflates false positives, so correct for multiple comparisons.

### How would you measure the quality of a document-extraction model? {core}

Measure at the **field** level against human-verified ground truth: per-field precision (wrong values accepted),
recall (fields missed) and exact-match accuracy after normalisation (dates, currency, names), plus character error
rate for free text. Then add the business metrics that matter: the **straight-through processing rate** (documents
needing no human edit), the HITL correction rate per field, time per review, and the error rate of what was finally
submitted.

**Your angle:** that is the LDH Medicaid Document AI work. Pydantic schema validation caught invalid or missing
fields before human review, and reviewer corrections are both a quality metric and labelled data for improving the
model.

### How do you evaluate a ranking used for outreach with limited capacity? {deep}

Use metrics at the cut-off you will actually act on: **precision at k** (how many of the top 50 are true high-risk
patients), **recall at k** (what share of all high-risk patients the top 50 captures) and **lift** (precision at k
divided by the prevalence). Plot them against k so the operations team can see the value of extra capacity.

## Coding problems

### Compute classification metrics by hand {easy core}

Given equal-length lists `y_true` and `y_pred` of 0/1 labels, return a dict with `tp`, `fp`, `fn`, `tn`,
`accuracy`, `precision`, `recall`, `specificity` and `f1`. Return 0.0 for any metric whose denominator is 0.

```text
y_true = [1, 0, 1, 1, 0, 0]
y_pred = [1, 1, 0, 1, 0, 0]
-> tp=2, fp=1, fn=1, tn=2, accuracy=0.667, precision=0.667, recall=0.667, specificity=0.667, f1=0.667
```

#### Hints

1. One pass with `zip` lets you count all four cells.
2. Write a tiny `safe_div(a, b)` helper so empty denominators return 0.0 instead of raising.
3. F1 = 2PR / (P + R), which is also 2TP / (2TP + FP + FN). The second form avoids a 0/0 case.

#### Solution

Count once, then derive everything from the four counts. Validate the input lengths, because interviewers like seeing
that.

```python
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score


def safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


def classification_metrics(y_true: list[int], y_pred: list[int]) -> dict[str, float]:
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have the same length")
    tp = fp = fn = tn = 0
    for t, p in zip(y_true, y_pred):
        if t == 1 and p == 1:
            tp += 1
        elif t == 0 and p == 1:
            fp += 1
        elif t == 1 and p == 0:
            fn += 1
        else:
            tn += 1
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "accuracy": safe_div(tp + tn, tp + fp + fn + tn),
        "precision": safe_div(tp, tp + fp),
        "recall": safe_div(tp, tp + fn),
        "specificity": safe_div(tn, tn + fp),
        "f1": safe_div(2 * tp, 2 * tp + fp + fn),
    }


m = classification_metrics([1, 0, 1, 1, 0, 0], [1, 1, 0, 1, 0, 0])
assert (m["tp"], m["fp"], m["fn"], m["tn"]) == (2, 1, 1, 2)
assert all(round(m[k], 3) == 0.667 for k in ["accuracy", "precision", "recall", "specificity", "f1"])

# No positive predictions: precision is defined as 0.0 here (sklearn warns and also returns 0.0).
none = classification_metrics([1, 0, 0], [0, 0, 0])
assert none["precision"] == 0.0 and none["recall"] == 0.0 and none["specificity"] == 1.0

# Agrees with scikit-learn on random data.
import random
rng = random.Random(7)
yt = [rng.randint(0, 1) for _ in range(200)]
yp = [rng.randint(0, 1) for _ in range(200)]
m = classification_metrics(yt, yp)
assert abs(m["precision"] - precision_score(yt, yp)) < 1e-12
assert abs(m["recall"] - recall_score(yt, yp)) < 1e-12
assert abs(m["f1"] - f1_score(yt, yp)) < 1e-12
assert abs(m["accuracy"] - accuracy_score(yt, yp)) < 1e-12
```

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **Multi-class?** Count a confusion matrix with `Counter((t, p) for ...)`, compute per-class precision and recall
  one-vs-rest, then macro- or weighted-average.
- **Vectorised?** With NumPy: `tp = ((y_true == 1) & (y_pred == 1)).sum()`, and so on.

### Choose the threshold that minimises cost {medium core}

You have validation labels and predicted probabilities. A false negative (missed readmission) costs `fn_cost` and a
false positive (unnecessary call) costs `fp_cost`. Return the threshold (from the candidate list) that minimises
total cost, with ties going to the higher threshold, which means fewer calls.

```text
y_true = [0, 0, 1, 1, 0, 1]
scores = [0.1, 0.4, 0.35, 0.8, 0.2, 0.6]
fn_cost=10, fp_cost=1, candidates=[0.3, 0.5, 0.7] -> 0.3 (cost 1) beats 0.5 (cost 10) and 0.7 (cost 20)
```

#### Hints

1. For one threshold t, predict positive when `score >= t`, then count FN and FP.
2. Loop over the candidates, compute `fn * fn_cost + fp * fp_cost`, and keep the best.
3. For speed on large data, sort scores once and sweep the thresholds with cumulative counts (O(n log n) in total).

#### Solution

The simple version is O(n · t), which is fine for a few hundred candidates. Mention the sorted sweep as the
optimisation.

```python
import numpy as np


def best_threshold(y_true, scores, fn_cost: float, fp_cost: float, candidates) -> tuple[float, float]:
    y = np.asarray(y_true)
    s = np.asarray(scores)
    best_t, best_cost = None, float("inf")
    for t in sorted(candidates):
        pred = s >= t
        fn = np.sum((y == 1) & ~pred)
        fp = np.sum((y == 0) & pred)
        cost = fn * fn_cost + fp * fp_cost
        if cost <= best_cost:          # "<=" while ascending means ties go to the higher threshold
            best_t, best_cost = t, float(cost)
    return best_t, best_cost


y_true = [0, 0, 1, 1, 0, 1]
scores = [0.1, 0.4, 0.35, 0.8, 0.2, 0.6]
assert best_threshold(y_true, scores, 10, 1, [0.3, 0.5, 0.7]) == (0.3, 1.0)
# If false alarms become expensive, the best threshold rises.
assert best_threshold(y_true, scores, 1, 10, [0.3, 0.5, 0.7]) == (0.5, 1.0)

# On a realistic model: the cost-optimal threshold with 10:1 costs is well below 0.5.
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
X, y = make_classification(n_samples=3000, weights=[0.9], n_informative=4, random_state=0)
X_tr, X_val, y_tr, y_val = train_test_split(X, y, stratify=y, random_state=0)
p = LogisticRegression().fit(X_tr, y_tr).predict_proba(X_val)[:, 1]
t, cost = best_threshold(y_val, p, fn_cost=10, fp_cost=1, candidates=np.linspace(0.05, 0.95, 19))
default_cost = best_threshold(y_val, p, 10, 1, [0.5])[1]
assert t < 0.5 and cost < default_cost
```

Complexity: O(n · t) as written; O(n log n) with a sorted cumulative sweep.

#### Follow-ups

- **Capacity of 50 calls a day instead of costs?** Sort by score and take the top 50. The "threshold" is the 50th
  score.
- **Where do you tune it?** On validation folds. Then report the test-set cost at that frozen threshold.

### Compute ROC-AUC without scikit-learn {medium}

Implement `roc_auc(y_true, scores)` using its probabilistic meaning: the fraction of (positive, negative) pairs where
the positive scores higher, counting ties as half.

#### Hints

1. The brute force compares every positive with every negative: O(P · N).
2. Faster: rank all scores (average ranks for ties). Then AUC = (sum of positive ranks − P(P + 1)/2) / (P · N). That is
   the Mann–Whitney U statistic.
3. `scipy.stats.rankdata` gives average ranks, or you can compute them after sorting.

#### Solution

Show the O(P·N) definition first, then the O(n log n) rank formula, and check both against scikit-learn.

```python
import numpy as np
from scipy.stats import rankdata
from sklearn.metrics import roc_auc_score


def roc_auc_pairs(y_true, scores) -> float:
    pos = [s for s, y in zip(scores, y_true) if y == 1]
    neg = [s for s, y in zip(scores, y_true) if y == 0]
    if not pos or not neg:
        raise ValueError("need at least one positive and one negative")
    wins = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def roc_auc_ranks(y_true, scores) -> float:
    y = np.asarray(y_true)
    ranks = rankdata(scores)                       # average ranks handle ties
    n_pos, n_neg = int(y.sum()), int(len(y) - y.sum())
    if n_pos == 0 or n_neg == 0:
        raise ValueError("need at least one positive and one negative")
    return float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


y = [0, 0, 1, 1]
s = [0.1, 0.4, 0.35, 0.8]
assert roc_auc_pairs(y, s) == 0.75 == roc_auc_ranks(y, s)
assert roc_auc_pairs([0, 1], [0.5, 0.5]) == 0.5               # a tie counts half

rng = np.random.default_rng(0)
yy = rng.integers(0, 2, 500)
ss = np.round(rng.random(500) + yy * 0.3, 2)                    # rounding creates ties on purpose
assert np.isclose(roc_auc_ranks(yy, ss), roc_auc_score(yy, ss))
assert np.isclose(roc_auc_pairs(yy, ss), roc_auc_score(yy, ss))
```

Complexity: pairs O(P · N); ranks O(n log n).

#### Follow-ups

- **Why does AUC ignore the threshold?** It only depends on the order of the scores. Any monotonic transform (such as
  calibration) leaves it unchanged.
- **Partial AUC?** Restrict to the region of clinically acceptable false positive rates, for example FPR ≤ 0.1.

### Precision and recall at k for an outreach list {easy}

Care managers can call `k` patients. Given patient ids, model scores and the set of ids actually readmitted, return
`(precision_at_k, recall_at_k)` for the top-k scores, breaking score ties by patient id.

#### Hints

1. Sort by `(-score, patient_id)` and take the first k ids.
2. Precision at k = hits / k. Recall at k = hits / total positives.
3. Guard against k = 0 and against having no positives.

#### Solution

```python
def precision_recall_at_k(ids: list[str], scores: list[float], positives: set[str], k: int) -> tuple[float, float]:
    ranked = [pid for _, pid in sorted(zip(scores, ids), key=lambda x: (-x[0], x[1]))]
    top = ranked[:k]
    hits = sum(pid in positives for pid in top)
    precision = hits / len(top) if top else 0.0
    recall = hits / len(positives) if positives else 0.0
    return precision, recall


ids = ["p1", "p2", "p3", "p4", "p5"]
scores = [0.9, 0.2, 0.75, 0.75, 0.1]
readmitted = {"p1", "p4", "p5"}
assert precision_recall_at_k(ids, scores, readmitted, 2) == (0.5, 1 / 3)    # top 2: p1, p3 (tie broken by id)
assert precision_recall_at_k(ids, scores, readmitted, 3) == (2 / 3, 2 / 3)
assert precision_recall_at_k(ids, scores, readmitted, 0) == (0.0, 0.0)
assert precision_recall_at_k(ids, scores, set(), 2) == (0.0, 0.0)
```

Complexity: O(n log n) for the sort; `heapq.nlargest` makes it O(n log k).

#### Follow-ups

- **Lift?** Precision at k divided by the overall prevalence: how many times better than calling at random.
- **Choosing k?** Plot precision and recall at k against k and let operations pick the capacity trade-off.
