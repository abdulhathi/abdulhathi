---
title: Neural networks and deep learning
goal: Explain how a neural network learns (forward pass, loss, backpropagation, optimiser), name the main architectures and when to use them, and describe a PyTorch training loop.
minutes: 40
---

When a role asks you to build, train, evaluate and deploy ML or AI models, a Python and AI interview usually
includes one or two deep-learning questions: how a network learns, why ReLU, what dropout does, what attention
is, and how you would fine-tune a model instead of training one from scratch.

You do not need to derive equations. You need to explain the training loop clearly, know the vocabulary, and connect it
to what you have already shipped: LLMs are transformers, and document-extraction models like the ones whose output
you validated at Quantiphi are typically deep networks. Every code block below runs with NumPy, so you can see the maths work.

## The mental model in five lines

1. A **neuron** computes a weighted sum of its inputs plus a bias, then applies a non-linear **activation**: `a = f(w·x + b)`.
2. A **layer** is many neurons side by side; a **network** stacks layers. The **forward pass** turns an input into a prediction.
3. A **loss function** measures how wrong the prediction is (cross-entropy for classification, MSE for regression).
4. **Backpropagation** uses the chain rule to compute the gradient of the loss with respect to every weight.
5. An **optimiser** (SGD, Adam) nudges every weight a small step against its gradient. Repeat over many **batches** and **epochs**.

That loop (forward, loss, backward, update) is the whole of training, from a two-layer network to a large language model.

### Activations

| Activation | Formula (idea) | Use it for | Watch out for |
|---|---|---|---|
| ReLU | max(0, z) | Default for hidden layers | "Dead" neurons that output 0 forever |
| Leaky ReLU / GELU | small slope for z < 0 / smooth ReLU | GELU is standard in transformers | Slightly more compute |
| Sigmoid | 1 / (1 + e^-z), output 0–1 | Output of binary classifiers | Saturates: gradient at most 0.25, vanishes in deep stacks |
| Tanh | output −1 to 1, zero-centred | Older RNNs, small hidden layers | Also saturates |
| Softmax | e^zi / Σ e^zj, outputs sum to 1 | Output of multi-class classifiers | Compute it stably (subtract the max) |

### Losses

| Task | Output layer | Loss |
|---|---|---|
| Regression | Linear (no activation) | MSE or MAE (Huber for outliers) |
| Binary classification | One logit + sigmoid | Binary cross-entropy (log loss) |
| Multi-class (one label) | One logit per class + softmax | Categorical cross-entropy |
| Multi-label (several labels can be true) | One logit per label + sigmoid each | Binary cross-entropy per label |

### A network that learns XOR, with backpropagation by hand

XOR is the classic proof that you need a hidden layer: no straight line separates it, so logistic regression scores
50%. A small network with one hidden layer learns it. Read the backward pass as the chain rule applied layer by layer,
from the loss back to the first weights.

```python
import numpy as np
from sklearn.linear_model import LogisticRegression

X = np.array([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=float)
y = np.array([[0], [1], [1], [0]], dtype=float)

# A linear model cannot separate XOR.
linear = LogisticRegression().fit(X, y.ravel())
assert linear.score(X, y.ravel()) <= 0.75

rng = np.random.default_rng(0)
W1, b1 = rng.normal(0, 1, (2, 8)), np.zeros(8)   # input (2) -> hidden (8)
W2, b2 = rng.normal(0, 1, (8, 1)), np.zeros(1)   # hidden (8) -> output (1)

def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-z))

lr = 0.5
for step in range(5000):
    # Forward pass
    h = np.tanh(X @ W1 + b1)            # hidden activations
    p = sigmoid(h @ W2 + b2)            # predicted probability
    loss = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))

    # Backward pass (chain rule, from the loss back to the inputs)
    dz2 = (p - y) / len(X)              # d loss / d output logit (sigmoid + cross-entropy)
    dW2, db2 = h.T @ dz2, dz2.sum(axis=0)
    dz1 = (dz2 @ W2.T) * (1 - h**2)     # tanh'(z) = 1 - tanh(z)^2
    dW1, db1 = X.T @ dz1, dz1.sum(axis=0)

    # Update (plain gradient descent)
    W1 -= lr * dW1; b1 -= lr * db1
    W2 -= lr * dW2; b2 -= lr * db2

assert loss < 0.01
assert ((p > 0.5) == y).all()
print(f"final loss {loss:.4f}, predictions {p.ravel().round(3)}")
```

