---
title: LLMs, embeddings and prompting
goal: Explain how an LLM produces text, what tokens, temperature and embeddings are, and how you make LLM output reliable, cheap and safe in a production healthcare system.
minutes: 45
---

A "Python & AI Engineer" interview will test whether you understand the model you call, not just the API. Expect
questions on how generation works, what the knobs do, how you get structured and trustworthy output, and how you
choose between prompting, RAG and fine-tuning.

This is your strongest area. You have shipped an AI-driven Document AI platform with a Pydantic validation gate and
human review, and built agentic AI workflows. Answer like someone who has run this in production: name the trade-off, give a concrete example, and
say how you measured it.

## How an LLM generates text

A large language model is a neural network, almost always a **decoder-only transformer**, trained to predict the
**next token** given all the tokens before it. Generation is a loop:

1. The prompt is split into tokens and turned into vectors (embeddings plus position information).
2. The transformer layers mix information across positions with **self-attention** and produce a score (a *logit*)
   for every token in the vocabulary.
3. The logits become probabilities through **softmax**, adjusted by **temperature**, **top-p** and **top-k**.
4. One token is chosen (sampled, or the most likely one), appended to the sequence, and the loop repeats until a stop
   token or the output limit.

```text
"Prior authorization is"  →  tokens  →  transformer  →  logits for ~100k tokens
                                                     →  softmax(T)  →  sample "required"
"Prior authorization is required"  →  ... repeat ...
```

The model has no database of facts. It learned statistical patterns during **pre-training** on a huge text corpus.
**Instruction tuning** (supervised fine-tuning on prompt/response pairs) and **preference tuning** (RLHF or DPO) then
turn the base model into a helpful assistant that follows instructions.

## Temperature, top-p and top-k in code

Temperature divides the logits before softmax. Low temperature sharpens the distribution (closer to always picking the
top token); high temperature flattens it (more variety, more risk).

```python
import numpy as np

def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    if temperature <= 0:
        raise ValueError("temperature must be > 0; use argmax for greedy decoding")
    z = logits / temperature
    z = z - z.max()  # subtract the max for numerical stability
    e = np.exp(z)
    return e / e.sum()

def top_p_filter(probs: np.ndarray, p: float) -> np.ndarray:
    """Nucleus sampling: keep the smallest set of top tokens whose total probability reaches p."""
    order = np.argsort(probs)[::-1]
    cumulative = np.cumsum(probs[order])
    keep = order[: np.searchsorted(cumulative, p) + 1]
    out = np.zeros_like(probs)
    out[keep] = probs[keep]
    return out / out.sum()

logits = np.array([2.0, 1.0, 0.1])
cold, normal, hot = softmax(logits, 0.2), softmax(logits, 1.0), softmax(logits, 2.0)
assert np.isclose(normal.sum(), 1.0)
assert cold[0] > normal[0] > hot[0]  # low temperature: the top token dominates
assert np.ptp(hot) < np.ptp(normal)  # high temperature: flatter distribution

probs = np.array([0.5, 0.3, 0.15, 0.05])
assert np.count_nonzero(top_p_filter(probs, 0.75)) == 2  # 0.5 + 0.3 reaches 0.75
assert np.count_nonzero(top_p_filter(probs, 0.9)) == 3
print(np.round(cold, 3), np.round(normal, 3), np.round(hot, 3))
```

```text
[0.993 0.007 0.   ] [0.659 0.242 0.099] [0.502 0.304 0.194]
```

For extraction, classification and anything a machine parses, use **temperature 0** (or close to it). For
brainstorming or drafting text, a higher temperature is fine.

## Self-attention in a few lines

Each token produces a **query**, a **key** and a **value** vector. A token's output is a weighted average of all
values, where the weights come from how well its query matches each key. In a decoder, a **causal mask** stops a token
from looking at future tokens.

