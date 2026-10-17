---
title: "CitiusTech: your story, project answers and questions to ask"
goal: Tell your story in 90 seconds, walk through your best projects in STAR form, and handle the ML-experience question honestly and confidently.
minutes: 30
---

These answers are built only from the resume you submitted to CitiusTech. Read each one aloud twice, then say it in your own words. Do not memorise it word for word: it should sound like you talking. Where an answer needs a personal example the resume does not cover (a disagreement, a mistake), the card gives you the structure, and you fill it with a real story of your own. Never invent one.

## The one thing to get across

You are a **senior full-stack engineer who has spent most of nearly twenty years building healthcare systems**, and whose last two years have been **putting AI into production healthcare workflows** with Python and FastAPI. Python, React and healthcare are the three mandatory skills, and you have all three in real production work. Come back to this whenever an answer drifts.

## STAR, in one breath

- **Situation:** the context in one sentence (client, system, problem).
- **Task:** what you were responsible for.
- **Action:** what *you* did. Use "I", name the technology, explain one decision and its trade-off.
- **Result:** what changed. Use a number only if it is on your resume (99.99% uptime, ~24 OrderingStore apps plus 10 more, Dev/SIT/UAT releases); otherwise describe the outcome plainly.

## Interview questions

### Tell me about yourself. {core}

"I'm a senior full-stack engineer with nearly twenty years of experience, most of it building healthcare systems. Most recently, at Quantiphi, I was lead consultant on the LDH Medicaid Document AI platform on GCP. It had a Python and FastAPI backend that ingests Medicaid documents such as MAGI and non-MAGI forms and paystubs. AI extracts the fields, Pydantic schemas validate them as a quality gate, human reviewers check and correct them, and the results go to downstream systems. Before that, at Medidata, I worked on myMedidata, the patient-facing clinical-trial platform. I used React, Redux and TypeScript on the front end and Python and Rails APIs behind it, and I helped reduce initial load time with lazy loading. Before that I spent thirteen years at Cognizant as a technical lead on payer systems for Molina Healthcare. That covered claims, appeals and grievances, prior authorization and utilization management, with .NET APIs at 99.99% uptime. Today, at The Dot Corp, I work on fulfilment and healthcare logistics, including Labcorp workflows, React applications and AKS deployments. This role brings together exactly what I enjoy most: Python, React and healthcare, with AI in production."

**Tips:** keep it to about 90 seconds. End on why this role, so the interviewer's next question is about your strengths. Give the Document AI project the most time: it is the closest match to the job description.

### Walk me through the LDH Medicaid Document AI project. {core}

**Situation:** a state Medicaid programme needed to process large volumes of eligibility documents (MAGI and non-MAGI forms, paystubs) that staff were handling by hand.
**Task:** as lead consultant, I engineered the full-stack Human-in-the-Loop platform: the Python/FastAPI backend, the Angular SSR review front end, and the deployment pipeline.
**Action:** describe the flow:

1. Documents land in Cloud Storage, and event-driven ingestion picks them up.
2. AI extraction pulls out the fields.
3. **Pydantic schemas** enforce a data contract on the extracted fields. This is the quality gate *before* human review: problems such as wrong types or missing required values are caught by the schema, not left for a reviewer to spot by eye.
4. Reviewers see the document through **GCS signed URLs**, so there is no public bucket access. They sign in with **SAML** (Passport.js), and they correct and approve.
5. Approved data is submitted to **external APIs**.
6. Everything runs in **Docker** containers, pushed to **Artifact Registry** and deployed to **Cloud Run** through Dev, SIT and UAT.

I also built **agentic AI workflows** with tool-use boundaries, validation loops and HITL checkpoints, so the AI never acts outside what it is allowed to do.
**Result:** a production-ready pipeline where AI does the bulk extraction, a schema gate checks every extraction before reviewers see it, humans review and correct with the document beside the data, and the data contract keeps bad data out of downstream systems.