```text
final loss 0.0005, predictions [0.    0.999 1.    0.001]
```

### Optimisers, learning rate and batches

- **Batch gradient descent** uses the whole dataset per step: accurate but slow. **Stochastic** (SGD) uses one example:
  noisy. **Mini-batch** (32–512 examples) is what everyone uses: GPU-friendly, and the noise helps escape bad regions.
- **Momentum** keeps a running average of past gradients so steps keep moving in a consistent direction.
- **Adam** combines momentum with a per-parameter step size (scaled by recent gradient magnitudes). It is the default
  starting point; **AdamW** decouples weight decay from the update and is the usual choice for transformers.
- **Learning rate** is the most important hyperparameter. Too high: the loss diverges or bounces. Too low: training
  crawls or stalls. Common practice: a short **warm-up**, then **decay** (cosine or step).
- One **iteration** = one batch. One **epoch** = one pass over the whole training set.

### Fighting overfitting in networks

| Technique | What it does |
|---|---|
| More data / augmentation | Flips, crops, noise for images; the cheapest real fix |
| Dropout | Randomly zeroes activations during training so neurons cannot co-adapt; off at inference |
| Weight decay (L2) | Penalises large weights |
| Early stopping | Stop when validation loss stops improving; keep the best checkpoint |
| Batch norm / layer norm | Normalise activations; stabilises and speeds training, mild regularising effect |
| Smaller model | Fewer parameters to memorise with |

### Architectures and when to use them

| Architecture | Built for | Key idea | Healthcare example |
|---|---|---|---|
| MLP (fully connected) | Fixed-length feature vectors | Stack of dense layers | Usually beaten by gradient boosting on tabular data |
| CNN | Images, signals | Small shared filters slide over the input; pooling shrinks it | Chest X-ray or retina scan classification |
| RNN / LSTM / GRU | Sequences | Hidden state carried step to step; LSTM gates fight vanishing gradients | Older models for vitals time series |
| Transformer | Text, and now most sequences | Self-attention: every token looks at every other token in parallel | Clinical note summarisation, LLMs, document extraction |

**Your angle:** the LDH Medicaid Document AI platform consumed ML-extracted document fields, and OCR and
document-understanding models are typically CNN or transformer based. Your part, Pydantic validation as the quality gate before
human review, is exactly where model output meets production.

### Training from scratch vs transfer learning

Training a large network from scratch needs huge labelled datasets and GPUs. In practice you **start from a pretrained
model** and adapt it:

- **Feature extraction:** freeze the pretrained network, train only a new output head.
- **Fine-tuning:** unfreeze some or all layers and train with a small learning rate on your data.
- **Parameter-efficient fine-tuning (PEFT), e.g. LoRA:** freeze the original weights and train small low-rank matrices
  added to selected layers. You train a tiny fraction of the parameters, so it fits on modest GPUs and you can keep one
  adapter per task.

### The PyTorch training loop

PyTorch is not installed in this lab, so this block is not executed, but this is the shape interviewers expect you to
recognise and talk through.

```python norun
import torch
from torch import nn

model = nn.Sequential(nn.Linear(20, 64), nn.ReLU(), nn.Dropout(0.2), nn.Linear(64, 1))
loss_fn = nn.BCEWithLogitsLoss()                      # sigmoid + binary cross-entropy, numerically stable
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-2)

for epoch in range(20):
    model.train()                                      # dropout and batch norm in training mode
    for xb, yb in train_loader:                        # mini-batches from a DataLoader
        optimizer.zero_grad()                          # gradients accumulate unless cleared
        logits = model(xb).squeeze(1)                  # forward
        loss = loss_fn(logits, yb)                     # yb: float tensor of 0/1 labels
        loss.backward()                                # backprop: fills .grad on every parameter
        optimizer.step()                               # update weights

    model.eval()                                       # dropout off, batch norm uses running stats
    with torch.no_grad():                              # no gradient tracking for validation
        val_loss = sum(loss_fn(model(xb).squeeze(1), yb).item() for xb, yb in val_loader)
    # early stopping: save a checkpoint when val_loss improves, stop after N epochs without improvement
```

