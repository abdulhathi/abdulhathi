# Interview Lab: CitiusTech Full Stack Python Developer (Python & AI Engineer)

Interview preparation built from the job description (mandatory skills: Python, React, Healthcare; responsibilities:
scalable Python applications, building, training and deploying ML models, data pipelines and feature engineering)
and the resume submitted for the role. The recruiter described the round as 30% coding and 60% technical questions,
or 60% coding with technical questions for the rest.

## Run it

```bash
cd tutorial-app
npm install
npm run dev
```

## What is inside

- **Chapters** in `tutorial-app/content/*.md`, grouped as Core Python, Backend and data, React, Healthcare domain,
  Live coding, Machine learning, Generative AI, and Platform and design. Each has notes, interview questions with a
  model answer to say out loud, and coding problems with layered hints and a tested solution.
- **Mock interview:** a timed round in either format, with technical questions weighted by the JD's skills.
- **Flash-card drill** and **Weak spots:** rate yourself on every card; everything shaky or missed is collected.

## Checks

```bash
cd tutorial-app
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once, for the code check
npm run verify   # type-check, tests, and run every code block in every chapter
```

`npm run check:code` runs each Python block, type-checks each TS/TSX block, and runs each SQL block against SQLite
(checking `-- expect:` results). See `tutorial-app/CONTENT-GUIDE.md` for the chapter format.
