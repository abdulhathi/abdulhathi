---
title: Machine learning fundamentals
goal: Explain the ML lifecycle, data splits, bias and variance, regularisation and the main algorithms well enough to pick and defend a model for a healthcare problem.
minutes: 75
---

When a role mentions building, training, evaluating or deploying ML models, expect at least a few classical ML
questions, even in a full-stack round. Interviewers are not looking for research depth. They want to hear that you
know the **workflow**, can **avoid the classic mistakes** (leakage, overfitting, wrong split) and can **choose a
sensible model and say why**.

This chapter builds that vocabulary from zero. It uses one running example, **predicting 30-day hospital
readmission**, because it is the most common healthcare ML problem and works for almost every question. Every code
block runs on synthetic data with scikit-learn 1.9.

## The one-minute mental model

Machine learning means **learning a function from examples** instead of writing the rules by hand. You show the
model many past cases: their **features** (inputs such as age, number of prior admissions, length of stay, HbA1c) and
their **label** (the answer, such as "readmitted within 30 days: yes/no"). Training finds parameters that map features
to labels well. **Inference** then applies the learned function to new cases.

| Term | Meaning | Readmission example |
|---|---|---|
| Feature (X) | An input column | age, prior admissions, length of stay, diagnosis group |
| Label / target (y) | What you predict | readmitted within 30 days (1) or not (0) |
| Model | The function family plus learned parameters | logistic regression with 12 learned weights |
| Parameters | Learned from data during training | the weights and the intercept |
| Hyperparameters | Chosen by you before training | regularisation strength `C`, tree depth, learning rate |
| Training | Fitting parameters to minimise a loss on the training data | minimise log loss |
| Inference | Using the fitted model on new data | score today's discharges |

| Type of learning | Data | Goal | Healthcare example |
|---|---|---|---|
| Supervised: classification | Features plus a categorical label | Predict a class or probability | Readmission yes/no, sepsis risk, claim denial |
| Supervised: regression | Features plus a numeric label | Predict a number | Length of stay, cost of care |
| Unsupervised: clustering | Features only | Find groups | Patient segments for care management |
| Unsupervised: dimensionality reduction | Features only | Compress features | Summarise 300 lab values into 10 components |
| Anomaly detection | Mostly normal data | Flag unusual cases | Fraudulent claims, abnormal vitals |
| Reinforcement learning | Actions plus rewards | Learn a policy | Treatment dosing research (rare in production) |
| Self-supervised (foundation models) | Raw text or images | Learn representations | LLMs, clinical embeddings |

## The ML lifecycle, end to end

```text
1. Frame the problem  ->  2. Get and understand data  ->  3. Prepare data and features
        ^                                                          |
        |                                                          v
8. Monitor and retrain  <-  7. Deploy  <-  6. Evaluate on test  <-  4. Baseline, then train models
                                                  ^                 |
                                                  +-- 5. Validate and tune (cross-validation)
```

1. **Frame the problem.** What decision will the prediction drive, and who acts on it? "Flag the top 10% riskiest
   discharges for a follow-up call." This fixes the label (readmitted within 30 days), the prediction moment (at
   discharge), the metric (recall within the top 10%) and the constraints (explainability, PHI).
2. **Get and understand the data.** Use EHR encounters, claims and labs. Run exploratory analysis: distributions,
   missing values, class balance (readmission is often around 10–20%), duplicates, and how each field is generated.
3. **Prepare the data and features.** Clean it, impute, encode categoricals, scale and create features (prior
   admissions in the last 12 months, for example). Use only information **available at prediction time**.
4. **Build a baseline, then train models.** Start with a dumb baseline and a simple model (logistic regression), then
   try stronger ones (gradient boosting).
5. **Validate and tune.** Cross-validate on the training data to choose features and hyperparameters.
6. **Evaluate once on the held-out test set.** Report metrics that match the decision (recall, precision, PR-AUC,
   calibration) and check them per subgroup (age, sex, race, payer).
7. **Deploy.** Serve it behind an API or as a batch job, version the model, log inputs and predictions without
   leaking PHI.
8. **Monitor and retrain.** Watch for data drift and performance decay, then retrain on a schedule or on a trigger.

**Your angle:** On the LDH Medicaid Document AI platform you owned steps 7 and 8 for ML output. You served the
extraction results, put a Pydantic validation gate in front of human review, and fed reviewer corrections back. That
is the production half of this lifecycle. Say so, then show you know steps 1–6 as well.

## Splitting data and validating models

You can never judge a model on the data it learned from: a model that memorises scores perfectly there. So you hold
data out.

| Split | Used for | Typical size |
|---|---|---|
| Training set | Fitting parameters | 60–80% |
| Validation set (or cross-validation folds) | Choosing hyperparameters, features and models | 10–20%, or reuse the training set via CV |
| Test set | One final, unbiased estimate. Touch it once. | 10–20% |

How you split matters as much as the ratio:

- **Stratified split:** keeps the class ratio equal in every split. This is essential when positives are rare.
- **Group split:** keeps all rows of one **patient** in the same split. A patient with six encounters must not
  appear in both train and test, or the model "recognises" them and the score is inflated.
- **Time-based split:** train on the past and test on the future (train on 2023–2024 discharges, test on 2025).
  Models are deployed forward in time, so evaluate them that way. This also exposes drift.

**Cross-validation (k-fold)** splits the training data into k folds, trains on k−1 and validates on the remaining
one, rotating so every fold is the validation fold once. You report the mean and spread. It uses all the data and
gives a more stable estimate than one validation split.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, KFold, StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# Synthetic "readmission" data: 1,000 encounters, about 15% positive.
X, y = make_classification(n_samples=1000, n_features=12, n_informative=5,
                           weights=[0.85], random_state=0)

# Stratified 5-fold CV. The scaler sits inside the pipeline, so it is refit on each training fold (no leakage).
model = make_pipeline(StandardScaler(), LogisticRegression())
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
scores = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
print("ROC-AUC per fold:", scores.round(3), "mean:", scores.mean().round(3))
assert len(scores) == 5 and scores.mean() > 0.8

# Group split: 1,000 encounters belong to 150 patients. GroupKFold never puts a patient on both sides.
patient_id = np.random.default_rng(0).integers(0, 150, size=len(y))
for train_idx, test_idx in GroupKFold(n_splits=5).split(X, y, groups=patient_id):
    assert set(patient_id[train_idx]).isdisjoint(patient_id[test_idx])

# A plain KFold split DOES leak patients across folds.
train_idx, test_idx = next(KFold(n_splits=5, shuffle=True, random_state=0).split(X))
shared = set(patient_id[train_idx]) & set(patient_id[test_idx])
print("patients in both train and test with plain KFold:", len(shared))
assert len(shared) > 0
```

For data with patients and a class imbalance, `StratifiedGroupKFold` does both at once. For time order, use
`TimeSeriesSplit` or a manual cut-off date.

## Bias, variance, overfitting and underfitting

- **Bias** is error from a model that is too simple to capture the pattern. It does badly on training **and** test
  data. That is **underfitting**.
- **Variance** is error from a model so flexible it learns the noise of its particular training sample. It does great
  on training data and much worse on test data. That is **overfitting**.
- For squared error: **expected test error = bias² + variance + irreducible noise**. More flexibility lowers bias
  and raises variance, so you look for the sweet spot.

The clearest demo is a decision tree as its maximum depth grows:

```python
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = make_classification(n_samples=1000, n_features=20, n_informative=5, flip_y=0.1, random_state=0)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)

for depth in [1, 3, 5, None]:
    tree = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(X_train, y_train)
    print(f"max_depth={depth}: train={tree.score(X_train, y_train):.2f} test={tree.score(X_test, y_test):.2f}")

deep = DecisionTreeClassifier(random_state=0).fit(X_train, y_train)
assert deep.score(X_train, y_train) == 1.0   # memorised the training set
assert deep.score(X_test, y_test) < 0.9      # and pays for it on unseen data
```

```text
max_depth=1: train=0.84 test=0.84
max_depth=3: train=0.89 test=0.85
max_depth=5: train=0.93 test=0.83
max_depth=None: train=1.00 test=0.81
```

| Symptom | Diagnosis | Fixes |
|---|---|---|
| Training score low, validation score low | Underfitting (high bias) | More or better features, a more flexible model, less regularisation, train longer |
| Training score high, validation score much lower | Overfitting (high variance) | More data, regularisation, simpler model (shallower trees, fewer features), early stopping, bagging, dropout for neural networks |
| Both good, test much worse | Leakage or a test set from a different distribution | Check the split, check features for future information |

A **learning curve** (score against training-set size) tells you which case you are in. If the validation curve is
still rising, more data will help. If the two curves have met at a low score, it won't, and you need a better model or
features.

## Regularisation

Regularisation adds a penalty for large weights to the loss, so the model prefers simpler explanations.

| | L1 (Lasso) | L2 (Ridge) | Elastic Net |
|---|---|---|---|
| Penalty | Sum of absolute weights | Sum of squared weights | A mix of both |
| Effect | Drives some weights **exactly to zero**, so it selects features | Shrinks all weights smoothly toward zero | Sparse, but stable with correlated features |
| Correlated features | Picks one arbitrarily | Spreads weight across them | Groups them |
| Use when | You expect few relevant features | Most features matter a little (the default) | Many correlated features |

In scikit-learn, `LogisticRegression` and SVMs use `C`, the **inverse** of regularisation strength, so a smaller
`C` means a stronger penalty. `Ridge` and `Lasso` use `alpha`, where bigger means a stronger penalty. Since
scikit-learn 1.8, `LogisticRegression` selects L1 or L2 with `l1_ratio` (0 = L2, the default; 1 = L1) instead of the
older `penalty="l1"` argument, which is deprecated. Most tutorials and existing code still use `penalty="l1"`, so
recognise both. L1 needs a solver that supports it (`saga` or `liblinear`); the default `lbfgs` handles only L2.

```python
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# 20 features, only 4 of them informative.
X, y = make_classification(n_samples=500, n_features=20, n_informative=4, n_redundant=0, random_state=1)
X = StandardScaler().fit_transform(X)