The five lines people forget: `model.train()` / `model.eval()`, `optimizer.zero_grad()`, `loss.backward()`,
`optimizer.step()`, and `torch.no_grad()` for evaluation.

## Interview questions

### What is a neural network, in one minute? {core}

A neural network is a function made of layers of simple units. Each unit takes a weighted sum of its inputs, adds a
bias and applies a non-linear activation. Stacking layers lets the network learn complex, non-linear relationships.
It learns by repeatedly predicting, measuring the error with a loss function, computing gradients with
backpropagation, and adjusting the weights with an optimiser such as Adam.

Follow-up they often ask: "How is that different from logistic regression?" Logistic regression is a single neuron
with a sigmoid. A network adds hidden layers, which is what lets it model interactions and curves without hand-made
features.

### Why do we need non-linear activation functions? {core}

Without them, a stack of layers collapses into one linear transformation: a matrix times a matrix is still a matrix.
The network could then only learn straight-line (linear) decision boundaries, no matter how deep. Non-linearities
such as ReLU are what let depth add expressive power.

XOR is the textbook proof: no linear model can separate it, but one hidden layer with a non-linear activation can.

### ReLU vs sigmoid vs tanh: which and why? {core}

Use **ReLU** (or GELU in transformers) in hidden layers. It is cheap, and its gradient is 1 for positive inputs, so
gradients do not shrink as they flow back through many layers. Use **sigmoid** only on the output for binary or
multi-label classification, and **softmax** on the output for multi-class.

Sigmoid and tanh **saturate**: for large positive or negative inputs their gradient is close to zero (sigmoid's is at
most 0.25). Multiplying many small gradients in a deep network causes the **vanishing gradient** problem, where early
layers stop learning. ReLU's weakness is "dead" units stuck at zero; Leaky ReLU or GELU soften that.

### Explain backpropagation. {core}

Backpropagation is the chain rule applied efficiently. After the forward pass computes the loss, we walk backwards
through the network: each layer receives the gradient of the loss with respect to its output, computes the gradient
with respect to its weights (to update them) and with respect to its input (to pass back to the previous layer).
One backward pass gives the gradient for every parameter at a small constant multiple (roughly two to three times) of
the cost of the forward pass, instead of one pass per parameter.

In frameworks you never write it by hand: PyTorch records the operations during the forward pass (autograd) and
`loss.backward()` computes all the gradients.

### What is gradient descent, and how do SGD, mini-batch and Adam differ? {core}

Gradient descent updates each weight by a small step in the direction that reduces the loss:
`w = w − learning_rate × gradient`. **Batch** GD computes the gradient on all data per step, **SGD** on one example,
and **mini-batch** on a small batch, which is the practical default.

**Adam** adds momentum (a moving average of gradients) and an adaptive step size per parameter (dividing by a moving
average of squared gradients), so it converges quickly with little tuning. **AdamW** applies weight decay separately
from that adaptive step, which regularises better and is standard for transformers. Plain SGD with momentum is still
popular for some vision models because it can generalise slightly better when well tuned.

### What happens if the learning rate is too high or too low?

Too high and the updates overshoot: the loss oscillates or explodes to NaN. Too low and training is very slow or gets
stuck on a plateau. I start with a known default (1e-3 for Adam, smaller like 1e-5 to 5e-5 for fine-tuning a
pretrained transformer), watch the training and validation loss curves, and use a schedule: warm-up for the first steps,
then cosine or step decay. A learning-rate range test (increase it until the loss blows up) is a quick way to find a
good value.

### What are an epoch, a batch and an iteration?

