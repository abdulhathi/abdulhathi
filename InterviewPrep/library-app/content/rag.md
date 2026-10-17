---
title: Retrieval-augmented generation
goal: Design, build, evaluate and debug a RAG system end to end, including chunking, hybrid search, reranking and access control over sensitive documents, and contrast it with a Document AI pipeline.
minutes: 50
---

Retrieval-augmented generation (RAG) is the most common GenAI architecture in enterprise and healthcare work: the model
answers from **your** documents, retrieved at question time, instead of from its memory. Interviewers ask about it
because it touches everything: data processing, search, LLMs, evaluation and security.

A strong answer is never "embed the documents and call the LLM". It covers parsing and chunking, hybrid retrieval and
reranking, grounding and citations, how you measure retrieval and answer quality separately, and how access control
works when documents contain personal or health data (PHI).

## The pipeline

RAG has an **offline ingestion** path and an **online query** path.

```text
INGEST (batch or event-driven)
  documents ─► parse / OCR ─► clean ─► chunk ─► embed ─► vector index (+ keyword index, + metadata)

QUERY (per request)
  question ─► (rewrite) ─► embed ─► retrieve top 50 (vector + BM25, filtered by user access)
           ─► rerank to top 5 ─► build prompt with numbered sources ─► LLM ─► answer with citations
           ─► validate citations ─► log for evaluation
```

Every arrow is a place where quality is lost. Most bad RAG answers come from bad retrieval (the right passage never
reached the model), not from the LLM.

## Chunking

Embedding models and prompts have size limits, and a precise chunk retrieves better than a whole document. Common
strategies:

| Strategy | How it works | When to use it |
|---|---|---|
| Fixed size + overlap | Windows of N tokens, overlapping by about 10–20% | Simple baseline, uniform text |
| Recursive | Split on paragraphs, then sentences, then words, until chunks fit | Good default for prose |
| Structure-aware | Split on headings, sections, table boundaries; keep the heading path as metadata | Policies, manuals, contracts |
| Semantic | Start a new chunk where embedding similarity between sentences drops | Long, topic-shifting text |
| Small-to-big (parent–child) | Retrieve small chunks for precision, send their parent section for context | When answers need surrounding context |

Overlap prevents a fact from being cut in half at a boundary. Always store metadata with each chunk: document ID,
title, section, page, effective date, tenant and access labels.

```python
def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    """Fixed-size chunks of `size` words; consecutive chunks share `overlap` words."""
    if not 0 <= overlap < size:
        raise ValueError("need 0 <= overlap < size")
    words = text.split()
    step = size - overlap
    chunks = []
    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start : start + size]))
        if start + size >= len(words):
            break
    return chunks

text = " ".join(f"w{i}" for i in range(10))
chunks = chunk_words(text, size=4, overlap=1)
assert chunks == ["w0 w1 w2 w3", "w3 w4 w5 w6", "w6 w7 w8 w9"]
assert chunk_words("", 4, 1) == []
assert chunk_words("one two", 4, 1) == ["one two"]
```

## Embeddings and vector stores

Pick an embedding model by measuring retrieval quality **on your own queries** (public leaderboards are only a starting
point), then weigh dimension size (storage and speed), maximum input length, language support, cost and whether it
can run inside your compliance boundary.

| Store | What it is | Choose it when |
|---|---|---|
| pgvector | PostgreSQL extension with HNSW and IVFFlat indexes | You already run Postgres and want vectors next to relational data, with SQL filters and transactions |
| FAISS | Meta's in-process similarity search library | You want a fast local index inside your service, or batch jobs; no server, you manage persistence |
| Chroma | Open-source embedding database | Prototypes and small apps |
| Pinecone | Fully managed vector database | You want zero operations and elastic scale |
| Vector Search (formerly Vertex AI Vector Search) | Google Cloud managed ANN service, now part of the Gemini Enterprise Agent Platform | You are on GCP at large scale |
| Azure AI Search | Managed search with keyword, vector and hybrid queries plus a semantic ranker | You are on Azure and want hybrid search out of the box |

```sql norun
-- PostgreSQL with pgvector (not runnable in the lab's SQLite checker).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  doc_id text NOT NULL,
  tenant_id text NOT NULL,
  content text NOT NULL,
  embedding vector(1536)
);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

-- <=> is cosine distance; filter by tenant before ranking.
SELECT doc_id, content, 1 - (embedding <=> $1) AS similarity
FROM chunks
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 5;
```

