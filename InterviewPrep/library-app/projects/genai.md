---
title: "Grounded: a RAG assistant with citations, guardrails and an evaluation harness"
summary: A question-answering assistant over public policy documents that retrieves with hybrid search, answers only from cited sources, refuses when the documents don't say, uses an approval-gated agent tool, and proves its quality with an automated evaluation suite in CI.
time: 4–5 days of evenings
---

## What you will build

Grounded answers questions over a set of public documents, for example public health-plan policy PDFs, an open-source project's documentation, or government guidance. Every answer cites the passages it used, and the assistant says "the documents don't cover this" instead of guessing.

- Ingestion: parse PDFs and HTML, chunk with overlap, embed, and store chunks with metadata in PostgreSQL with `pgvector`, plus a full-text index for keyword search.
- Retrieval: hybrid search (vector similarity + PostgreSQL full-text), fused with reciprocal rank fusion, then reranking of the top candidates.
- Generation: the Claude API with structured output: the answer, a list of citations (chunk ids with quoted spans), and a confidence flag. Citations are validated: every quoted span must exist in the cited chunk.
- Agent mode (LangGraph): a small graph that can search, read a chunk, and draft a "policy question ticket" tool call that pauses for human approval before it is filed (`interrupt` + resume).
- Evaluation: a golden set of 40 questions with expected sources and answer points, measuring retrieval recall@k, citation validity, answer faithfulness (LLM-as-judge with a rubric) and refusal correctness, run in CI on every change.
- A minimal web UI (or the FastAPI `/docs` page) that streams the answer with its sources.

## What it proves

- RAG done properly: chunking choices, hybrid retrieval, reranking, metadata filters, grounding and citations
- LLM application engineering: structured outputs, validation and repair loops, streaming, retries and rate limits, cost tracking
- Agents: a LangGraph state graph, tool use with an approval checkpoint (human in the loop)
- Evaluation as engineering: a versioned golden set, retrieval and answer metrics, regression gates in CI
- Safety: refusal when unsupported, prompt-injection-aware handling of retrieved text, no secrets in prompts
- Keywords: Generative AI, LLM, RAG, vector search, pgvector, LangGraph, agents, prompt engineering, evaluation, FastAPI, Claude API

## Architecture

```text
docs/ (PDF, HTML) ──► ingest.py: parse → chunk (size, overlap) → embed → PostgreSQL
                                                     chunks(id, doc, section, text, embedding vector, tsv)
question ──► FastAPI /ask ──► retrieve: vector top-k ┐
                                       keyword top-k ├─► RRF fusion ─► rerank ─► top 6 chunks
                              generate: Claude, structured output {answer, citations[], confident}
                              validate citations (quoted span ∈ chunk) ─► stream answer + sources
agent mode: LangGraph  search → read → draft_ticket ──interrupt──► human approves ──► file ticket
evals/: golden.jsonl ─► run_evals.py ─► recall@k, citation validity, faithfulness, refusals ─► CI gate
```

## Milestones

### Milestone 1: ingestion and storage

- Choose 30–100 public documents and record their source and license.
- Parse, chunk (try two strategies and keep notes), embed, and load into PostgreSQL with `pgvector` and a `tsvector` column with a GIN index.
- Develop against your local PostgreSQL (install the pgvector extension with Homebrew); Docker Compose for readers.

Done when: `make ingest` is idempotent (re-running updates changed documents only) and chunk counts are in the README.

### Milestone 2: retrieval and its evaluation first

- Vector search, keyword search, reciprocal rank fusion, then a reranker.
- Write the golden set now (questions, expected source chunks, key answer points), and measure recall@5 for each retrieval variant before writing any prompts.

Done when: a table shows recall@5 for vector-only, keyword-only and hybrid + rerank.

### Milestone 3: grounded generation with citations

- Claude API call with a system prompt that requires answering only from the supplied chunks, with structured output (`answer`, `citations`, `confident`).
- Validate citations; if validation fails, retry once with the error, then fall back to "the documents don't cover this".
- Stream the answer to the client; log tokens and cost per request.

Done when: the eval suite reports citation validity and refusal correctness, and unsupported questions are refused.