A **batch** is the group of examples used for one gradient update. An **iteration** (or step) is one such update. An
**epoch** is one full pass over the training set. With 10,000 examples and a batch size of 100, one epoch is 100
iterations.

Batch size trades off memory and gradient noise: larger batches use the GPU better but may need a higher learning rate
and can generalise slightly worse; smaller batches are noisier, which can help escape poor minima.

### How do you prevent overfitting in a neural network? {core}

First, more or better data, including augmentation. Then regularisation: **dropout** (randomly zero activations during
training), **weight decay**, and **early stopping** on validation loss with the best checkpoint saved. Also use a
smaller model, or start from a pretrained model so you need less data.

I diagnose it from the curves: training loss keeps falling while validation loss rises. If both are high, the model is
underfitting, and I would add capacity or train longer instead.

### How does dropout work, and why is it turned off at inference? {deep}

During training, dropout sets each activation to zero with probability p (for example 0.2), so the network cannot rely
on any single neuron and learns redundant features: it behaves like an ensemble of many thinned networks. Modern
"inverted" dropout scales the surviving activations by 1/(1 − p) during training, so the expected value is unchanged.
At inference you want deterministic, full-strength predictions, so dropout is switched off; that is why you call
`model.eval()`.

### Batch normalisation vs layer normalisation? {deep}

Both rescale activations to zero mean and unit variance, then apply a learned scale and shift. **Batch norm**
normalises each feature across the examples in a batch; it speeds up CNN training but depends on batch statistics, so
it behaves differently in training and inference (running averages) and struggles with tiny batches. **Layer norm**
normalises across the features of each single example, so it does not depend on the batch; that is why transformers
use it (many recent LLMs use the simpler RMSNorm variant).

### Why are softmax and cross-entropy used together? {deep}

Softmax turns logits into a probability distribution, and cross-entropy measures the negative log-probability of the
correct class, so the loss strongly penalises confident wrong answers. Together their gradient simplifies to
`predicted probability − true label`, which is clean and stable. Frameworks combine them into one operation
(`nn.CrossEntropyLoss` takes raw logits) to avoid overflow and log-of-zero problems; never apply softmax yourself
before that loss.

### What is a CNN and why is it good for images?

A convolutional neural network slides small learned filters (for example 3×3) across the image. Each filter detects a
local pattern such as an edge, and deeper layers combine them into shapes and objects. Because the same filter is
reused at every position (**weight sharing**), a CNN has far fewer parameters than a dense network and recognises a
pattern wherever it appears. **Pooling** or strided convolutions shrink the spatial size as depth grows.

In healthcare, CNNs are classic for medical imaging such as X-rays, CT, pathology slides and retinal scans, usually
fine-tuned from a model pretrained on ImageNet. Vision transformers now compete with them.

### What are RNNs and LSTMs, and why did transformers replace them?

RNNs process a sequence one step at a time, carrying a hidden state forward, so they model order naturally. Plain RNNs
suffer from vanishing gradients over long sequences; **LSTMs** and **GRUs** add gates that decide what to keep and
forget, which helps. But they are still sequential: step t must wait for step t − 1, so they train slowly and struggle
with very long-range dependencies.

Transformers replaced them for most tasks because self-attention connects every position to every other in one step
and the whole sequence is processed in parallel on GPUs.

### What is attention, and self-attention? {core}

Attention lets the model decide which parts of the input matter for each output. In **self-attention**, every token
produces a query, a key and a value vector. A token's query is compared with every token's key (a dot product, scaled
and passed through softmax) to get weights, and its new representation is the weighted sum of the values. So the word
"it" can attend strongly to the noun it refers to, wherever it is in the sentence.

**Multi-head** attention runs several attention operations in parallel so different heads can learn different
relationships. Because attention compares every token with every other, cost grows with the square of the sequence
length, which is why context windows are limited. Transformers ("Attention Is All You Need", 2017) stack attention and
feed-forward layers with residual connections and layer norm.

### What is transfer learning, and what is LoRA? {core}