l2 = LogisticRegression(C=0.1).fit(X, y)                                   # l1_ratio=0: pure L2
l1 = LogisticRegression(C=0.1, l1_ratio=1.0, solver="saga", max_iter=5000).fit(X, y)  # pure L1

print("weights exactly zero  L2:", (l2.coef_ == 0).sum(), " L1:", (l1.coef_ == 0).sum())
assert (l2.coef_ == 0).sum() == 0    # L2 shrinks but keeps every feature
assert (l1.coef_ == 0).sum() >= 10   # L1 removes most of the 16 noise features
```

## The algorithms you must be able to explain

| Algorithm | How it works, in one line | Strengths | Weaknesses | Needs scaling? |
|---|---|---|---|---|
| Linear regression | Weighted sum of features, fitted by least squares | Fast, interpretable | Only linear relationships, sensitive to outliers | For regularised versions |
| Logistic regression | Weighted sum fed through a sigmoid to give a probability, fitted by minimising log loss | Interpretable (odds ratios), well calibrated, a strong baseline | Linear decision boundary unless you engineer features | Yes (for regularisation and convergence) |
| Decision tree | Recursive if/else splits that make child nodes purer | Interpretable, handles mixed types and non-linearity | Overfits badly on its own, unstable | No |
| Random forest | Many deep trees on bootstrap samples, random feature subsets at each split, averaged (**bagging**) | Strong default, low tuning, robust | Larger and slower, less interpretable | No |
| Gradient boosting (XGBoost, LightGBM, CatBoost, sklearn `HistGradientBoosting`) | Shallow trees added one at a time, each fitting the errors of the ensemble so far (**boosting**) | Usually the best accuracy on tabular data, handles missing values | More hyperparameters, can overfit without early stopping | No |
| Support vector machine | Finds the boundary with the widest margin; kernels allow curved boundaries | Good in high dimensions with small data | Slow on large data, needs scaling, no native probabilities | Yes |
| k-nearest neighbours | Predicts from the k most similar training rows | Simple, no training step | Slow prediction, suffers in high dimensions | Yes |
| Naive Bayes | Applies Bayes' rule assuming features are independent given the class | Very fast, good for text | The independence assumption is usually false, so probabilities are poorly calibrated | No |
| k-means | Assigns points to the nearest of k centroids, moves the centroids, repeats | Simple, scalable clustering | You choose k, assumes round clusters of similar size | Yes |
| PCA | Projects onto the orthogonal directions of maximum variance | Compression, visualisation, removes correlation | Components are hard to interpret | Yes |

**Bagging vs boosting:** bagging trains models **independently in parallel** on resampled data and averages them,
which mainly **reduces variance** (random forest). Boosting trains models **sequentially**, each correcting the
previous ones, which mainly **reduces bias** (gradient boosting). **Stacking** trains a meta-model on the
predictions of several different models.

A quick, honest comparison across model families looks like this:

```python
from sklearn.datasets import make_classification
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = make_classification(n_samples=1000, n_features=15, n_informative=6, weights=[0.85], random_state=42)
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
models = {
    "baseline (always 'no')": DummyClassifier(strategy="most_frequent"),
    "logistic regression": make_pipeline(StandardScaler(), LogisticRegression()),
    "random forest": RandomForestClassifier(n_estimators=200, random_state=0),
    "gradient boosting": HistGradientBoostingClassifier(random_state=0),
}
results = {name: cross_val_score(m, X, y, cv=cv, scoring="roc_auc").mean() for name, m in models.items()}
for name, auc in results.items():
    print(f"{name:24s} ROC-AUC = {auc:.3f}")