### Milestone 4: agent mode with human approval

- A LangGraph `StateGraph` with search and read tools and a `draft_ticket` tool that calls `interrupt` for approval; resume with the reviewer's decision using a checkpointer.
- Guardrails: a step budget, an allow-list of tools, and retrieved text treated as data, never as instructions.

Done when: a test runs the graph, hits the interrupt, approves, and confirms the ticket is filed exactly once.

### Milestone 5: the evaluation gate and polish

- LLM-as-judge for faithfulness with a written rubric, spot-checked by hand on 10 answers.
- GitHub Actions runs the evaluation on a small sample with a cached or mocked model for pull requests, and the full suite on demand; it fails if recall or faithfulness drops below a threshold.

Done when: the README shows the evaluation results table and the CI badge.

## Repository layout

```text
grounded/
├─ grounded/{ingest,chunking,embed,retrieve,rerank,generate,citations}.py
├─ grounded/agent/{graph.py,tools.py}
├─ api/app.py              FastAPI: /ask (streaming), /agent, /healthz
├─ evals/{golden.jsonl,run_evals.py,judge_rubric.md}
├─ ui/                     optional minimal React or HTML page
├─ docs/SOURCES.md         every document, its source and license
├─ tests/
├─ docker-compose.yml, Makefile, .env.example (no keys committed)
└─ .github/workflows/{ci,evals}.yml
```

## Tests and CI

- Unit: chunking boundaries, RRF fusion maths, citation validation, prompt assembly.
- Integration: retrieval against a small fixture corpus in PostgreSQL.
- LLM calls: recorded responses (fixtures) for deterministic tests; real calls only in the on-demand evaluation workflow, with the API key stored as a GitHub secret.
- Agent: graph test with a fake model that triggers the approval interrupt.
- CI: lint, type-check, unit and integration tests on every push; the evaluation suite on demand and nightly.

## README checklist

- What it does and a 30-second demo GIF showing an answer with citations and a refusal
- Architecture diagram
- Evaluation table: recall@5 per retrieval variant, citation validity, faithfulness, refusal accuracy
- Design decisions: chunk size, why hybrid search, why validate citations, why approval before actions
- Cost per question and latency (time to first token)
- Sources and licenses; how to run with your own key
- What you would do next

## Stretch goals

- An MCP server exposing `search_documents` so Claude Desktop or Claude Code can use the corpus
- Query rewriting and multi-hop questions, measured on the golden set
- Per-user document permissions enforced in retrieval (metadata filters), with tests

## Talking about it in an interview

**60-second walkthrough:** "Grounded is a RAG assistant over public policy documents. I built the evaluation set before the prompts, so every retrieval change is measured: hybrid search with reranking took recall@5 from X to Y. Answers come back as structured output with citations, and I validate that each quoted span really exists in the cited chunk; if not, the assistant retries once and otherwise says the documents don't cover it. An agent mode in LangGraph can draft a ticket, but it pauses for human approval before acting, and the whole evaluation suite runs in CI."

- **How do you reduce hallucinations?** Retrieval quality first (measured), answer only from supplied context, structured citations validated in code, and an explicit refusal path.
- **How do you evaluate a RAG system?** Separately: retrieval (recall@k against labelled sources) and generation (faithfulness, citation validity, refusals), with a fixed golden set and regression thresholds.
- **What about prompt injection in documents?** Retrieved text goes in clearly delimited data blocks, tools are allow-listed, actions need approval, and the model never sees secrets.

## LinkedIn post template

> I built Grounded, a RAG assistant that answers only from cited sources and says so when the documents don't cover a question.
> The part I'm proudest of is the evaluation harness: a golden set that measures retrieval recall, citation validity and faithfulness on every change.
> Hybrid search in PostgreSQL + pgvector, the Claude API with structured output, and a LangGraph agent with human approval: <repo link> #GenerativeAI #RAG #LLM

## Resume bullet

Built Grounded, a RAG assistant with hybrid pgvector and full-text retrieval, validated citations, refusal on unsupported questions, a LangGraph agent with human approval, and an automated evaluation suite (recall@k, faithfulness) gating CI.