Transfer learning means starting from a model pretrained on a large dataset and adapting it to your task, because the
early layers already know general features (edges, grammar). You either freeze the base and train a new head, or
fine-tune some or all layers with a small learning rate. It needs far less labelled data and compute; in healthcare,
where labelled data is expensive, it is the default.

**LoRA** (low-rank adaptation) is parameter-efficient fine-tuning: the original weights stay frozen and you train
small low-rank matrices added to chosen layers (often the attention projections). You train a tiny fraction of the
parameters, need much less GPU memory, and can swap adapters per task. QLoRA does the same on a quantised base model.

### When would you not use deep learning? {core}

On small or medium **tabular** data (claims, demographics, lab values in columns), gradient-boosted trees such as
XGBoost or LightGBM usually match or beat neural networks, train in minutes on a CPU, need less tuning, and are easier
to explain to clinicians and auditors. I also avoid deep learning when labelled data is scarce and there is no
suitable pretrained model, when strict explainability is required, or when latency and cost budgets are tight.

Deep learning wins on unstructured data: images, free text, audio and documents.

### What are exploding gradients, and how do you handle them? {deep}

The opposite of vanishing gradients: gradients grow as they are multiplied back through many layers or time steps,
producing huge updates and NaN losses. Fixes: **gradient clipping** (cap the gradient norm, for example at 1.0, a
standard step in RNN and transformer training), a lower learning rate, good weight initialisation, normalisation layers
and residual connections.

### Why does weight initialisation matter? {deep}

If all weights start equal, every neuron in a layer computes the same thing and receives the same gradient, so they
never differentiate: initial weights must be random to break symmetry. The scale matters too: too large and
activations explode, too small and they vanish. **Xavier/Glorot** initialisation suits tanh and sigmoid; **He
(Kaiming)** initialisation, with a larger variance, suits ReLU. Frameworks pick sensible defaults per layer type.

### Why do we train on GPUs, and what is mixed precision? {deep}

Neural network training is dominated by large matrix multiplications, which GPUs run in parallel across thousands of
cores, often tens of times faster than a CPU. **Mixed precision** does most of the maths in 16-bit floats (FP16 or
BF16) while keeping a 32-bit master copy of the weights, which roughly halves memory and speeds up training on modern
GPUs with little or no accuracy loss. BF16 is preferred where supported because it has the same exponent range as FP32,
so it rarely overflows.

### PyTorch or TensorFlow? {deep}

Both are mature. **PyTorch** dominates research and most new LLM and open-model work (Hugging Face is PyTorch-first);
its eager, Pythonic style is easy to debug. **TensorFlow/Keras** has a long history in production pipelines and mobile
(TensorFlow Lite), and Keras 3 can run on several backends. For a new project I would choose PyTorch unless the team
already runs on TensorFlow. Either way, I would export to a portable format for deployment (ONNX, or `torch.export` in PyTorch 2; TorchScript is
the older route).

### How would you use deep learning on a healthcare problem, and what are the risks? {core}

I would start from the data type: imaging suggests a fine-tuned CNN or vision transformer; clinical notes suggest a
pretrained clinical language model or an LLM; tabular claims suggest gradient boosting rather than deep learning. Then
I would plan data access under HIPAA (de-identified training data, a BAA with any cloud provider), patient-level
train/test splits to avoid leakage, and metrics chosen with clinicians (sensitivity for screening, calibration for risk
scores).

The risks to mention: dataset shift between hospitals or scanners, bias across demographic groups, poor calibration,
and explainability. If the model drives clinical decisions it may be regulated as Software as a Medical Device. In
production I keep a human in the loop, which is what the HITL review step did on the Document AI platform.

## Coding problems

### Implement a numerically stable softmax {easy core}

Write `softmax(z)` for a 1-D NumPy array of logits. It must not overflow for large values such as `[1000, 1001, 1002]`,
and the outputs must sum to 1.

Example: `softmax([1, 2, 3])` ≈ `[0.090, 0.245, 0.665]`.

#### Hints

1. `np.exp(1000)` overflows to infinity. What can you subtract from every logit without changing the answer?
2. Softmax is unchanged if you add the same constant to every input, because the constant cancels in the ratio.