```python
import numpy as np

def causal_attention(Q: np.ndarray, K: np.ndarray, V: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d_k = Q.shape[-1]
    scores = Q @ K.T / np.sqrt(d_k)  # scale so softmax does not saturate
    future = np.triu(np.ones_like(scores, dtype=bool), k=1)
    scores = np.where(future, -np.inf, scores)  # token i may only attend to tokens <= i
    weights = np.exp(scores - scores.max(axis=-1, keepdims=True))
    weights /= weights.sum(axis=-1, keepdims=True)
    return weights @ V, weights

rng = np.random.default_rng(0)
Q, K, V = (rng.normal(size=(4, 8)) for _ in range(3))
out, w = causal_attention(Q, K, V)
assert out.shape == (4, 8)
assert np.allclose(w.sum(axis=1), 1.0)
assert np.allclose(np.triu(w, k=1), 0.0)  # no attention to the future
assert np.isclose(w[0, 0], 1.0)  # the first token can only see itself
```

Real models run many attention **heads** in parallel, stack dozens of layers, and add feed-forward layers, residual
connections and normalisation. The formula to remember is `softmax(QKᵀ / √d_k) · V`.

## Embeddings and similarity

An **embedding** is a dense vector that represents the meaning of a piece of text. Texts with similar meaning land
close together, so you compare them with **cosine similarity** (the angle between vectors). Embeddings power semantic
search, RAG retrieval, clustering, deduplication and classification.

```python
import numpy as np

def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

# Toy 3-dimensional "embeddings"; real ones have hundreds to thousands of dimensions.
prior_auth = np.array([0.9, 0.1, 0.0])
pre_approval = np.array([0.8, 0.2, 0.1])
pizza = np.array([0.0, 0.1, 0.95])

assert cosine(prior_auth, pre_approval) > 0.95
assert cosine(prior_auth, pizza) < 0.1
assert np.isclose(cosine(prior_auth, 3 * prior_auth), 1.0)  # length does not matter, only direction

# If vectors are normalised to length 1, cosine similarity is just a dot product.
unit = lambda v: v / np.linalg.norm(v)
assert np.isclose(unit(prior_auth) @ unit(pre_approval), cosine(prior_auth, pre_approval))
```

Always embed documents and queries with the **same model**: vectors from different models live in different spaces
and cannot be compared.

## Structured output you can trust

When code consumes the output, ask for JSON that matches a schema, then **validate it**. Never trust the model's
output just because it looks right.

```python
from datetime import date
from pydantic import BaseModel, Field, ValidationError

class PaystubFields(BaseModel):
    employee_name: str = Field(min_length=1)
    pay_date: date
    gross_pay: float = Field(ge=0)
    pay_frequency: str = Field(pattern="^(weekly|biweekly|semimonthly|monthly)$")

good = '{"employee_name": "Jane Roe", "pay_date": "2026-09-30", "gross_pay": 2450.75, "pay_frequency": "biweekly"}'
bad = '{"employee_name": "", "pay_date": "30/09/2026", "gross_pay": -5, "pay_frequency": "fortnightly"}'

fields = PaystubFields.model_validate_json(good)
assert fields.pay_date == date(2026, 9, 30)

try:
    PaystubFields.model_validate_json(bad)
except ValidationError as e:
    problems = {err["loc"][0] for err in e.errors()}
    assert problems == {"employee_name", "pay_date", "gross_pay", "pay_frequency"}
    print(f"{e.error_count()} problems: send to human review or re-prompt with the errors")
```

Many providers can also constrain decoding to a JSON schema ("structured outputs" or forced tool calls). That
guarantees the *shape*, but not that the *values* are correct, so you still validate business rules and route
low-confidence results to a human.

**Your angle:** on the LDH Medicaid Document AI platform at Quantiphi, Pydantic schemas enforced the data contract on
ML-extracted fields from MAGI and Non-MAGI forms and paystubs. That validation step was the quality gate before
human-in-the-loop review.

## Calling a model

Most hosted and local model servers expose an OpenAI-compatible chat API, so the client code looks the same whether
you call a hosted model or a local Qwen model through Ollama.

```python norun
# Needs a running model server, so this block is not executed by the lab's checker.
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")  # Ollama's OpenAI-compatible endpoint
response = client.chat.completions.create(
    model="qwen2.5",
    temperature=0,
    messages=[
        {"role": "system", "content": "You extract fields from Medicaid documents. Reply with JSON only."},
        {"role": "user", "content": "Document text: ..."},
    ],
)
print(response.choices[0].message.content)
```

## Interview questions

### How does an LLM generate text? {core}