assert results["baseline (always 'no')"] == 0.5          # no skill: it ranks nobody above anybody
assert min(results["logistic regression"], results["random forest"], results["gradient boosting"]) > 0.75
```

### Choosing a model, the way you would say it

1. **Start with a baseline**: the majority class, or a simple rule. Every model must beat it.
2. **For tabular data**, try regularised logistic regression first (interpretable, calibrated), then gradient
   boosting, which usually wins on accuracy.
3. **For text, images or audio**, use pre-trained deep models or embeddings, not hand-built features.
4. **Weigh the constraints**: clinicians need explanations, latency budgets, data size, retraining cost. In healthcare a
   slightly less accurate model that people trust and that is well calibrated often beats a black box.
5. **Decide with cross-validation** on the metric that matches the decision, then confirm once on the test set.

## Data leakage: the mistake interviewers love to probe

**Leakage** is when information that would not be available at prediction time sneaks into training. The model looks
brilliant offline and fails in production.

- **Target leakage**: a feature that is a consequence of the label, or is only recorded after it. For example, claims
  or notes dated after discharge (they can describe the readmission itself), a readmission flag copied from a claims
  feed, or a lab ordered *because* the diagnosis was already suspected.
- **Train/test contamination**: preprocessing (scaling, imputation, feature selection, target encoding) fitted on
  the full dataset before splitting. Fix it by putting every fitted step inside a `Pipeline`, so it only ever sees the
  training fold.
- **Group leakage**: the same patient in train and test, which needs a group split.
- **Temporal leakage**: a random split on time-ordered data, or features computed with future data, like "total
  admissions this year" evaluated in March. Fix it with a time-based split and point-in-time feature computation.
- **Duplicates**: the same record (or near-copies) on both sides of the split.

Warning signs: a validation score that is too good to be true, or one feature with enormous importance.

## Gradient descent in two minutes

Most models are trained by **minimising a loss function** (mean squared error for regression, log loss for
classification). Gradient descent repeats one step: compute the gradient (the direction in which the loss increases
fastest) and move the weights a small step the other way, `w = w - learning_rate * gradient`.

- **Batch** gradient descent uses all rows per step: stable but slow on big data.
- **Stochastic** (SGD) uses one row per step: noisy but cheap, and the noise can escape shallow minima.
- **Mini-batch** uses 32–1,024 rows: the standard for neural networks.
- **Learning rate**: too high and it diverges or bounces, too low and it crawls. Scale your features, or one
  direction dominates and convergence is slow.

## Interview questions

### What is machine learning, and when should you not use it? {core}

Machine learning learns a mapping from inputs to outputs from historical examples, instead of a developer writing the
rules. It pays off when the rules are too complex or change too often to write by hand, there is enough labelled
data, and some error is tolerable. Readmission risk is a good example: hundreds of interacting factors, and years of
labelled outcomes.

Do not use ML when a clear rule or a regulation already defines the answer (an eligibility rule in a Medicaid
policy), when you have no reliable labels, or when you cannot tolerate or explain errors. A deterministic validator
is better there. In the Document AI platform, the ML extracted fields, but the business rules ran as explicit
Pydantic validations.

### Explain supervised, unsupervised and reinforcement learning with examples. {core}

**Supervised** learning trains on examples with known answers: classification for categories (will this patient be
readmitted?), regression for numbers (length of stay). **Unsupervised** learning has no labels and finds structure:
clustering patients into care-management segments, or anomaly detection on claims. **Reinforcement** learning
learns a policy by trial, error and reward. It is rare in healthcare production systems.

Worth adding: modern LLMs are **self-supervised**. They are pre-trained by predicting the next token on unlabelled
text, then fine-tuned with supervised data and human feedback.

### Walk me through how you would build an ML model end to end. {core}

I'd frame it around a concrete problem, such as 30-day readmission at discharge. First, frame it: what decision does
it drive, what is the label, when does the prediction happen, and which metric matters. Then I'd explore the data,
build point-in-time features, split by patient and by time, and start with a baseline and logistic regression before
trying gradient boosting. I'd tune with cross-validation, evaluate once on a held-out test set (PR-AUC, recall at the
top 10%, calibration, subgroup metrics), then deploy behind an API with versioning, and monitor drift and outcomes to
retrain.

Show you know the non-code parts: aligning with clinicians on how predictions will be used, the PHI rules for
training data, and a feedback loop. That last one is where your Document AI HITL experience fits naturally.

### Why do you need separate training, validation and test sets? {core}

The training set fits the parameters. The validation set (or cross-validation) chooses hyperparameters and compares
models. The test set gives one final, unbiased estimate. If you tune on the test set, you overfit to it and your
reported score is optimistic.

The test set should be touched once, at the end. In practice, many teams skip a fixed validation set and use k-fold
cross-validation on the training data instead.

### What is cross-validation, and when do you use stratified, group or time-series splits? {core}

K-fold cross-validation splits the training data into k parts, trains on k−1 and validates on the remaining one, k
times, then averages. It gives a more reliable estimate than one split and shows the variance.

- **Stratified** keeps the class ratio in every fold, for imbalanced labels such as rare diseases or readmission.
- **Group** keeps all of one patient's records in one fold, for repeated encounters per patient.
- **Time-series** trains only on the past and validates on the future, for anything deployed forward in time. It
  also exposes drift.

The follow-up is usually: "what if you need both stratification and groups?" Answer: `StratifiedGroupKFold`.

### Explain the bias–variance trade-off. {core}

Bias is error from a model that is too simple, so it misses real patterns and underfits. Variance is error from a model
that is too sensitive to its particular training data, so it fits noise and overfits. Making a model more flexible
lowers bias and raises variance. The goal is the complexity that minimises error on unseen data.

You diagnose it by comparing scores. Low training and low validation scores mean high bias. High training and much
lower validation scores mean high variance. For squared error, expected error decomposes into bias² + variance +
irreducible noise.

### How do you detect and fix overfitting? {core}

Detect it from the gap between training and validation performance, or from learning curves where validation error
stops improving while training error keeps falling. Fix it with more data, regularisation (L1/L2, smaller `C`),
simpler models (shallower trees, fewer features), early stopping for boosting and neural networks, bagging, and
dropout for neural networks.

Also rule out the opposite trap: if *test* performance is suspiciously good, look for leakage before celebrating.

### What is regularisation? Compare L1 and L2. {core}

Regularisation adds a penalty on weight size to the loss, so the model prefers simpler solutions and generalises
better. L1 penalises absolute values and drives some weights exactly to zero, so it does feature selection. L2
penalises squared values and shrinks all weights smoothly, which handles correlated features better. Elastic Net
mixes the two.

In scikit-learn, `C` in `LogisticRegression` is the inverse strength (smaller `C` = more regularisation). L1 versus
L2 is set with `l1_ratio` since version 1.8 (the old `penalty="l1"` you will see in most code is deprecated), and L1
needs the `saga` or `liblinear` solver. Tree models regularise
differently: through max depth, minimum samples per leaf, learning rate and number of trees.

### What is the difference between parameters and hyperparameters?

Parameters are learned from data during training, for example regression weights or tree split thresholds.
Hyperparameters are set before training and control how learning happens, for example `C`, `max_depth`,
`learning_rate` and `n_estimators`. You tune hyperparameters with cross-validation (grid search, random search,
Bayesian optimisation), never on the test set.

### How does logistic regression work, and why is it called regression? {core}

It computes a weighted sum of the features, z = w·x + b, and passes it through the sigmoid 1 / (1 + e^(−z)) to get a
probability between 0 and 1. It is trained by maximum likelihood, which is the same as minimising log loss. A
threshold, 0.5 by default but tunable, turns the probability into a class.

It is called regression because it regresses the **log-odds** linearly on the features. Each coefficient is the
change in log-odds per unit of that feature, so e^coef is an **odds ratio**, which clinicians understand. It is
often the first model to try in healthcare because it is interpretable and usually well calibrated.

### What are the assumptions of linear regression? {deep}

Linearity between the features and the target; independent errors; constant error variance (homoscedasticity); no
perfect multicollinearity among features; and, for confidence intervals and p-values, normally distributed residuals.
You check them with residual plots and variance inflation factors (VIF).

For pure prediction, mild violations matter less than for inference. Strongly correlated features make individual
coefficients unstable but don't necessarily hurt predictions. L2 regularisation helps.

### How does a decision tree choose its splits?

At each node it tries candidate splits (feature and threshold) and picks the one that makes the child nodes purest. For
classification it uses **Gini impurity** (1 − Σp²) or **entropy** (−Σp log p), maximising the impurity decrease
(information gain). For regression it minimises the variance or MSE in the children. It recurses until a stopping rule
applies: max depth, min samples per leaf, or no improvement.

A single tree is interpretable but high-variance: small data changes produce a different tree. That is why ensembles
(random forest, boosting) are used in practice.

### Random forest versus gradient boosting: how do they differ, and which would you choose? {core}

A random forest trains many deep trees **independently**, each on a bootstrap sample with a random subset of features
at each split, and averages them. That is bagging, and it mainly reduces variance. Gradient boosting trains shallow
trees **sequentially**, each fitting the errors (negative gradients) of the ensemble so far, scaled by a learning
rate. That reduces bias.

Random forests are robust with little tuning and hard to overfit by adding trees. Gradient boosting (XGBoost,
LightGBM, CatBoost, scikit-learn's `HistGradientBoosting`) usually reaches higher accuracy on tabular data, but needs
tuning of the learning rate, depth and number of trees, plus early stopping. I'd start with a random forest as a
strong baseline and move to boosting for the final model.

### Why do XGBoost and LightGBM dominate tabular problems? {deep}

They combine boosting's low bias with strong regularisation: shrinkage, depth limits, L1/L2 penalties on leaf
weights, and row and column subsampling. They handle missing values natively, are fast thanks to histogram binning
(and LightGBM's leaf-wise growth), and support early stopping. XGBoost uses second-order (Hessian) information in its
objective. CatBoost handles categorical features with ordered target statistics, which avoids target leakage.

On structured EHR or claims data they typically beat neural networks unless you have huge data or unstructured inputs.

### How does k-nearest neighbours work, and what are its weaknesses?

To predict, it finds the k training rows closest to the new point (usually by Euclidean distance) and takes a majority
vote or an average. There is no real training; all the work happens at prediction time.

Its weaknesses: prediction is slow (O(n·d) per query without an index), it **needs scaled features** (otherwise
income in dollars swamps age in years), it degrades in high dimensions where distances become similar, and it is
sensitive to irrelevant features. Choose k by cross-validation: a small k overfits, a large k underfits.

### Explain support vector machines in a minute. {deep}

An SVM finds the decision boundary with the **maximum margin**: the widest gap between the classes. Only the closest
points, the support vectors, define it. `C` trades margin width against misclassified training points. The **kernel
trick** (RBF, polynomial) lets it learn curved boundaries by implicitly mapping into a higher-dimensional space.

SVMs work well with medium-sized, high-dimensional data, but scale poorly beyond tens of thousands of rows, need
scaling, and don't output probabilities natively (you need Platt scaling or calibration).

### Why is Naive Bayes called "naive", and when is it still useful?

It applies Bayes' theorem assuming every feature is independent of the others given the class. That is almost never
true (age and comorbidities correlate), hence "naive". It still ranks classes surprisingly well, trains in one pass
and works with tiny data, which makes it a classic baseline for text classification. Its probabilities are poorly
calibrated, so don't use them directly as risk scores.

### How does k-means clustering work, and how do you choose k?

Initialise k centroids (k-means++ spreads them out), assign each point to its nearest centroid, move each centroid to
the mean of its points, and repeat until assignments stop changing. It minimises the within-cluster sum of squares
(inertia). It finds a local optimum, so run several initialisations (`n_init`).

Choose k with the elbow method (inertia against k), silhouette scores, or business usefulness ("care management can
run 4 programmes"). k-means assumes roughly spherical, similar-size clusters and needs scaled features. For odd shapes
or noise, use DBSCAN or Gaussian mixtures.

### What does PCA do, and when would you use it? {deep}

PCA finds orthogonal directions (principal components) that capture the most variance, using the eigenvectors of the
covariance matrix (computed by SVD), and projects the data onto the top few. Use it to compress many correlated
features, to visualise, or to speed up and de-noise models that suffer in high dimensions.

Standardise first, or large-scale features dominate. Pick the number of components by explained variance (for
example 95%). The trade-off is interpretability: a component is a mix of original features, which clinicians find
hard to reason about.

### What is data leakage? Give healthcare examples. {core}

Leakage is information in training that won't exist at prediction time, so offline scores are inflated and the model
fails in production. Healthcare examples:

- A readmission model using discharge codes or claims entered after the readmission happened.
- Lab tests ordered *because* the clinician already suspected the condition.
- The same patient's encounters in both train and test.
- Imputation, scaling or target encoding fitted on the full dataset before the split.
- Random splits on time-ordered data.

Prevention: define the prediction moment and build features as of that timestamp, split by patient and time, put all
preprocessing in a `Pipeline`, and be suspicious of any single dominant feature or a near-perfect score.

### How do you choose an algorithm for a new problem? {core}

Start from the data type and the constraints, not from a favourite model. For tabular data: a baseline, then
regularised logistic regression for an interpretable, calibrated benchmark, then gradient boosting for accuracy.
For text and images: pre-trained transformers or CNNs, or embeddings plus a simple classifier.

Then weigh interpretability (clinical users and regulators), latency, data volume, class imbalance and maintenance
cost. Decide with cross-validation on the metric that matches the business decision. If boosting wins only marginally
and the explanation matters, I'd ship the simpler model.

### What is gradient descent? Compare batch, stochastic and mini-batch.

Gradient descent minimises a loss by repeatedly moving the weights opposite to the gradient: w ← w − η·∇L. Batch uses
the whole dataset per step (stable, expensive). Stochastic uses one sample (cheap, noisy). Mini-batch uses small
batches (the standard trade-off, and efficient on GPUs).

The learning rate η is the key hyperparameter: too large diverges, too small is slow. Schedules and adaptive
optimisers (Adam) help. Feature scaling makes the loss surface rounder, so convergence is faster.

### What is the curse of dimensionality? {deep}

As the number of features grows, the space grows exponentially, data becomes sparse, and distances between points
become nearly equal. Distance-based methods (kNN, k-means) break down, and you need far more data to cover the space.
Remedies: feature selection, regularisation, dimensionality reduction (PCA, embeddings), and models that are less
distance-dependent, such as tree ensembles.

### Why start with a baseline model?

A baseline tells you whether ML adds any value. On a dataset with 10% readmissions, "always predict no" scores 90%
accuracy, so a model at 91% accuracy is nearly useless. Baselines include the majority class, a simple clinical rule
(such as the LACE index for readmission) or last year's model. If a complex model barely beats a rule, the rule may be
the better product.

### Parametric versus non-parametric models? {deep}

Parametric models have a fixed number of parameters regardless of data size and assume a functional form: linear
regression, logistic regression, Naive Bayes. They are fast and data-efficient, but biased if the assumption is wrong.
Non-parametric models grow in complexity with the data: kNN, decision trees, kernel SVMs. They are flexible but need
more data and can overfit.

## Coding problems

### Split encounters by patient so nothing leaks {medium core}

You get encounter records as `(encounter_id, patient_id)` pairs. Return train and test lists of encounter ids so that
roughly `test_fraction` of **patients** are in the test set, and no patient appears in both. It must be reproducible
for a given seed.

```text
records = [(1, "P1"), (2, "P1"), (3, "P2"), (4, "P3"), (5, "P3"), (6, "P4")]
split_by_patient(records, test_fraction=0.5, seed=0) -> e.g. train [1, 2, 6], test [3, 4, 5]
```

#### Hints

1. Splitting the *records* randomly is exactly the bug. What should you shuffle instead?
2. Collect the unique patient ids, shuffle them with a seeded random generator, and take a slice as the test patients.
3. Then route every record by whether its patient is in the test set.

#### Solution

Split at the **group** level, then map back to records. A set gives O(1) membership checks.

```python
import random
from collections.abc import Hashable, Sequence