**Likely follow-ups:** what the human reviewer sees (the document beside the extracted fields, so they can correct them), why Pydantic (declarative, fast, clear error messages, one schema shared between validation and the API contract), how you would measure quality (field-level accuracy against reviewer corrections, the share of documents needing review, time per review).

### How did you make sure the AI-extracted data was correct? {core}

"Two layers. First, I treated the model's output as untrusted input: every extracted document went through Pydantic schemas that enforced the data contract, meaning required fields, types and formats, before it reached human review. Second, human reviewers checked and corrected the data against the document itself before anything was submitted to the external APIs. The schema gate catches the mechanical errors so reviewers can concentrate on judgement, and it makes quality measurable. Validation failures and reviewer corrections show where extraction is weak, which is exactly the signal you would use to improve a model or a prompt."

This answer links your GenAI work to the job description's "evaluate and optimise models" language. See [Agents, tools and guardrails](#/agents) and [Type hints and Pydantic](#/py-typing-pydantic).

### Have you built and trained machine learning models yourself? {core}

Answer honestly, then bridge to your strengths. Do not bluff: a follow-up question will expose it.

"My production AI work has been applied AI: taking model and LLM output and building reliable systems around it. That means extraction pipelines, schema validation, human-in-the-loop review, agentic workflows, and deploying all of it on GCP and Azure. I haven't owned training a classical model end to end in production. I do know the lifecycle: splitting data without leakage, cross-validation, choosing metrics like precision and recall for an imbalanced healthcare problem, feature engineering, and putting a model behind a FastAPI endpoint with monitoring for drift. I've been building that hands-on, including IBM's Python for Data Science, AI and Development certificate. In practice, much of the risk in healthcare ML sits around the model: data quality, evaluation, PHI handling and safe deployment. That is where I've done real production work."