An LLM is a transformer trained to predict the next token. At inference it reads the prompt, produces a probability
for every token in its vocabulary, picks one (greedily or by sampling with temperature and top-p), appends it, and
repeats until it emits a stop token or hits the output limit. So every answer is generated one token at a time,
conditioned on everything before it.

The follow-up is usually "so does it know facts?" Not as a database does. Knowledge is stored implicitly in the
weights from pre-training, which is why it can be out of date or confidently wrong, and why we ground answers with
retrieval and validate outputs.

### What is a token, and why do tokens matter? {core}

A token is the unit the model reads and writes: usually a sub-word piece produced by a tokenizer such as byte-pair
encoding. In English, a rough rule is about 4 characters or three-quarters of a word per token. Tokens matter because
**everything is measured in them**: the context window limit, the price (input and output tokens are billed,
usually at different rates), and latency (output is generated token by token).

Practical consequences: numbers, rare words, code and non-English text often take more tokens than you expect;
character counting ("how many r's in strawberry") is hard for models because they see tokens, not letters; and for
budgeting you use the model's real tokenizer, not a word count.

### What is the context window?

The context window is the maximum number of tokens the model can attend to in one request: system prompt, history,
retrieved documents, tool results **and** the generated output combined. Anything outside it simply does not exist
for the model.

Bigger windows help but are not free: cost and latency grow with input size, and models use information in the middle
of very long contexts less reliably than information at the start or end. So you still select and order context
carefully, trim history, and summarise old turns rather than sending everything.

### What do temperature and top-p control? {core}

Both control randomness in choosing the next token. **Temperature** scales the logits before softmax: low values make
the most likely token dominate, high values flatten the distribution. **Top-p** (nucleus sampling) keeps only the
smallest set of tokens whose probabilities add up to p and samples from those; **top-k** keeps the k most likely.

For extraction, classification and code that a parser consumes, I use temperature 0. For drafting or brainstorming I
raise it. Usually you tune temperature or top-p, not both. Temperature 0 makes outputs much more repeatable, but not
always bit-for-bit identical on hosted APIs, so tests should check properties, not exact strings.

### What are embeddings, and how do you compare them? {core}

An embedding is a fixed-length vector that encodes the meaning of a text (or image), produced by an embedding model.
Similar meanings map to nearby vectors, so you compare them with cosine similarity, or a dot product when the vectors
are normalised. They are the basis of semantic search and RAG retrieval, and also useful for clustering, deduplication
and as features for a classifier.

Two traps: use the same embedding model for documents and queries, and re-embed everything if you change models. And
embeddings capture topical similarity, not truth: "the claim was approved" and "the claim was denied" can be very
close, which is one reason to add reranking and keyword search.

### Explain the transformer and self-attention. {core}

A transformer turns tokens into vectors and passes them through a stack of layers. Each layer has **self-attention**,
where every token builds a query, key and value; it compares its query with every key, turns the scores into weights
with softmax, and takes a weighted average of the values. That lets each token pull in context from anywhere in the
sequence in one step. A feed-forward network then transforms each position, with residual connections and
normalisation around both parts.

Key details: attention is `softmax(QKᵀ/√d_k)V`; multiple heads learn different relationships; position information is
added (for example rotary position embeddings) because attention itself ignores order; a decoder uses a causal mask so
a token cannot see the future. Attention cost grows with the square of the sequence length, which is why long context
is expensive.

### What is the difference between encoder-only, decoder-only and encoder-decoder models? {deep}

**Encoder-only** models (BERT family) see the whole input in both directions and produce representations; they are used
for classification, named-entity recognition and embeddings, not for generating long text. **Decoder-only** models (GPT,
Claude, Llama, Qwen) generate left to right with a causal mask and dominate chat and generation. **Encoder-decoder**
models (T5, original transformer) encode the input then decode an output, a classic fit for translation and
summarisation.

In practice: embedding and reranking models are often encoder-based; chat and agent models are decoder-only.

### What prompting techniques do you use? {core}

A clear **system prompt** with the role, task, rules and output format; **delimiters** around untrusted input (for
example the document text) so instructions and data do not mix; **few-shot examples** that show edge cases and the exact
output shape; asking the model to **reason step by step** for multi-step problems, or using a model with built-in
reasoning; and breaking a big task into a **chain** of smaller prompts that are each easy to validate.