#### Solution

The naive version computes `exp(z) / sum(exp(z))` and overflows for large logits. Because
`e^(zi − c) / Σ e^(zj − c) = e^zi / Σ e^zj`, subtracting the maximum logit changes nothing mathematically but makes the
largest exponent `e^0 = 1`, so nothing overflows.

```python
import numpy as np

def softmax(z: np.ndarray) -> np.ndarray:
    z = np.asarray(z, dtype=float)
    shifted = z - z.max()          # largest value becomes 0, so exp() is at most 1
    e = np.exp(shifted)
    return e / e.sum()

p = softmax(np.array([1.0, 2.0, 3.0]))
assert np.allclose(p, [0.09003057, 0.24472847, 0.66524096])
assert np.isclose(p.sum(), 1.0)

big = softmax(np.array([1000.0, 1001.0, 1002.0]))   # the naive version returns nan here
assert np.allclose(big, p)                          # same answer: shifting does not change softmax
assert np.allclose(softmax(np.array([5.0])), [1.0])
```

Complexity: O(n) time and O(n) space.

#### Follow-ups

- **How would you handle a batch (a 2-D array of shape rows × classes)?** Subtract `z.max(axis=1, keepdims=True)` and
  divide by `e.sum(axis=1, keepdims=True)`.
- **Why do frameworks take logits in the loss instead of probabilities?** Combining log and softmax (log-sum-exp) is
  more stable than taking the log of a probability that may have rounded to 0.

### Train logistic regression with gradient descent {medium core}

Implement binary logistic regression from scratch with NumPy: `fit(X, y, lr, epochs)` returns weights and a bias,
trained by batch gradient descent on the log loss. Show it reaches accuracy similar to scikit-learn on a synthetic
dataset.

#### Hints

1. Prediction is `sigmoid(X @ w + b)`. The loss is the average binary cross-entropy.
2. The gradient of the average log loss is `X.T @ (p − y) / n` for the weights and `mean(p − y)` for the bias.
3. Standardise the features first, or gradient descent converges very slowly.

#### Solution

This is a single neuron with a sigmoid, trained exactly like a neural network: forward pass, loss, gradient, update.
The derivative of sigmoid plus cross-entropy simplifies to `p − y`, so the gradients are short.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-z))

def fit(X: np.ndarray, y: np.ndarray, lr: float = 0.1, epochs: int = 2000) -> tuple[np.ndarray, float, list[float]]:
    n, d = X.shape
    w, b = np.zeros(d), 0.0
    losses = []
    for _ in range(epochs):
        p = sigmoid(X @ w + b)                       # forward
        eps = 1e-12
        losses.append(-np.mean(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)))
        error = p - y                                # d loss / d logit
        w -= lr * (X.T @ error) / n                  # gradient step for weights
        b -= lr * error.mean()                       # and for the bias
    return w, b, losses

X, y = make_classification(n_samples=600, n_features=6, n_informative=4, random_state=0)
X = StandardScaler().fit_transform(X)

w, b, losses = fit(X, y)
ours = ((sigmoid(X @ w + b) > 0.5) == y).mean()
theirs = LogisticRegression().fit(X, y).score(X, y)