def split_by_patient(records: Sequence[tuple[int, Hashable]], test_fraction: float, seed: int = 0) -> tuple[list[int], list[int]]:
    patients = sorted({pid for _, pid in records}, key=str)   # sort first so the shuffle is reproducible
    random.Random(seed).shuffle(patients)
    n_test = max(1, round(len(patients) * test_fraction)) if patients else 0
    test_patients = set(patients[:n_test])
    train = [eid for eid, pid in records if pid not in test_patients]
    test = [eid for eid, pid in records if pid in test_patients]
    return train, test


records = [(1, "P1"), (2, "P1"), (3, "P2"), (4, "P3"), (5, "P3"), (6, "P4")]
train, test = split_by_patient(records, test_fraction=0.5, seed=0)
pid = dict(records)
assert {pid[e] for e in train}.isdisjoint({pid[e] for e in test})      # no patient on both sides
assert sorted(train + test) == [1, 2, 3, 4, 5, 6]                      # every record used exactly once
assert len({pid[e] for e in test}) == 2                                # half of the 4 patients
assert split_by_patient(records, 0.5, seed=0) == (train, test)         # reproducible
assert split_by_patient([], 0.2) == ([], [])

# The library equivalent:
import numpy as np
from sklearn.model_selection import GroupShuffleSplit
groups = np.array([p for _, p in records])
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=0).split(groups, groups=groups))
assert set(groups[tr]).isdisjoint(groups[te])
```

Complexity: O(n + p log p) for n records and p patients.

#### Follow-ups

- **Also keep the positive rate similar in both splits?** Stratify at patient level (for example by "ever
  readmitted"), or use `StratifiedGroupKFold`.
- **Records span several years?** Use a time cut-off first (train before date D, test after) and then also exclude
  test patients from training if the use case requires it.

### Implement k-fold cross-validation from scratch {medium}

Write `k_fold_indices(n, k, seed)` returning a list of `(train_idx, val_idx)` pairs, where the validation folds
partition `range(n)` and sizes differ by at most one. Then write `cross_validate(model_factory, X, y, k)` that returns
the mean accuracy.

#### Hints

1. Shuffle the indices once with a seeded generator, then cut them into k nearly equal chunks.
2. `n // k` gives the base size; the first `n % k` folds get one extra element.
3. For each fold, the training indices are everything not in that fold. Create a **fresh** model per fold.