## A small retriever you can run

TF-IDF is a keyword-weighting method, not a neural embedding, but the retrieval mechanics are the same: vectorise the
documents once, vectorise the query, rank by cosine similarity.

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

docs = [
    "Prior authorization is required for MRI and CT scans ordered in an outpatient setting.",
    "Members can file an appeal of a denied claim within the plan's appeal window.",
    "Paystubs must show the employee name, pay date and gross pay for income verification.",
    "Emergency room visits do not require prior authorization.",
]

vectorizer = TfidfVectorizer(stop_words="english")
doc_matrix = vectorizer.fit_transform(docs)

def retrieve(query: str, k: int = 2) -> list[int]:
    sims = cosine_similarity(vectorizer.transform([query]), doc_matrix)[0]
    return sims.argsort()[::-1][:k].tolist()

assert retrieve("Do outpatient MRI scans need prior authorization?")[0] == 0
assert retrieve("What does a paystub need for income verification?")[0] == 2
assert retrieve("How do I appeal a denied claim?")[0] == 1
```

## Hybrid search and reranking

Dense vectors are good at meaning ("pre-approval" matches "prior authorization"). Keyword search (BM25) is good at
exact terms: member IDs, drug names, CPT codes, form numbers. **Hybrid search** runs both and merges the lists, often with
**reciprocal rank fusion**, which only needs ranks, so you never have to compare incompatible scores.

```python
def rrf(rankings: list[list[str]], k: int = 60) -> list[str]:
    """Reciprocal rank fusion: score(d) = sum over lists of 1 / (k + rank of d)."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=lambda d: (-scores[d], d))

vector_hits = ["policy-7", "policy-2", "policy-9"]
keyword_hits = ["policy-2", "policy-4", "policy-7"]
fused = rrf([vector_hits, keyword_hits])
assert fused[:2] == ["policy-2", "policy-7"]  # found by both lists, so they rise to the top
assert set(fused) == {"policy-2", "policy-4", "policy-7", "policy-9"}
```

A **reranker** (a cross-encoder) then scores each (question, passage) pair together. It is far more accurate than
comparing two separately computed embeddings, but too slow to run over the whole corpus. So you retrieve broadly (top
50 by hybrid search) and rerank narrowly (keep the top 3–5).

## Evaluating RAG

Evaluate **retrieval** and **generation** separately, or you cannot tell which one failed.

| Layer | Metric | Question it answers |
|---|---|---|
| Retrieval | Recall@k | Did the right passage appear in the top k? |
| Retrieval | MRR, nDCG | How high up was it? |
| Generation | Faithfulness (groundedness) | Is every claim in the answer supported by the retrieved context? |
| Generation | Answer relevance | Does it actually answer the question? |
| Generation | Context precision / recall | Was the context mostly relevant, and did it contain what was needed? |
| Production | Citation click-through, thumbs down, escalations, latency, cost | Is it helping real users? |

RAGAS is a popular library that implements faithfulness, answer relevancy, context precision and context recall,
using an LLM as the judge. Start with a hand-labelled set of 50–200 real questions with their correct source passages.

```python
def recall_at_k(results: list[list[str]], relevant: list[set[str]], k: int) -> float:
    hits = sum(1 for got, want in zip(results, relevant) if want & set(got[:k]))
    return hits / len(results)

def mrr(results: list[list[str]], relevant: list[set[str]]) -> float:
    total = 0.0
    for got, want in zip(results, relevant):
        total += next((1 / rank for rank, doc in enumerate(got, start=1) if doc in want), 0.0)
    return total / len(results)

results = [["d3", "d1", "d7"], ["d2", "d9", "d4"], ["d8", "d6", "d5"]]
relevant = [{"d1"}, {"d2"}, {"d0"}]
assert recall_at_k(results, relevant, k=1) == 1 / 3
assert recall_at_k(results, relevant, k=3) == 2 / 3
assert abs(mrr(results, relevant) - (1 / 2 + 1 + 0) / 3) < 1e-12
```

## RAG over PHI

When documents contain PHI or are restricted (member records, case notes, provider contracts), RAG must enforce the
same access rules as the source systems:

- **Filter before ranking.** Apply tenant, role and document-level permissions as a filter inside the retrieval query,
  so restricted chunks never reach the reranker or the prompt. Filtering after generation is too late.
- **Carry permissions as chunk metadata** at ingestion, and re-sync them when source permissions change.
- **Minimum necessary:** retrieve and send only what the question needs.
- Keep PHI out of logs and traces, cache per user (never share cached answers across users), encrypt the index, and
  run the embedding model and LLM under a BAA or inside your own environment.
- Treat retrieved text as **untrusted data**: a document can contain instructions ("ignore previous rules"), which is
  indirect prompt injection.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Chunk:
    id: str
    tenant: str
    allowed_roles: frozenset[str]
    text: str

def visible_chunks(chunks: list[Chunk], tenant: str, roles: set[str]) -> list[Chunk]:
    """Apply access control BEFORE similarity ranking, never after generation."""
    return [c for c in chunks if c.tenant == tenant and c.allowed_roles & roles]

store = [
    Chunk("c1", "plan-a", frozenset({"care_manager"}), "Member 123 care plan ..."),
    Chunk("c2", "plan-a", frozenset({"care_manager", "analyst"}), "UM policy for MRI ..."),
    Chunk("c3", "plan-b", frozenset({"care_manager"}), "Another plan's member notes ..."),
]
assert [c.id for c in visible_chunks(store, "plan-a", {"analyst"})] == ["c2"]
assert [c.id for c in visible_chunks(store, "plan-a", {"care_manager"})] == ["c1", "c2"]
assert visible_chunks(store, "plan-c", {"care_manager"}) == []  # no cross-tenant leakage
```

## Document AI is not RAG

They are often confused. **RAG** answers questions *from* a document collection. **Document AI** turns individual
documents *into* structured data: OCR and layout analysis, document classification, field extraction, validation,
human review and submission to a downstream system.

```text
upload ─► OCR + layout ─► classify (MAGI form? paystub?) ─► extract fields ─► validate (schema + rules)
       ─► low confidence or invalid? ─► human review queue ─► corrected data ─► submit to downstream API
```

**Your angle:** the LDH Medicaid Document AI platform at Quantiphi was this second kind: secure ingestion of MAGI and
Non-MAGI forms and paystubs, AI-driven extraction, a Pydantic schema-validation gate on the extracted fields, a
human-in-the-loop review and editing UI, and integration with external APIs for final submission. If they ask "have
you built RAG?", be precise: explain what you built, then show you know how RAG differs and how you would build it.

## Interview questions

### What is RAG, and why would you use it? {core}

RAG retrieves relevant passages from your own data at question time and puts them in the prompt, so the model answers
from that context instead of from memory. It gives up-to-date and private knowledge without retraining, lets the
answer cite its sources, cuts hallucinations, and lets you enforce access control per user, because you decide what
gets retrieved.

It is the default choice when the knowledge changes (policies, formularies, member data) or is private. Fine-tuning
is for changing behaviour or format, not for adding facts.

### Walk me through a RAG pipeline end to end. {core}

Offline: load documents, parse them (OCR for scans, table extraction), clean them, split them into chunks with
metadata, embed the chunks, and write them to a vector index plus a keyword index. Online: take the question,
optionally rewrite it, embed it, retrieve candidates with hybrid search filtered by the user's permissions, rerank to
the best few, build a prompt with numbered sources and instructions to answer only from them, generate, check the
citations, and log everything for evaluation.

Then I would add an evaluation set and monitoring, because RAG quality is set by retrieval and you need to see where it
fails.

### How do you chunk documents? {core}

I start with recursive or structure-aware chunking: split on headings and paragraphs, keep chunks of a few hundred
tokens with 10–20% overlap, and store the section title, page and document metadata with each chunk. Tables are kept
whole or converted to text rows with their headers, because a table split across chunks is useless.

Then I tune it on an evaluation set rather than guessing. Chunks that are too small lose context; chunks that are too
big dilute the embedding and waste prompt space. Small-to-big retrieval (match small chunks, send the parent section)
gets precision and context together.

### How do you choose an embedding model?

Evaluate candidates on recall@k over a labelled set of your own queries, because general benchmarks do not reflect
domain vocabulary like CPT codes or Medicaid terms. Then weigh dimensions (storage and search cost), maximum input
length, multilingual needs, price and latency, and deployment: whether it is available under a BAA or can run in your
VPC. Remember that changing the model means re-embedding the whole corpus, so version the embeddings.

### Which vector store would you pick? {core}

It depends on scale and what you already run. If the team runs PostgreSQL, **pgvector** is my default: vectors live next
to relational data, you get SQL filters, joins, transactions and backups you already know, and HNSW indexes handle
millions of vectors. **FAISS** for an in-process index or batch jobs. A managed service (Pinecone, Google Cloud's Vector
Search, Azure AI Search) when scale or operational effort justifies it, or when you want built-in hybrid search and
ranking, as in Azure AI Search.

The deciding factors: number of vectors, query rate, filtering needs, multi-tenancy, hybrid search support, cost, and
whether it runs inside your compliance boundary.

### How does approximate nearest-neighbour search work? {deep}

Exact search compares the query with every vector, O(n) per query, which is too slow at tens of millions of vectors.
ANN indexes trade a little recall for big speed-ups. **HNSW** builds a layered graph where each vector links to near
neighbours; a search starts at a sparse top layer and greedily walks closer, dropping to denser layers. **IVF**
clusters vectors and only searches the closest clusters. **Product quantisation** compresses vectors to save memory.

You tune parameters such as HNSW's `ef_search` or IVF's number of probed lists to balance recall against latency, and
you measure recall against exact search on a sample.

### What is hybrid search, and why use it? {core}

Hybrid search combines dense vector search (meaning) with sparse keyword search such as BM25 (exact terms), then
merges the results, commonly with reciprocal rank fusion. Vectors find "pre-approval" for a "prior authorization"
question; keywords find exact identifiers like a member ID, drug name, CPT code or form number that embeddings blur. In
healthcare text, full of codes and abbreviations, hybrid search is usually clearly better than vectors alone.

### What does a reranker do?

A reranker is usually a cross-encoder that reads the question and a passage **together** and outputs a relevance
score. Because it sees both at once, it is much more accurate than comparing two separately computed embeddings, but it
is slow, so it cannot scan the whole corpus. The standard pattern is retrieve broadly (top 50 from hybrid search), then
rerank and keep the top 3–5 for the prompt. It is often the single biggest quality win in a RAG system.

### How do you use metadata filtering?

Store structured attributes with each chunk (tenant, document type, line of business, state, effective date, access
labels) and apply them as filters inside the retrieval query. That enforces security (only documents the user may
see), improves relevance (only Medicaid policies for a Medicaid question; only the version in effect), and makes search
faster. Filters must run before or during the vector search; filtering a top 5 afterwards can leave you with nothing.

### What is query rewriting? {deep}

Users ask short, vague or multi-part questions. Rewriting improves what you search with: **expanding** acronyms and
synonyms, **multi-query** (have the LLM produce several phrasings and merge the results), **decomposition** (split a
compound question into sub-questions), and **HyDE** (have the LLM write a hypothetical answer and search with its
embedding, since answers resemble documents more than questions do). In a conversation, you also rewrite the follow-up
"what about for children?" into a standalone question using the chat history.

### How do you evaluate a RAG system? {core}

Separately for each layer. For retrieval: a labelled set of real questions with their correct passages, measured with
recall@k and MRR. For generation: faithfulness (every claim supported by the context), answer relevance and
correctness, scored by humans or an LLM judge that has been checked against humans; RAGAS packages these metrics. In
production: user feedback, escalation rate, citation clicks, latency and cost.

I run the offline set on every change to chunking, the embedding model, prompts or the LLM, like a regression test
suite, so improvements are measured, not guessed.

### Your RAG system gives wrong answers. How do you debug it? {core}

Trace one failing question through the pipeline. First check **retrieval**: was the correct passage in the top k? If
not, is it in the index at all (parsing or ingestion failure), was it split badly by chunking, filtered out by
metadata, or missed by the search (try hybrid search, query rewriting, a different embedding model)? If the passage
was retrieved but the answer is still wrong, it is a **generation** problem: the passage was ranked too low or buried,
the prompt does not insist on using the context, there is conflicting or outdated content, or the model needs better
instructions.

Then add the case to the evaluation set so it stays fixed.

### What is "lost in the middle", and how many chunks should you send? {deep}

Research in 2023 ("Lost in the Middle") showed that models use information at the start and end of a long context
more reliably than information in the middle. So more chunks are not automatically better: they add noise, cost and
latency. Send a small number of high-quality chunks after reranking (often 3–8), put the most relevant first, remove
duplicates, and tune k on your evaluation set.

### How do you handle tables, scanned PDFs and forms?

Parsing quality decides RAG quality. For scanned documents, use OCR with layout analysis so reading order, columns and
key-value pairs survive. Extract tables as structured data and keep each table, or each row with its headers, as one
chunk. For forms, extract fields into structured records instead of free text, then you can filter and query them
directly.

**Your angle:** the LDH Medicaid platform processed MAGI and Non-MAGI forms and paystubs. That kind of input needs
extraction and validation, not just chunking: the extracted fields went through a Pydantic validation gate and human
review before submission.

### How do you keep the index fresh?

Make ingestion incremental and event-driven: when a document is added, changed or deleted (a storage event, a CDC
stream, or a scheduled sync), re-parse and re-embed only that document, replace its chunks, and delete the chunks of
removed documents. Store a content hash to skip unchanged files, keep effective dates and versions as metadata, and
monitor ingestion lag and failures. When you change the embedding model, rebuild into a new index and switch over once
it is complete.

### How do you build RAG over PHI safely? {core}

Same rules as any PHI system, plus retrieval-specific ones. Enforce access control **at retrieval time** with tenant,
role and document-level filters, so the model never sees what the user is not allowed to see. Carry permissions as
chunk metadata and keep them in sync with the source. Apply minimum necessary, encrypt the index and the stores, keep
PHI out of logs and traces, never share cached answers across users, and run embeddings and the LLM under a BAA or in
your own environment. Treat retrieved documents as untrusted input because of indirect prompt injection, and audit who
asked what and which documents were returned.

### How do you make the answer cite its sources?

Number the passages in the prompt (`[1]`, `[2]` with document ID and section), instruct the model to cite the numbers
after every claim and to say it cannot answer when the sources do not support one. Then **verify** in code: every cited
number must exist in what you sent, and you can check that cited passages actually support the sentence, with an
overlap check or an LLM judge. Show the user clickable sources; that builds trust and lets reviewers check quickly.

### With million-token context windows, do we still need RAG? {deep}

Usually yes. Long context helps when a task needs one large document read in full, but stuffing the whole corpus into
every request is expensive and slow, it does not scale beyond the window, the model attends less reliably to content
in the middle, and you lose per-user access control and clear citations. In practice they combine: retrieve the
relevant documents, then use a long window to include whole sections instead of tiny chunks.

### What are agentic RAG and GraphRAG? {deep}

**Agentic RAG** lets the model decide when and how to retrieve: rewrite the query, search several sources, judge whether
the results are enough, and search again before answering. It handles complex, multi-hop questions at the cost of more
latency and tokens. **GraphRAG** builds a knowledge graph of entities and relationships from the corpus, sometimes with
summaries of related groups, so it can answer questions that need connecting facts across many documents ("which
policies reference this drug class?") better than chunk similarity can.

### How is a Document AI pipeline different from RAG? {core}

RAG answers questions from a collection of documents; Document AI turns each document into validated structured data.
Document AI is OCR and layout, classification, field extraction, validation, human review and submission downstream.
Its success metric is field-level accuracy and straight-through processing rate, not answer quality.

**Your angle:** that is the platform you engineered for LDH Medicaid at Quantiphi: extracted fields from MAGI and Non-MAGI
forms and paystubs were validated against Pydantic schemas, reviewed and corrected by humans in the HITL UI, then
submitted to external APIs. Many of the same skills carry over to RAG: parsing, schema validation and evaluation with
human feedback.

## Coding problems

### Chunk text with overlap {easy core}

Write `chunk_sentences(text, max_chars)` that splits text into sentences (on `.`, `?` or `!` followed by whitespace) and
packs whole sentences into chunks of at most `max_chars` characters (sentences joined by one space). Each new chunk
should **start with the last sentence of the previous chunk** for overlap. A single sentence longer than `max_chars`
becomes a chunk on its own.

Example: with `max_chars = 20`, `"A b c. D e f. G h i. J k l."` → `["A b c. D e f. G h i.", "G h i. J k l."]`.

#### Hints

1. Split with a regular expression on whitespace that follows sentence-ending punctuation.
2. Keep a list for the current chunk; when adding the next sentence would exceed the limit, close the chunk.
3. Start the next chunk with the last sentence of the closed one, but only if the new sentence still fits after it.

#### Solution

Split into sentences, then greedily pack. When the next sentence does not fit, emit the current chunk and start a new
one that carries the previous chunk's last sentence for overlap, unless carrying it would make the new sentence not
fit. Never split inside a sentence, because a broken sentence embeds poorly.

```python
import re

def chunk_sentences(text: str, max_chars: int) -> list[str]:
    sentences = [s for s in re.split(r"(?<=[.?!])\s+", text.strip()) if s]
    chunks: list[str] = []
    current: list[str] = []
    for sentence in sentences:
        candidate = " ".join(current + [sentence])
        if current and len(candidate) > max_chars:
            chunks.append(" ".join(current))
            overlap = current[-1]
            current = [overlap, sentence] if len(overlap) + 1 + len(sentence) <= max_chars else [sentence]
        else:
            current.append(sentence)
    if current:
        chunks.append(" ".join(current))
    return chunks

assert chunk_sentences("A b c. D e f. G h i. J k l.", 20) == ["A b c. D e f. G h i.", "G h i. J k l."]
assert chunk_sentences("", 30) == []
assert chunk_sentences("Short one.", 30) == ["Short one."]
long = "This sentence is definitely longer than twenty characters."
assert chunk_sentences(f"Hi there. {long} Bye now.", 20) == ["Hi there.", long, "Bye now."]
assert all(len(c) <= 30 for c in chunk_sentences("One two. Three four? Five six! Seven eight.", 30))
```

Complexity: O(n) in the length of the text (each sentence is added once; the join for the length check can be replaced
by a running length counter for very long chunks).

#### Follow-ups

- **How would you measure in tokens instead of characters?** Swap `len` for a token counter from the embedding model's
  tokenizer and keep a running total.
- **What about headings?** Split on headings first, then sentences, and store the heading path as metadata on every
  chunk.

### Build a TF-IDF retriever with a relevance threshold {medium core}

Write a class `Retriever` that is built from a list of documents and has `search(query, k, min_score)`, returning up
to `k` `(doc_index, score)` pairs sorted by cosine similarity, highest first, dropping results below `min_score`. If
nothing passes the threshold, return an empty list: the RAG layer should then answer "I could not find this in the
documents" instead of guessing.

#### Hints

1. Fit a `TfidfVectorizer` once in the constructor; transform only the query at search time.
2. `cosine_similarity(query_vec, doc_matrix)[0]` gives one score per document.
3. Sort indices by score descending, then filter by the threshold and slice to k.

#### Solution

Fit once, query many times. TF-IDF vectors are already L2-normalised by default, so cosine similarity is a sparse dot
product. The threshold matters as much as the ranking: returning weak matches is how RAG systems end up answering
from irrelevant context.

```python
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class Retriever:
    def __init__(self, docs: list[str]):
        self.vectorizer = TfidfVectorizer(stop_words="english")
        self.matrix = self.vectorizer.fit_transform(docs)

    def search(self, query: str, k: int = 3, min_score: float = 0.1) -> list[tuple[int, float]]:
        scores = cosine_similarity(self.vectorizer.transform([query]), self.matrix)[0]
        order = np.argsort(-scores, kind="stable")
        return [(int(i), float(scores[i])) for i in order if scores[i] >= min_score][:k]

r = Retriever([
    "Prior authorization is required for outpatient MRI scans.",
    "Claims must be submitted within the timely filing limit.",
    "Paystubs are used to verify income for Medicaid eligibility.",
])
hits = r.search("Is prior authorization needed for an MRI?")
assert hits[0][0] == 0 and hits[0][1] > 0.3
assert r.search("verify income for Medicaid")[0][0] == 2
assert r.search("weather forecast for tomorrow") == []  # no overlap: answer "not found", do not guess
assert len(r.search("claims authorization income", k=2, min_score=0.0)) == 2
```

Complexity: building is O(total words). Each search is O(n) over documents (sparse dot products) plus O(n log n) for
the sort.

#### Follow-ups

- **How would you go from this to production?** Replace TF-IDF with an embedding model plus BM25 (hybrid), store vectors
  in pgvector or a vector database, add metadata filters and a reranker, and tune `k` and the threshold on an
  evaluation set.
- **Why might a fixed threshold be fragile?** Score scales differ between models and queries; calibrate thresholds per
  model on labelled data, or let the reranker's score decide.

### Compute recall@k and MRR {easy}

Given, for each test question, the ranked list of retrieved document IDs and the set of relevant IDs, compute
**recall@k** (the fraction of questions with at least one relevant document in the top k) and **MRR** (the mean of
1/rank of the first relevant document, 0 if none was retrieved).

Example: results `[["a","b"], ["c","d"]]`, relevant `[{"b"}, {"x"}]` → recall@1 = 0, recall@2 = 0.5, MRR = (1/2 + 0) / 2 = 0.25.

#### Hints

1. For recall@k, intersect the relevant set with the first k results of each question.
2. For MRR, find the first position (1-based) where the result is relevant.
3. `next(generator, default)` is a neat way to get "the first match or 0".

#### Solution

Both metrics loop over questions once. Recall@k answers "did we find it at all within k", MRR rewards finding it near
the top. Report both: a system can have good recall@10 but poor MRR, which means the reranker or ordering needs work.

```python
def recall_at_k(results: list[list[str]], relevant: list[set[str]], k: int) -> float:
    if not results:
        return 0.0
    return sum(bool(set(got[:k]) & want) for got, want in zip(results, relevant)) / len(results)

def mean_reciprocal_rank(results: list[list[str]], relevant: list[set[str]]) -> float:
    if not results:
        return 0.0
    total = 0.0
    for got, want in zip(results, relevant):
        total += next((1 / rank for rank, doc in enumerate(got, start=1) if doc in want), 0.0)
    return total / len(results)

results = [["a", "b"], ["c", "d"]]
relevant = [{"b"}, {"x"}]
assert recall_at_k(results, relevant, 1) == 0.0
assert recall_at_k(results, relevant, 2) == 0.5
assert mean_reciprocal_rank(results, relevant) == 0.25
assert mean_reciprocal_rank([["a"]], [{"a"}]) == 1.0
assert recall_at_k([], [], 3) == 0.0
```

Complexity: O(q · k) for recall and O(q · n) for MRR, where q is the number of questions and n the list length.

#### Follow-ups

- **What about questions with several relevant documents?** Use precision@k, recall as a fraction of all relevant
  documents found, or nDCG, which rewards placing more relevant documents higher.
- **Where do the labels come from?** Subject-matter experts, logged user clicks, or reviewer feedback; start small (50–200
  questions) and grow it with every production failure.

### Merge keyword and vector results with reciprocal rank fusion {medium}

You have ranked result lists from a BM25 search and a vector search. Their scores are on different scales, so you
cannot add them. Implement reciprocal rank fusion: each document scores `sum(1 / (k + rank))` over the lists it
appears in (rank starts at 1, default `k = 60`). Return document IDs sorted by fused score, breaking ties by ID.

Example: `rrf([["a","b"], ["b","c"]])` → `["b", "a", "c"]` (b appears in both lists).

#### Hints

1. Use a dictionary from document ID to accumulated score.
2. `enumerate(ranking, start=1)` gives 1-based ranks.
3. Sort by negative score, then by ID, for a deterministic order.

#### Solution

RRF only uses positions, so it is robust to incompatible score scales and needs no tuning beyond `k`. A larger `k`
flattens the advantage of the very top ranks. Documents found by both retrievers naturally rise to the top.

```python
def rrf(rankings: list[list[str]], k: int = 60, top: int | None = None) -> list[str]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    fused = sorted(scores, key=lambda d: (-scores[d], d))
    return fused[:top] if top is not None else fused

assert rrf([["a", "b"], ["b", "c"]]) == ["b", "a", "c"]
assert rrf([["x", "y", "z"]]) == ["x", "y", "z"]  # one list: order unchanged
assert rrf([]) == []
assert rrf([["a", "b"], ["b", "a"]]) == ["a", "b"]  # equal scores: tie broken by ID
assert rrf([["a", "b", "c"], ["c", "b", "a"]], top=1) == ["a"]  # first + last edges out second + second
```

Complexity: O(total results) to score plus O(m log m) to sort m unique documents.

#### Follow-ups

- **Why not normalise and add the scores?** Normalised BM25 and cosine scores still behave differently per query, so
  weights are fragile; RRF is a strong, tuning-free baseline. Weighted fusion is an option once you have evaluation
  data to tune it.
- **What comes after fusion?** A cross-encoder reranker over the top 30–50 fused results.