assert losses[-1] < losses[0]                       # the loss went down
assert all(a >= c - 1e-12 for a, c in zip(losses, losses[1:]))   # and never went up with this learning rate
assert abs(ours - theirs) < 0.02                    # close to scikit-learn
print(f"ours {ours:.3f}  sklearn {theirs:.3f}")
```

Complexity: O(epochs × n × d) time, O(d) extra space for the weights.

#### Follow-ups

- **How would you add L2 regularisation?** Add `lam * w` to the weight gradient (not the bias). scikit-learn's
  `LogisticRegression` applies L2 by default (`C=1.0` is the inverse strength), which is one reason the numbers differ slightly.
- **How would you make it mini-batch?** Shuffle each epoch and loop over slices of, say, 64 rows, updating after each slice.
- **How do you know your gradient is right?** A gradient check: compare it with `(loss(w + h) − loss(w − h)) / 2h` for a tiny h.

### Check a gradient numerically {medium}

You wrote the analytic gradient of the mean squared error for linear regression, `grad = 2/n · Xᵀ(Xw − y)`. Write a
function that verifies any analytic gradient with central finite differences, and use it to confirm this one.

#### Hints

1. For each weight i, nudge only that weight up and down by a small h and measure how the loss changes.
2. The central difference `(f(w + h·eᵢ) − f(w − h·eᵢ)) / 2h` is accurate to O(h²).
3. Compare with a relative error, not an absolute one, because gradients can be large or tiny.

#### Solution

A gradient check is how you debug a hand-written backward pass: if the analytic and numeric gradients disagree, the
backward code has a bug. It is too slow for training (two loss evaluations per parameter) but perfect for a test.

```python
from typing import Callable
import numpy as np

def numeric_grad(f: Callable[[np.ndarray], float], w: np.ndarray, h: float = 1e-5) -> np.ndarray:
    grad = np.zeros_like(w)
    for i in range(w.size):
        step = np.zeros_like(w)
        step[i] = h
        grad[i] = (f(w + step) - f(w - step)) / (2 * h)
    return grad

def relative_error(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b) / max(np.linalg.norm(a) + np.linalg.norm(b), 1e-12))

rng = np.random.default_rng(1)
X, y, w = rng.normal(size=(50, 4)), rng.normal(size=50), rng.normal(size=4)

mse = lambda w: float(np.mean((X @ w - y) ** 2))
analytic = 2 / len(X) * X.T @ (X @ w - y)

assert relative_error(analytic, numeric_grad(mse, w)) < 1e-7

# A buggy gradient (forgot the factor 2) is caught immediately.
buggy = 1 / len(X) * X.T @ (X @ w - y)
assert relative_error(buggy, numeric_grad(mse, w)) > 0.1
```

Complexity: O(d) loss evaluations, each O(n·d), so O(n·d²) time.

#### Follow-ups

- **Why central rather than forward differences?** The forward difference `(f(w + h) − f(w)) / h` has O(h) error;
  the central one has O(h²).
- **Why not make h as small as possible?** Below about 1e-7, floating-point round-off dominates and the estimate gets worse.

### Implement inverted dropout {easy}

Write `dropout(a, p, training, rng)` for a NumPy array of activations. In training mode, zero each element with
probability `p` and scale the survivors so the expected value is unchanged. In evaluation mode, return the input
unchanged.

#### Hints

1. Draw a random mask that is True with probability `1 − p`.
2. Divide the kept values by `1 − p`, so the average activation stays the same and inference needs no rescaling.

#### Solution

"Inverted" dropout does the rescaling during training, so the inference code is just the identity. That is what
PyTorch's `nn.Dropout` does, and why calling `model.eval()` is enough to switch it off.

```python
import numpy as np

def dropout(a: np.ndarray, p: float, training: bool, rng: np.random.Generator) -> np.ndarray:
    if not training or p == 0:
        return a
    if not 0 <= p < 1:
        raise ValueError("p must be in [0, 1)")
    keep = rng.random(a.shape) >= p          # True with probability 1 - p
    return a * keep / (1 - p)

rng = np.random.default_rng(0)
a = np.ones(100_000)

out = dropout(a, p=0.2, training=True, rng=rng)
assert abs((out == 0).mean() - 0.2) < 0.01          # about 20% dropped
assert abs(out.mean() - 1.0) < 0.01                 # expected value preserved
assert set(np.unique(out)) == {0.0, 1.25}           # survivors scaled by 1 / (1 - 0.2)

assert dropout(a, p=0.2, training=False, rng=rng) is a   # identity at inference
```

Complexity: O(n) time and space for the mask.

#### Follow-ups

- **Where do you put dropout?** After activations in dense layers, and on attention weights and residual branches in
  transformers. Rarely right after the output layer.
- **What happens if you forget `model.eval()`?** Predictions become random and slightly wrong at inference: a common
  production bug.