I treat prompts like code: versioned, tested against a fixed evaluation set, and changed one variable at a time. A
good habit is telling the model what to do when it cannot answer ("return null for a field that is not present")
instead of letting it guess.

### How do you get reliable structured output from an LLM? {core}

Three layers. First, ask for JSON with an explicit schema and examples. Second, where the provider supports it, use
schema-constrained output or a forced tool call so the response is guaranteed to parse. Third, **validate** the
result with Pydantic: types, required fields, formats, ranges and cross-field rules. On failure, either re-prompt with
the validation errors (bounded retries) or route the item to a human.

Constrained decoding guarantees shape, not truth, so business-rule validation and confidence thresholds still matter.

**Your angle:** this was exactly the quality gate on the LDH Medicaid Document AI platform: Pydantic schemas enforced
the data contract on ML-extracted fields before human-in-the-loop review.

### What causes hallucinations, and how do you reduce them? {core}

The model generates plausible continuations, not verified facts, so when it lacks the information or the prompt is
ambiguous it can produce fluent, confident, wrong content. Mitigations: **ground** it with retrieved sources and
instruct it to answer only from them; **require citations** and check that they exist; allow and reward "I don't
know"; use low temperature for factual tasks; **validate** structured output against schemas and reference data (a
real NPI, an existing member ID); and keep a **human in the loop** for high-stakes decisions.

Then measure it: an evaluation set with known answers and a faithfulness check, tracked over time. In healthcare I
would never let an unvalidated model output change a claim, eligibility decision or clinical record directly.

### Prompting, RAG or fine-tuning: how do you choose? {core}

Start with **prompting**: cheapest and fastest to iterate. Add **RAG** when the model needs knowledge it does not have
or that changes: policies, member data, internal documents. RAG also gives citations and per-user access control.
Consider **fine-tuning** when you need a consistent *behaviour* or format, domain style or vocabulary, or a smaller,
cheaper model to match a big one on a narrow task, and you have good labelled examples.

Rule of thumb: RAG adds knowledge, fine-tuning shapes behaviour. Fine-tuning is a poor way to add facts that change,
because you must retrain to update them and the model can still hallucinate. They combine well: a fine-tuned model
that also uses retrieval.

### What is LoRA? {deep}

LoRA (low-rank adaptation) is a parameter-efficient fine-tuning method. You freeze the base model's weights and train
small low-rank matrices added to some layers, so the update to a weight matrix W is `B·A`, with A and B far smaller
than W. You train a tiny fraction of the parameters, need much less GPU memory, and can keep many task-specific
adapters for one base model. **QLoRA** goes further by holding the frozen base model in 4-bit quantised form during
training.

### Hosted APIs or open-weight models: what are the trade-offs?

**Hosted** models (OpenAI, Anthropic Claude, Google Gemini, often through Azure OpenAI, AWS Bedrock or Vertex AI) give
the strongest capability with no infrastructure, but you pay per token, depend on the vendor, and must sign a BAA and
check data-retention terms before any PHI goes near them. **Open-weight** models (Llama, Qwen, Mistral) run on your own
hardware or VPC, through tools like Ollama or vLLM: full data control, predictable cost at high volume, and fine-tuning
freedom, but you own GPUs, scaling, upgrades and safety, and they may trail the best hosted models.

**Your angle:** your skills list Ollama with Qwen alongside the OpenAI API, so you can speak to both sides from hands-on
use: running an open-weight model locally versus calling a hosted API.

### How do you control LLM cost and latency?

Cost is tokens times price, so: send less (trim history, retrieve fewer and better chunks, shorter prompts), cap
`max_tokens`, **route** easy requests to a small, cheap model and hard ones to a big model, **cache** repeated
results and use the provider's prompt caching for a long shared prefix, and use **batch** APIs for offline work.

For latency: **stream** tokens so time-to-first-token is short, run independent calls in parallel, keep output short
(output tokens are the slow part), and move non-interactive work to background jobs. Measure cost and latency per
request in your telemetry so you can see which feature is expensive.

### How do you evaluate LLM outputs? {core}

Build a **golden dataset** of real inputs with expected outputs, and run it on every prompt or model change, like a
regression test suite. Use the most objective metric available: exact or field-level match for extraction, accuracy or
F1 for classification, schema validity rate, and for free text a rubric scored by humans or by an **LLM-as-judge** that
you have checked against human ratings. Also track production signals: human correction rate, escalation rate, user
feedback, latency and cost.