Then be ready for a fundamentals question. Review the must-know cards in [ML fundamentals](#/ml-fundamentals), [Evaluating models](#/ml-metrics) and [Feature engineering](#/ml-features).

### Tell me about your healthcare experience. {core}

"Most of my career. At Cognizant I spent thirteen years on payer and provider systems for Molina Healthcare, TMG Health and MedData. That covered claims, appeals and grievances, prior authorization, care management and utilization management, across Medicaid, Medicare and Marketplace lines of business. I integrated Availity's multi-payer appeals portal with Molina, so providers could submit and track claim appeals. I built utilization-management workflows for prior authorization, case management, pharmacy and behavioural health. And on Pursuit, a clinical data platform, we generated state-compliant PDFs and sent them securely via RightFax. Since then: clinical trials at Medidata, Medicaid eligibility documents at Quantiphi, and Labcorp fulfilment at The Dot Corp. So I'm used to PHI, HIPAA constraints, audit requirements and the business rules behind the data."

Depth for follow-ups: [Payer workflows](#/payer-workflows), [HIPAA](#/hipaa), [HL7 and FHIR](#/fhir-hl7).

### Tell me about your React experience. {core}

"About seven years across several products. At Medidata I worked on myMedidata, the patient-facing clinical-trial platform, with React, Redux, Hooks and TypeScript. I worked with the team on performance, using lazy loading and code splitting so that patients did not download the whole app up front, and cleaner state management. That reduced initial load times. At The Dot Corp I added role-based admin features to a React Labels Web application, used to manage carrier accounts and credentials for FedEx, USPS, UPS and Endicia, and shipped them to production. I've also worked on the React-based LINE platform, which consolidates many customer-specific legacy storefronts into one multi-tenant architecture. Day to day I use React 19 with TypeScript, TanStack Query for server state, and Redux or Zustand when the client state needs it."

### Tell me about a large migration or modernisation you worked on. {core}

Two options; pick by the interviewer's interest.

- **FedEx SOAP to REST (The Dot Corp):** about 24 legacy OrderingStore applications plus 10 more depended on FedEx's SOAP APIs. I inventoried the applications, analysed dependencies, implemented the REST integration and validated each application. Talk about the risk: shipping and labelling cannot break. That is why you inventory and validate application by application instead of doing a big-bang switch.
- **Monolith to microservices on Azure (Cognizant):** I spearheaded moving monolithic healthcare applications to cloud-based microservices on Azure, which significantly reduced infrastructure costs. Talk about how you split services along business capabilities, kept the APIs stable for consumers, and kept 99.99% uptime through the change.

### Describe a production incident you were involved in.

The resume fact: at The Dot Corp you assisted with production support and investigation of OrderingStore service disruptions during an **Azure regional outage**. Structure: what users saw, how you investigated (logs, health checks, which dependencies were regional), what you did to restore or work around it, and what you would change. For example: multi-region failover for critical paths, better alerting, and runbooks. Use only details you actually remember, and keep the focus on calm, systematic diagnosis and on what was learned.

### How do you use AI tools in your own engineering work?

"Every day, with discipline. I use Claude Code for codebase analysis, understanding legacy code, implementation, refactoring and code review. On the Document AI platform it sped up FastAPI scaffolding, Angular SSR components and Cloud Functions boilerplate. The rule I hold myself to is that I review and validate every change myself, just as I would a colleague's pull request. AI makes me faster, but I own the correctness, especially in healthcare where a subtle bug can touch patient data."

### Why CitiusTech, and why this role? {core}

"CitiusTech is focused entirely on healthcare and life sciences technology, and that is where I've spent most of my career. This role combines the three things I'm strongest at, Python, React and healthcare, with AI, which is where my recent work has been. I'm looking for work where domain knowledge matters as much as code, and in healthcare it does. Knowing why an appeal has a deadline, or why PHI cannot appear in a log, changes how you design the system."

Keep it specific to healthcare plus AI. Do not quote company facts you are not sure of.

**Company background to check before you quote it** (from the company's own descriptions, so confirm on their site): healthcare and life-sciences technology only; clients are payers, providers, medtech and life-sciences companies, mostly in the US; services span digital engineering, data and analytics, cloud, HL7/FHIR interoperability, automation, and AI/GenAI. Before the call, look at their newsroom for a recent GenAI or platform announcement and mention it by name.

### Tell me about a disagreement with a teammate or stakeholder.

Use a real example of your own. The structure that works:

1. The disagreement, stated neutrally (for example, a design choice or a deadline versus quality).
2. How you understood the other side's goal first.
3. The data or prototype you used to decide, rather than opinions.
4. The outcome, and the relationship afterwards.

End with what you do differently now. Avoid stories where the other person is simply wrong.

### Tell me about a mistake you made.

Use a real example. Pick a technical mistake with a clear lesson, for example a missed edge case or an assumption about an integration. Then cover how you found it, how you fixed it, and the safeguard you added afterwards (a test, a validation, a checklist). Keep the mistake small and the learning concrete.

### How do you mentor or lead other engineers?

At Cognizant you mentored and coached engineers, improving team velocity and accelerating onboarding, and you led large-scale production deployments. Talk about practical habits you actually used: code reviews that teach rather than just correct, pairing on the tricky parts, and onboarding notes. Add delegation with clear ownership.

### What are your rate and availability?

"The rate we confirmed in my Right to Represent, on W2, and I can start immediately." Give the same figure you already sent the recruiter. Do not reopen the rate in the technical round.

## Questions to ask them

Pick three or four. The first one matters most for this role.

- **How is the work split between model building and full-stack Python and React?** Who owns training, and who owns the application around the models?
- What does the team look like: data scientists, ML engineers, front-end engineers? Who would I work with day to day?
- Who is the end client, and which part of healthcare is it (payer, provider, life sciences)?
- What does the current ML stack look like: cloud platform, MLOps tooling, how models reach production?
- How do you handle PHI in development and testing environments?
- What would success look like in the first 90 days?
- What is the next step in the process, and when can I expect to hear back?