#### Solution

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression


def k_fold_indices(n: int, k: int, seed: int = 0) -> list[tuple[np.ndarray, np.ndarray]]:
    if not 2 <= k <= n:
        raise ValueError("k must be between 2 and n")
    idx = np.random.default_rng(seed).permutation(n)
    sizes = [n // k + (1 if i < n % k else 0) for i in range(k)]
    folds, start = [], 0
    for size in sizes:
        val = idx[start:start + size]
        train = np.concatenate([idx[:start], idx[start + size:]])
        folds.append((train, val))
        start += size
    return folds


def cross_validate(model_factory, X: np.ndarray, y: np.ndarray, k: int = 5) -> float:
    scores = []
    for train, val in k_fold_indices(len(y), k):
        model = model_factory()                     # a fresh, unfitted model per fold
        model.fit(X[train], y[train])
        scores.append((model.predict(X[val]) == y[val]).mean())
    return float(np.mean(scores))


folds = k_fold_indices(10, 3)
val_sets = [set(v.tolist()) for _, v in folds]
assert sorted(len(v) for v in val_sets) == [3, 3, 4]
assert set().union(*val_sets) == set(range(10))                       # folds cover everything
assert all(a.isdisjoint(b) for i, a in enumerate(val_sets) for b in val_sets[i + 1:])
assert all(set(t.tolist()).isdisjoint(v.tolist()) for t, v in folds)  # no overlap inside a fold

X, y = make_classification(n_samples=300, n_features=5, random_state=0)
acc = cross_validate(lambda: LogisticRegression(), X, y, k=5)
assert 0.8 < acc <= 1.0
```

Complexity: O(n) to build the folds, plus k model fits.

#### Follow-ups

- **Make it stratified?** Shuffle within each class and deal the indices round-robin into the k folds.
- **Why a fresh model per fold?** Reusing a fitted model can carry state (warm starts) across folds and leak
  information.

### Fit linear regression with gradient descent in NumPy {medium core}

Implement `fit_linear_gd(X, y, lr, epochs)` that learns weights `w` and bias `b` minimising mean squared error with
batch gradient descent. Show that it recovers known weights from synthetic data.

#### Hints

1. The prediction is `X @ w + b`, and the error vector is `pred - y`.
2. For MSE = mean(error²), the gradients are `dw = 2/n * X.T @ error` and `db = 2/n * sum(error)`.
3. Update with `w -= lr * dw` and `b -= lr * db`. Standardised features let you use a larger learning rate.

#### Solution

Vectorise everything: one matrix product per epoch, no Python loop over rows.

```python
import numpy as np


def fit_linear_gd(X: np.ndarray, y: np.ndarray, lr: float = 0.1, epochs: int = 1000) -> tuple[np.ndarray, float, list[float]]:
    n, d = X.shape
    w, b = np.zeros(d), 0.0
    history = []
    for _ in range(epochs):
        error = X @ w + b - y
        history.append(float(np.mean(error ** 2)))
        w -= lr * (2 / n) * (X.T @ error)
        b -= lr * (2 / n) * error.sum()
    return w, b, history


rng = np.random.default_rng(0)
X = rng.normal(size=(500, 3))
true_w, true_b = np.array([2.0, -1.0, 0.5]), 3.0
y = X @ true_w + true_b + rng.normal(scale=0.1, size=500)

w, b, history = fit_linear_gd(X, y, lr=0.1, epochs=500)
assert np.allclose(w, true_w, atol=0.05) and abs(b - true_b) < 0.05
assert history[-1] < history[0] / 100            # the loss fell steadily

# It matches the closed-form least-squares answer.
A = np.column_stack([X, np.ones(len(X))])
exact = np.linalg.lstsq(A, y, rcond=None)[0]
assert np.allclose(np.append(w, b), exact, atol=1e-3)

# Too large a learning rate diverges.
_, _, bad = fit_linear_gd(X, y, lr=1.5, epochs=50)
assert bad[-1] > bad[0]
```

Complexity: O(epochs · n · d) time, O(d) extra space.

#### Follow-ups

- **Mini-batch version?** Shuffle each epoch and loop over slices of 32–256 rows, computing the same gradient on the
  slice.
- **Add L2 regularisation?** Add `2 * lam * w` to `dw` (not to `b`).
- **Logistic regression instead?** Apply the sigmoid to `X @ w + b`. The log-loss gradient has the same shape:
  `X.T @ (p - y) / n`.

### Write a k-nearest neighbours classifier {easy}

Implement `knn_predict(X_train, y_train, X_new, k)` that returns the majority label among the k nearest training rows
(Euclidean distance) for each new row. Break ties by the smallest label.

#### Hints

1. Broadcasting computes all distances at once: `X_new[:, None, :] - X_train[None, :, :]`.
2. `np.argpartition` (or `argsort`) on each row finds the k smallest distances.
3. `np.bincount` on the neighbours' labels gives vote counts, and `argmax` returns the smallest label on a tie.

#### Solution

```python
import numpy as np
from sklearn.neighbors import KNeighborsClassifier


def knn_predict(X_train: np.ndarray, y_train: np.ndarray, X_new: np.ndarray, k: int = 3) -> np.ndarray:
    dists = np.sqrt(((X_new[:, None, :] - X_train[None, :, :]) ** 2).sum(axis=2))  # shape (m, n)
    nearest = np.argsort(dists, axis=1, kind="stable")[:, :k]
    return np.array([np.bincount(y_train[row]).argmax() for row in nearest])


X_train = np.array([[0, 0], [0, 1], [1, 0], [5, 5], [5, 6], [6, 5]], dtype=float)
y_train = np.array([0, 0, 0, 1, 1, 1])
X_new = np.array([[0.2, 0.2], [5.5, 5.5], [2.0, 2.0]])
pred = knn_predict(X_train, y_train, X_new, k=3)
assert pred.tolist() == [0, 1, 0]

rng = np.random.default_rng(1)
Xa, ya = rng.normal(size=(200, 4)), rng.integers(0, 3, 200)
Xb = rng.normal(size=(20, 4))
ref = KNeighborsClassifier(n_neighbors=1).fit(Xa, ya).predict(Xb)
assert (knn_predict(Xa, ya, Xb, k=1) == ref).all()
```

Complexity: O(m · n · d) to compute distances and O(m · n log n) to sort, for m queries and n training rows. That
is why production kNN uses an index (KD-tree, ball tree, or an approximate nearest-neighbour library).

#### Follow-ups

- **Why scale first?** Distances are dominated by the largest-scale feature. Standardise the features inside a pipeline.
- **How is this related to vector search in RAG?** It is the same nearest-neighbour idea over embeddings,
  usually with cosine similarity and an approximate index.