**Your angle:** in a human-in-the-loop system, reviewer corrections are labelled data. The fields humans changed most
show where extraction or prompts need work.

### What is the KV cache, and why is reading the prompt faster than generating? {deep}

During generation, each new token needs the keys and values of all previous tokens at every layer. The **KV cache**
stores them so they are not recomputed every step. Reading the prompt (prefill) processes all input tokens in
parallel, which GPUs do efficiently. Generation (decode) produces one token at a time, each step depending on the last,
so it is sequential and slower per token. That is why output tokens dominate latency and usually cost more, and why
prompt caching of a shared prefix saves both time and money.

### How do roles and the system prompt work in chat APIs?

A chat request is a list of messages with roles: **system** (or developer) for instructions and rules that frame the
whole conversation, **user** for the request, **assistant** for prior model replies, and **tool** for results of tool
calls. The model is trained to give system instructions priority, but that is a strong tendency, not a security
boundary: untrusted text in a user message or a retrieved document can still try to override it. So permissions and
validation must be enforced in code, not only in the prompt.

### How does a base model become a helpful assistant? {deep}

Three stages. **Pre-training**: next-token prediction on trillions of tokens gives broad knowledge and language
ability, but the base model just continues text. **Supervised fine-tuning** (instruction tuning) on prompt/response
examples teaches it to follow instructions and use a chat format. **Preference tuning** (RLHF with a reward model, or
direct preference optimisation) aligns it with what people judge helpful, honest and harmless. Some models add
reinforcement learning on verifiable tasks (maths, code) to improve step-by-step reasoning.

### Why can the same prompt give different answers, and how do you make outputs repeatable?

Sampling is random when temperature is above zero, and even at temperature 0 hosted models can vary slightly because
of batching and floating-point effects, or because the provider updated the model. To make outputs repeatable: set
temperature to 0, **pin the exact model version**, version your prompts, constrain the output format, and validate. For
tests, assert on properties (valid schema, correct fields) rather than exact wording. For audits, log the model
version, prompt version and inputs with each result (without PHI in plain logs).

### What is quantisation, and why does it matter for self-hosting? {deep}

Quantisation stores weights in fewer bits, for example 8-bit or 4-bit integers instead of 16-bit floats. A 4-bit model
needs roughly a quarter of the memory of a 16-bit one, so larger models fit on smaller GPUs or laptops (this is what
makes running models through Ollama practical) and inference often gets faster. The cost is some loss of quality, which
grows at very low bit widths, so you evaluate the quantised model on your own task before relying on it.

### Can you send PHI to an LLM API? {core}

Only under the right agreements and controls. Under HIPAA, the model provider becomes a business associate, so you need
a **BAA** and a HIPAA-eligible service, such as Azure OpenAI, AWS Bedrock or Vertex AI under the cloud provider's BAA,
or a self-hosted model inside your own controlled environment. On top of that: apply **minimum necessary** (send only
the fields the task needs), de-identify or redact where the task allows it, confirm data-retention and training
settings, encrypt in transit, keep PHI out of prompt logs and traces, and record an audit trail of who sent what.

A consumer chatbot with no BAA is never acceptable for PHI, whatever the convenience.

## Coding problems

### Top-k semantic search over embeddings {easy core}

You are given a matrix of document embeddings (one row per document) and a query embedding. Return the indices of the
`k` most similar documents by cosine similarity, most similar first.

Example: with documents `[[1, 0], [0, 1], [0.9, 0.1]]` and query `[1, 0]`, `top_k(..., k=2)` returns `[0, 2]`.

#### Hints

1. Cosine similarity is the dot product of the vectors divided by the product of their lengths.
2. Normalise every row once; then one matrix–vector product gives all similarities at the same time.
3. `np.argsort` sorts ascending, so reverse it, or use `np.argpartition` for very large collections.

#### Solution

The brute-force approach loops over documents and computes cosine similarity one at a time, which is O(n·d) but slow in
Python. Vectorise instead: normalise the rows and the query, then `docs @ query` gives every cosine similarity at once.
Guard against zero vectors so you never divide by zero.

```python
import numpy as np

def top_k(docs: np.ndarray, query: np.ndarray, k: int) -> list[int]:
    if k <= 0 or len(docs) == 0:
        return []
    doc_norms = np.linalg.norm(docs, axis=1, keepdims=True)
    q_norm = np.linalg.norm(query)
    if q_norm == 0:
        raise ValueError("query embedding is all zeros")
    sims = (docs / np.where(doc_norms == 0, 1, doc_norms)) @ (query / q_norm)
    k = min(k, len(docs))
    return [int(i) for i in np.argsort(-sims, kind="stable")[:k]]

docs = np.array([[1.0, 0.0], [0.0, 1.0], [0.9, 0.1]])
assert top_k(docs, np.array([1.0, 0.0]), 2) == [0, 2]
assert top_k(docs, np.array([0.0, 2.0]), 1) == [1]  # scale of the query does not matter
assert top_k(docs, np.array([1.0, 0.0]), 10) == [0, 2, 1]  # k larger than n
assert top_k(np.empty((0, 2)), np.array([1.0, 0.0]), 3) == []
assert top_k(np.array([[0.0, 0.0], [1.0, 1.0]]), np.array([1.0, 1.0]), 1) == [1]  # zero row is safe
```

Complexity: O(n·d) to compute the similarities plus O(n log n) to sort, where n is the number of documents and d the
dimension. `np.argpartition` brings the selection down to O(n + k log k) when you only need the top k.

#### Follow-ups

- **What if there are 50 million vectors?** Exact search is too slow; use an approximate nearest-neighbour index (HNSW
  or IVF) in a vector store such as pgvector, FAISS or a managed service, and accept slightly lower recall for much
  lower latency.
- **Why normalise at write time?** Store normalised vectors once, and similarity becomes a plain dot product at query
  time, which is cheaper.

### Trim chat history to fit a token budget {medium}

A chat assistant must send the system prompt plus as much recent conversation as fits in the model's context window,
leaving room for the answer. Write `fit_history(system, messages, window, reserve)` that returns the system prompt and
the **most recent** messages, in their original order, whose estimated tokens fit in `window - reserve`. Estimate tokens
as `ceil(len(text) / 4)`. Always keep the latest user message; if even that does not fit, raise an error.

#### Hints

1. The system prompt and the reserved output space are fixed costs; subtract them first.
2. Walk the messages from newest to oldest, adding while the running total fits.
3. Collect in reverse, then reverse once more to restore chronological order.

#### Solution

Work out the budget left after the system prompt and the reserved output, then walk backwards from the newest message,
keeping messages while they fit. Stop at the first one that does not fit, so the kept history stays contiguous: a gap
in the middle of a conversation confuses the model.

```python
import math

def estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 4)  # rough heuristic; use the model's tokenizer in production

def fit_history(system: str, messages: list[dict], window: int, reserve: int) -> list[dict]:
    budget = window - reserve - estimate_tokens(system)
    kept: list[dict] = []
    for msg in reversed(messages):
        cost = estimate_tokens(msg["content"])
        if cost > budget:
            break
        kept.append(msg)
        budget -= cost
    if messages and not kept:
        raise ValueError("the latest message alone does not fit in the context window")
    return [{"role": "system", "content": system}] + kept[::-1]

history = [
    {"role": "user", "content": "a" * 400},       # 100 tokens
    {"role": "assistant", "content": "b" * 400},  # 100 tokens
    {"role": "user", "content": "c" * 200},       # 50 tokens
]
out = fit_history("s" * 40, history, window=300, reserve=100)  # budget 300 - 100 - 10 = 190
assert [m["content"][0] for m in out] == ["s", "b", "c"]  # oldest message dropped, order kept

out = fit_history("s" * 40, history, window=1000, reserve=100)
assert len(out) == 4  # everything fits

try:
    fit_history("s" * 40, history, window=100, reserve=60)
except ValueError:
    pass
else:
    raise AssertionError("expected ValueError")
```

Complexity: O(n) over the messages, plus the cost of measuring each one.

#### Follow-ups

- **What do you do with the dropped messages?** Summarise them into a short "conversation so far" note, or store them and
  retrieve the relevant ones (long-term memory), instead of silently losing facts the user gave earlier.
- **Why not use characters directly?** Token counts vary by language and content; in production count with the
  model's own tokenizer.
