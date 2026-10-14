---
title: HIPAA, PHI and security engineering
goal: Explain what HIPAA requires of an engineer, name the 18 identifiers, and describe how you build PHI-safe APIs, logs, pipelines and LLM features.
minutes: 45
---

CitiusTech builds software for payers, providers, medtech and life-sciences companies, so the interviewer will assume
you can handle protected health information safely. They rarely want the legal detail of the law itself. They want to
hear an engineer who knows what PHI is, the difference between a covered entity and a business associate, what
the Security Rule asks for (access control, audit, integrity, transmission security), and how that becomes code:
encryption, least privilege, audit logs, logs without PHI, de-identified test data, and care with LLMs.

You have worked on Medicaid, Medicare and Marketplace systems at Molina, a clinical-trial platform at Medidata and
a Medicaid Document AI platform at Quantiphi. Lead with that: you have lived these rules, not just read them.

## HIPAA in one page

**HIPAA** (Health Insurance Portability and Accountability Act, 1996). Its *Administrative Simplification* part
created the rules engineers care about:

| Rule | What it covers | Engineer's takeaway |
|---|---|---|
| **Privacy Rule** (45 CFR Part 160 and Part 164 Subparts A and E) | Who may use and disclose PHI and why; patient rights (access, amendment, accounting of disclosures) | Every access needs a purpose: treatment, payment or operations (TPO), or the patient's authorisation. Apply *minimum necessary*. |
| **Security Rule** (Part 164 Subpart C) | Safeguards for **electronic** PHI (ePHI): administrative, physical, technical | Risk analysis, access control, audit controls, integrity, authentication, transmission security. |
| **Breach Notification Rule** (Subpart D, from HITECH 2009) | What to do when unsecured PHI is compromised | Encryption to NIST standards makes data "secured", so losing it is not a reportable breach. |
| **Enforcement Rule** | Investigations and civil money penalties (HHS Office for Civil Rights) | Tiered penalties by level of culpability, adjusted for inflation every year. |
| **Transactions and Code Sets, Identifiers** | Standard electronic transactions (X12 837, 835, 270/271…), code sets (ICD-10, CPT…), the NPI | The reason payer and provider systems speak X12. See the payer workflows chapter. |

**HITECH** (2009) strengthened enforcement, added breach notification, and funded EHR adoption. The 2013
**Omnibus Rule** made business associates (and their subcontractors) directly liable under HIPAA.

### Who must comply

- **Covered entities (CEs):** health plans (Molina, Medicare Advantage plans, state Medicaid programmes),
  health care clearinghouses (such as Availity), and health care providers that send standard transactions
  electronically (hospitals, physicians, labs).
- **Business associates (BAs):** anyone who creates, receives, maintains or transmits PHI *on behalf of* a CE.
  Examples: a cloud host, a claims-processing vendor, a technology services firm like CitiusTech, or Quantiphi building a
  Medicaid Document AI platform. A **Business Associate Agreement (BAA)** is required before PHI flows. A BA's
  subcontractors sign BAAs too, so the chain goes CE → BA → subcontractor.

### What counts as PHI

**Protected health information** is individually identifiable health information held or sent by a CE or BA, in any
form (electronic, paper, spoken). It needs **both** parts: something about health, care or payment for care, **and**
something that identifies the person. A diagnosis with no identifiers is not PHI. A member ID inside a claims system is
PHI, even with no diagnosis next to it, because it is linked to payment for care.

Not PHI: employment records a CE holds as an employer, education records covered by FERPA, and properly
**de-identified** data.

### The 18 Safe Harbor identifiers (45 CFR 164.514(b)(2))

Remove all of these, for the person and for their relatives, employers and household members:

1. Names
2. Geographic units smaller than a state: street address, city, county, precinct, ZIP code. *Exception:* you may keep
   the first 3 ZIP digits if the area made up of all ZIP codes with those 3 digits has more than 20,000 people;
   otherwise change them to `000`.
3. All parts of dates (except the year) directly related to the person: birth, admission, discharge, death. Ages over
   89, and any date part (including the year) that would reveal such an age, must be grouped as "90 or older".
4. Telephone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate and licence numbers
12. Vehicle identifiers and serial numbers, including licence plates
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers (fingerprints, voiceprints)
17. Full-face photographs and comparable images
18. Any other unique identifying number, characteristic or code

On top of removing these, the CE must have **no actual knowledge** that what remains could identify the person.

### De-identification: two methods, plus the limited data set

| Method | How | When |
|---|---|---|
| **Safe Harbor** | Remove the 18 identifiers, and have no actual knowledge that the person can be re-identified | Simple and mechanical, easy to automate and audit. Loses dates and fine geography. |
| **Expert Determination** (164.514(b)(1)) | A qualified statistical expert finds that the risk of re-identification is very small, and documents the methods | Keeps more useful detail (such as shifted dates or 5-digit ZIPs in some cases). Used for analytics and ML datasets. |
| **Limited Data Set** (not de-identified) | Remove 16 direct identifiers, but keep dates, city, state and ZIP | Research, public health, operations. Still PHI, so it needs a **Data Use Agreement**. |

A re-identification code (a pseudonymous key) is allowed under Safe Harbor if it is not derived from the person's
information and the mapping is not disclosed.

## The Security Rule as engineering controls

The Security Rule is deliberately technology-neutral. Each standard has implementation specifications that are
either **required** or **addressable**. *Addressable* means you implement it, or document why an equivalent
alternative is reasonable. It does **not** mean optional. In practice, treat encryption as mandatory. HHS proposed
in a January 2025 rulemaking notice to remove the required/addressable distinction and require encryption and MFA
outright. Check where that proposal stands before quoting it as final.

| Safeguard | Standards | What you build |
|---|---|---|
| **Administrative** | Risk analysis and risk management (required), workforce training, access management, contingency plan, BAAs | Threat models, a documented risk register, onboarding/offboarding that revokes access, DR runbooks |
| **Physical** | Facility access, workstation security, device and media controls | Mostly the cloud provider's job under the BAA; laptops with full-disk encryption and MDM |
| **Technical** | Access control (unique user ID, emergency access, automatic logoff, encryption), audit controls, integrity, person/entity authentication, transmission security | SSO with MFA, RBAC/ABAC, session timeouts, AES-256 at rest, TLS 1.2+ in transit, immutable audit logs, checksums and signed URLs |

### The engineering checklist interviewers like to hear

- **Identity and access:** SSO (SAML or OIDC) with MFA; role-based access with least privilege; break-glass access
  that is logged and reviewed; short-lived tokens; no shared accounts.
- **Encryption:** at rest (cloud KMS, customer-managed keys where needed) and in transit (TLS everywhere,
  including service-to-service traffic inside the VPC). Encrypt backups.
- **Audit logging:** who (user or service ID), what (action and resource ID), when, from where (IP, client), and the
  outcome. Logs are append-only and tamper-evident, and kept per the retention policy. HIPAA requires its
  *documentation* to be kept for 6 years; many organisations apply the same period to audit logs.
- **No PHI in application logs, URLs, error messages or analytics.** Log IDs and correlation IDs, not names or SSNs.
  Never put PHI in query strings: they end up in proxy logs and browser history.
- **Data minimisation:** return only the fields the caller needs; mask by default (`***-**-6789`).
- **Non-production environments:** use synthetic or de-identified data. Never copy production PHI into dev or test.
- **Secure SDLC:** dependency scanning, SAST, secrets in a vault (never in code), code review, penetration tests.
- **Vendors:** a BAA with every vendor that touches PHI. Use only the cloud services your provider lists as
  HIPAA-eligible under its BAA.

**Your angle:** on the LDH Medicaid Document AI platform, documents lived in GCS and the Angular front end rendered
them through **short-lived signed URLs**, so nobody had a public link to a Medicaid application. Users signed in
through **SAML**. Each environment (Dev, SIT, UAT) was separate.

### PHI-safe logging in Python

```python
import logging
import re

PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),
    (re.compile(r"\(?\b\d{3}\)?[-. ]?\d{3}[-. ]\d{4}\b"), "[PHONE]"),
]


class RedactPHI(logging.Filter):
    """Last line of defence: scrub obvious identifiers before a record is written."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        for pattern, label in PATTERNS:
            message = pattern.sub(label, message)
        record.msg, record.args = message, None
        return True


captured: list[str] = []


class ListHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        captured.append(self.format(record))


log = logging.getLogger("claims")
handler = ListHandler()
handler.addFilter(RedactPHI())
log.addHandler(handler)
log.setLevel(logging.INFO)

log.info("Lookup failed for ssn=%s email=%s phone=%s", "123-45-6789", "jane@example.com", "(562) 555-0100")
assert captured == ["Lookup failed for ssn=[SSN] email=[EMAIL] phone=[PHONE]"]
```

A redaction filter is a safety net, not the design. The real control is to never pass PHI to the logger in the first
place: log `member_id_hash` or a correlation ID instead.

## Breach notification

A **breach** is an impermissible use or disclosure that compromises PHI. It is **presumed** to be a breach unless a
documented risk assessment shows a low probability of compromise. The assessment looks at four factors:

1. The nature and extent of the PHI (which identifiers, how sensitive).
2. Who received it.
3. Whether it was actually acquired or viewed.
4. How far the risk has been mitigated.

| Who | Deadline |
|---|---|
| Affected individuals | Without unreasonable delay, and **no later than 60 calendar days** after discovery |
| HHS | 500 or more people: at the same time as the individuals. Fewer than 500: in an annual log, within 60 days of the end of the calendar year |
| Media | When **more than 500** residents of one state or jurisdiction are affected |
| BA → CE | A business associate tells the covered entity without unreasonable delay, and no later than 60 days after discovery (the BAA often sets a shorter deadline) |

**Unsecured** PHI is what triggers notification. PHI encrypted according to HHS guidance (NIST standards), with
the key not compromised, is "secured". That is why "we encrypt laptops and backups" is a business answer, not just
a technical one.

## Related rules and frameworks

- **42 CFR Part 2:** stricter confidentiality for substance use disorder treatment records from federally assisted
  programmes. A 2024 final rule aligned it more closely with HIPAA, allowing a single patient consent for TPO, with
  compliance required by February 2026. Systems often have to tag and segment these records.
- **State laws:** some are stricter than HIPAA (HIPAA sets a floor). Washington's My Health My Data Act covers
  consumer health data that HIPAA does not.
- **HITRUST CSF:** a certifiable framework that maps HIPAA, NIST and ISO controls. Many payers ask vendors for it.
  There is **no official "HIPAA certification"**. Anyone who claims one means an audit or a HITRUST/SOC 2 report.
- **SOC 2:** Type I checks that controls are designed correctly at one point in time; Type II checks that they
  operated effectively over a period (usually 6–12 months).
- **21 CFR Part 11** (FDA): electronic records and signatures in clinical trials: validated systems, audit trails,
  unique signatures. This is Medidata's world. See the payer workflows chapter.

## GenAI and PHI

1. **Contract first:** only send PHI to an LLM service covered by a BAA (for example Azure OpenAI, Amazon Bedrock
   or Google Vertex AI, within the HIPAA-eligible services each provider lists), with data retention and training
   use turned off or contractually excluded.
2. **Minimise:** de-identify or pseudonymise before the prompt when the task allows it, and re-link afterwards.
3. **Self-host when needed:** an open model (for example Qwen through Ollama, or vLLM) inside your own VPC keeps PHI
   in your boundary.
4. **Do not log prompts and completions with PHI** in tracing tools unless those tools are covered too.
5. **RAG access control:** filter retrieved documents by the user's entitlements *before* they reach the prompt.
   The model must never see documents the user could not open themselves.
6. **Human review:** for decisions about coverage or eligibility, a person approves. That is the HITL pattern.

**Your angle:** the Medicaid Document AI platform extracted fields from MAGI and Non-MAGI applications and paystubs,
validated them against Pydantic schemas, and sent anything doubtful to a **human reviewer** before submitting it to the
downstream system. That is minimum necessary, integrity controls and human oversight in one design.

## Interview questions

### What is PHI, and what makes data PHI rather than just health data? {core}

PHI is individually identifiable health information that a covered entity or business associate creates, receives,
stores or sends, in any form. It needs two things together: information about health, health care or payment for
care, and something that identifies the person, such as a name, MRN, member ID or a date of birth with a ZIP code.

So "HbA1c 8.2" on its own is not PHI. "HbA1c 8.2 for member M12345" is. A member ID inside a claims system is PHI
even with no diagnosis next to it, because it ties a person to payment for care. Properly de-identified data is not
PHI, and HIPAA no longer applies to it.

### What is the difference between a covered entity and a business associate? {core}

Covered entities are health plans, health care clearinghouses, and providers that bill electronically. A business
associate does work involving PHI on behalf of a covered entity: cloud hosting, claims processing, analytics, software
development with production data. Before any PHI flows, the two sign a Business Associate Agreement. Since the 2013
Omnibus Rule, business associates and their subcontractors are directly liable for HIPAA violations.

**Your angle:** at Cognizant I worked as a vendor for Molina Healthcare (a covered entity health plan). At Quantiphi
we were the vendor on a state Medicaid programme's platform. In both cases the vendor works under BAA terms.

### Name the HIPAA Safe Harbor identifiers. How do dates and ZIP codes work? {core}

There are 18: names; geography smaller than a state; date parts other than the year; phone; fax; email; SSN; MRN;
health plan beneficiary number; account number; certificate or licence number; vehicle IDs; device IDs; URLs; IP
addresses; biometrics; full-face photos; and any other unique identifying code.

Two details catch people out. For dates, you keep only the year, and ages over 89 collapse into "90 or older". For
ZIP codes, you may keep the first three digits only if all ZIP codes sharing those three digits together cover more
than 20,000 people; otherwise you use `000`. For a team, I group the list as: direct identifiers (name, SSN),
contact details, record and account numbers, device and network identifiers, and dates and geography.

### Safe Harbor versus Expert Determination: when would you choose each?

Safe Harbor is a checklist: remove the 18 identifiers and have no actual knowledge that the person can be
re-identified. It is easy to automate and audit, but you lose dates and fine geography, which hurts analytics. For
example, you can't calculate a 30-day readmission without dates.

Expert Determination means a qualified statistician analyses the dataset and certifies that the re-identification
risk is very small, often using techniques like date shifting, generalisation and k-anonymity. I would use it for ML
training data that needs time intervals. If the purpose is research or operations and you need dates and ZIPs, you
can use a limited data set under a Data Use Agreement, but that data is still PHI.

### What does "minimum necessary" mean for an API you design? {core}

Use, disclose or request only the PHI needed for the purpose. In an API that means field-level scoping: a
scheduling screen gets the name and appointment time, not the diagnosis list; a claims-status endpoint returns status
and amounts, not clinical notes. Mask by default and return the full value only to roles that need it. Make bulk
export a separate, audited permission.

It does not apply to disclosures to a provider for treatment, to the patient themselves, or under the patient's
authorisation. That is why clinical systems can show full records to the treating clinician.

### What are the three types of safeguards in the Security Rule? {core}

Administrative, physical and technical. Administrative covers the risk analysis (required), policies, workforce
training, access management, contingency planning and BAAs. Physical covers facilities, workstations and devices.
Technical covers access control (unique user IDs, emergency access, automatic logoff, encryption), audit controls,
integrity controls, person or entity authentication, and transmission security.

Each specification is required or addressable. Addressable means you implement it or document a reasonable
equivalent. It is not optional, and I treat encryption as mandatory.

### How do you encrypt PHI at rest and in transit in a cloud application? {core}

At rest: storage and database encryption with the cloud KMS (AES-256), customer-managed keys where policy requires,
encrypted backups and snapshots, and key rotation. For the most sensitive fields, such as SSNs, I add application-level
encryption or tokenisation, so a database dump alone reveals nothing.

In transit: TLS 1.2 or newer everywhere, including internal service-to-service calls, with HSTS on public endpoints.
Encryption matters beyond the technology: under the Breach Notification Rule, PHI encrypted to NIST standards counts
as "secured", so a lost encrypted disk is not a reportable breach.

**Your angle:** on GCP we served documents through short-lived GCS signed URLs instead of public buckets or proxying
large files through the API.

### What goes into a HIPAA audit log, and how do you protect it? {core}

Who (user or service identity), what (the action, such as view, create, update, export or print, plus the
resource type and ID), when (UTC timestamp), where (source IP and client), and the outcome (success or denied). For
reads of sensitive records, include the reason or context when the workflow captures it, as in break-glass access.

Protect it by writing to append-only or immutable storage (WORM buckets, a separate logging project), restricting who
can read it, and alerting on unusual patterns such as one user opening hundreds of records. Keep it per the retention
policy; many organisations use six years to match HIPAA's documentation retention. The audit log records IDs and
actions, never the clinical content itself.

### How do you keep PHI out of logs and error messages?

Design first: log identifiers and correlation IDs, never names, SSNs, DOBs or free-text notes. Use structured
logging with an allow-list of fields, return generic error messages to clients, and log the detail server-side without
the payload. Keep PHI out of URLs and query strings, because those land in proxy logs, CDN logs and browser history.

As a safety net, add a redaction filter in the logging pipeline, and scan logs for SSN or email patterns. Turn off
request-body logging in API gateways and APM tools, or make sure those tools are covered by a BAA.

### What is a breach, and what are the notification deadlines? {core}

A breach is an impermissible use or disclosure that compromises PHI. It is presumed to be a breach unless a risk
assessment of four factors shows a low probability of compromise: the nature and extent of the data, who received
it, whether it was actually acquired or viewed, and how far the risk was mitigated.

Notify individuals without unreasonable delay and no later than 60 days after discovery. For 500 or more people,
also notify HHS at the same time; when more than 500 residents of one state are affected, notify the media there too. Breaches under 500 go in an annual report to HHS. A
business associate must tell the covered entity within 60 days at most, and the BAA often sets a shorter deadline.
Encrypted data with an uncompromised key is "secured", so its loss does not trigger notification.

### Can you use production data in a test environment?

Not real PHI, as a rule. Test and development environments have more people with access and weaker controls, so
copying production into them is one of the most common causes of breaches. Use synthetic data (for example Synthea for
clinical records), or a de-identified or masked copy produced by an automated, reviewed pipeline. If a production
issue can only be reproduced with real data, do it in a controlled production-support environment with the same
controls as production, and log the access.

### How would you use an LLM on documents that contain PHI? {core}

Start with the contract: only send PHI to an LLM endpoint covered by a BAA (Azure OpenAI, Amazon Bedrock and Vertex
AI offer this for listed services), with retention and training use disabled. Then minimise: de-identify or
pseudonymise when the task allows it, and send only the pages or fields needed. Self-hosting an open model inside the
VPC is the other option.

Around the model: no PHI in prompt logs or traces, permission-aware retrieval for RAG, output validation against a
schema, and a human checkpoint before anything affects a member's coverage or eligibility.

**Your angle:** that is how I describe the Medicaid Document AI work: extraction, then a Pydantic schema gate, then
human-in-the-loop review before submission.

### What patient rights does the Privacy Rule give, and how do they affect system design? {deep}

The main rights are: access to and a copy of their records (within 30 days, with one 30-day extension), amendment,
an accounting of disclosures, requests for restrictions, confidential communications, and a Notice of Privacy
Practices. For a system, that means you must be able to export a person's records in a readable format, record
amendments without destroying the original, and report disclosures, which requires disclosure logging. In the US,
the Cures Act and the CMS Patient Access API rule also push this access through FHIR APIs.

### What is TPO, and when do you need patient authorisation? {deep}

TPO stands for treatment, payment and health care operations. A covered entity can use and disclose PHI for these without
the patient's written authorisation, subject to minimum necessary (except for treatment). Examples: a provider sending
a claim to a payer is payment; a payer's quality-improvement analytics is operations. Marketing, sale of PHI, most
uses of psychotherapy notes, and disclosures to an employer need written authorisation. Research needs authorisation,
an IRB or privacy-board waiver, de-identified data, or a limited data set with a DUA.

### What is 42 CFR Part 2, and why does it matter for data platforms? {deep}

It protects substance use disorder (SUD) treatment records from federally assisted programmes, more strictly than HIPAA.
Historically those records needed specific patient consent for most disclosures, and could not be used against the
patient in legal proceedings. A 2024 final rule aligned Part 2 more closely with HIPAA, allowing a single consent for
TPO, with compliance by February 2026. For engineers, this means you tag and segment SUD data, carry consent with the
data, and filter it out of feeds and analytics that are not permitted to see it.

### What is the difference between HIPAA compliance, HITRUST and SOC 2? {deep}

HIPAA is the law. There is no official HIPAA certification; you show compliance through risk analyses, policies,
controls and audits. HITRUST CSF is a certifiable framework that maps HIPAA, NIST and ISO controls, and many payers
require it from vendors. SOC 2 is an AICPA attestation over trust criteria (security, availability, confidentiality and
others); a Type II report shows controls worked over a period of time. A vendor serving health plans usually needs a
BAA, plus HITRUST or SOC 2 Type II.

### What is the shared responsibility model for HIPAA in the cloud? {deep}

The cloud provider signs a BAA and secures the physical infrastructure and its HIPAA-eligible services. You remain
responsible for using only those eligible services for PHI, and for configuring them correctly: IAM, encryption, network
isolation, logging, backups and patching your own code. A misconfigured public bucket is the customer's breach, not the
provider's. Signing the BAA does not make every service in the console safe for PHI.

### How do role-based and attribute-based access control differ for clinical data? {deep}

RBAC grants permissions by role (care manager, claims processor, auditor). It is simple but coarse. ABAC evaluates
attributes at request time: the user's department and assigned cases, the patient's plan or state, data sensitivity tags
such as SUD or behavioural health, and the purpose. Healthcare usually needs both: roles for broad capability, and
attributes for "only members assigned to my caseload", "only my state's Medicaid members", or "hide Part 2 data".
Break-glass access overrides the rules in an emergency, but is logged and reviewed.

**Your angle:** the Labels Web admin work at The Dot Corp was role-based admin UI for carrier credentials. That is the
same principle: sensitive configuration only for the roles that need it.

### What are the penalties for HIPAA violations? {deep}

HHS's Office for Civil Rights enforces civil penalties in four tiers by culpability: did not know, reasonable cause,
wilful neglect that was corrected, and wilful neglect that was not corrected. The amounts are adjusted for inflation each
year, and the annual cap for the top tier is over $2 million per type of violation. Criminal penalties, prosecuted by the
Department of Justice, reach up to $250,000 and 10 years in prison for knowingly obtaining or disclosing PHI with intent
to sell it or cause harm. State attorneys general can also sue. In practice, corrective action plans and reputational
damage cost as much as the fines.

## Coding problems

### Redact identifiers from free text {easy core}

Write `redact(text)` that replaces SSNs (`123-45-6789`), email addresses, US phone numbers (`(562) 555-0100`,
`562-555-0100`, `562.555.0100`) and MRNs written as `MRN: 0012345` with labels `[SSN]`, `[EMAIL]`, `[PHONE]` and
`[MRN]`. Text without identifiers must be unchanged.

```text
redact("Pt MRN: 0012345, call (562) 555-0100 or jane.doe@mail.com, SSN 123-45-6789")
→ "Pt [MRN], call [PHONE] or [EMAIL], SSN [SSN]"
```

#### Hints

1. One compiled regular expression per identifier type, applied in a fixed order.
2. Order matters: an SSN `123-45-6789` must not be half-matched by a phone pattern first, so run SSN before phone.
3. Use `\b` word boundaries so `1234567890123` (an account number) is not partly matched as a phone.

#### Solution

Build a list of `(pattern, label)` pairs and apply them in order. Regex redaction catches *structured* identifiers well;
names and addresses in free text need NER (a clinical NLP model or a cloud DLP service), which is worth saying in the
interview.

```python
import re

RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bMRN[:#]?\s*\d{5,10}\b", re.IGNORECASE), "[MRN]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    (re.compile(r"\b[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b"), "[EMAIL]"),
    (re.compile(r"(?<!\d)(?:\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]\d{4}\b"), "[PHONE]"),
]


def redact(text: str) -> str:
    for pattern, label in RULES:
        text = pattern.sub(label, text)
    return text


assert redact("Pt MRN: 0012345, call (562) 555-0100 or jane.doe@mail.com, SSN 123-45-6789") == (
    "Pt [MRN], call [PHONE] or [EMAIL], SSN [SSN]"
)
assert redact("Office 562-555-0100 / 562.555.0199") == "Office [PHONE] / [PHONE]"
assert redact("Account 1234567890123 is unchanged") == "Account 1234567890123 is unchanged"
assert redact("No identifiers here.") == "No identifiers here."
assert redact("") == ""
```

Complexity: O(n · r) for text length n and r rules; each regex pass is linear for these patterns.

#### Follow-ups

- **How would you catch names and addresses?** A named-entity recogniser (spaCy with a clinical model, AWS
  Comprehend Medical, Google Cloud DLP or Azure AI Language PII detection), and then measure recall on labelled samples.
  For PHI, missing an identifier is worse than over-redacting one.
- **How do you prove it works?** A labelled test set with precision and recall, plus tests for edge cases like
  identifiers next to punctuation.

### De-identify a patient record with Safe Harbor rules {medium core}

Given a patient dict, return a new dict that:

- removes `name`, `ssn`, `mrn`, `phone`, `email` and `street`;
- keeps `state`;
- replaces `zip` with its first three digits, or `"000"` when the prefix is in the restricted list;
- replaces `birth_date` (ISO string) with `birth_year`, and reports the age as `"90+"` with no birth year when the person
  is 90 or older on a given `as_of` date;
- replaces `admit_date` with `admit_year`;
- keeps clinical fields (`diagnosis_codes`, `lab_results`) unchanged, and does not modify the input.

#### Hints

1. Build the output from an allow-list of fields, not by deleting a block-list. New fields added later then stay out by
   default.
2. Age on a date: subtract the years, then subtract one more if the birthday has not happened yet that year.
3. Keep the restricted ZIP3 prefixes in a set for O(1) lookup.

#### Solution

An allow-list approach is the safer design, and saying so is a good signal. The restricted prefixes below are the
list in HHS's de-identification guidance, based on 2000 Census data. A production pipeline recomputes the list from
current Census data.

```python
from datetime import date

RESTRICTED_ZIP3 = {
    "036", "059", "063", "102", "203", "556", "692", "790", "821",
    "823", "830", "831", "878", "879", "884", "890", "893",
}
KEEP_AS_IS = {"state", "sex", "diagnosis_codes", "lab_results"}


def age_on(birth: date, as_of: date) -> int:
    had_birthday = (as_of.month, as_of.day) >= (birth.month, birth.day)
    return as_of.year - birth.year - (0 if had_birthday else 1)


def deidentify(record: dict, as_of: date) -> dict:
    out = {key: record[key] for key in KEEP_AS_IS if key in record}

    if zip_code := record.get("zip"):
        prefix = str(zip_code)[:3]
        out["zip3"] = "000" if prefix in RESTRICTED_ZIP3 else prefix

    if birth := record.get("birth_date"):
        born = date.fromisoformat(birth)
        if age_on(born, as_of) >= 90:
            out["age"] = "90+"          # no birth year: it would reveal the age
        else:
            out["birth_year"] = born.year

    if admit := record.get("admit_date"):
        out["admit_year"] = date.fromisoformat(admit).year

    return out


patient = {
    "name": "Jane Doe", "ssn": "123-45-6789", "mrn": "0012345", "phone": "562-555-0100",
    "email": "jane@example.com", "street": "1 Main St", "state": "CA", "zip": "92620",
    "sex": "F", "birth_date": "1961-03-15", "admit_date": "2026-02-01",
    "diagnosis_codes": ["E11.9", "I10"], "lab_results": {"4548-4": 8.2},
}
as_of = date(2026, 10, 13)
result = deidentify(patient, as_of)
assert result == {
    "state": "CA", "sex": "F", "zip3": "926", "birth_year": 1961, "admit_year": 2026,
    "diagnosis_codes": ["E11.9", "I10"], "lab_results": {"4548-4": 8.2},
}
assert patient["name"] == "Jane Doe"                      # input untouched

assert deidentify({"birth_date": "1936-10-13", "zip": "03601"}, as_of) == {"age": "90+", "zip3": "000"}
assert deidentify({"birth_date": "1936-10-14"}, as_of) == {"birth_year": 1936}   # still 89 today
assert deidentify({}, as_of) == {}
```

The boundary is the birthday, and interviewers like to see you test it. Someone born on 1936-10-14 turns 90
tomorrow, so today they are 89 and their birth year is allowed. Test `age_on` on its own for these edge cases:

```python
from datetime import date


def age_on(birth: date, as_of: date) -> int:
    had_birthday = (as_of.month, as_of.day) >= (birth.month, birth.day)
    return as_of.year - birth.year - (0 if had_birthday else 1)


as_of = date(2026, 10, 13)
assert age_on(date(1936, 10, 14), as_of) == 89     # birthday is tomorrow
assert age_on(date(1936, 10, 13), as_of) == 90     # birthday is today
assert age_on(date(1936, 10, 12), as_of) == 90
assert age_on(date(2000, 2, 29), date(2026, 2, 28)) == 25   # leap-day birthday
```

Complexity: O(f) in the number of fields.

#### Follow-ups

- **What about free-text notes in the record?** Drop them, or run them through NER-based redaction and a review
  sample. Safe Harbor applies to every field, including text.
- **The analysts need intervals, such as days from admission to discharge.** Compute the intervals *before*
  removing the dates (intervals are not identifiers), or use Expert Determination with per-patient date shifting.

### An audit-log decorator for PHI access {medium}

Write a decorator `audited(action, resource)` for service functions that take `user_id` and `record_id` keyword
arguments. Each call appends an audit event (`user`, `action`, `resource`, `record_id`, `outcome`, `at` in UTC ISO
format) to an audit sink, both when the call succeeds and when it raises `PermissionError` (outcome `"denied"`) or any
other error (outcome `"error"`). The exception must still propagate, and the event must never contain the function's
return value (which is PHI).

#### Hints

1. A decorator factory: the outer function takes `action` and `resource` and returns the real decorator.
2. Use `try / except / else`, or a `finally` with an `outcome` variable, so every path writes exactly one event.
3. Use `functools.wraps` so the wrapped function keeps its name and docstring.

#### Solution

```python
import functools
from datetime import datetime, timezone
from typing import Any, Callable

AUDIT_LOG: list[dict[str, Any]] = []   # in production: an append-only store, not a list


def audited(action: str, resource: str) -> Callable:
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, user_id: str, record_id: str, **kwargs: Any) -> Any:
            outcome = "error"
            try:
                result = fn(*args, user_id=user_id, record_id=record_id, **kwargs)
                outcome = "success"
                return result
            except PermissionError:
                outcome = "denied"
                raise
            finally:
                AUDIT_LOG.append({
                    "user": user_id, "action": action, "resource": resource,
                    "record_id": record_id, "outcome": outcome,
                    "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                })
        return wrapper
    return decorator


CASELOAD = {"nurse-7": {"M100"}}


@audited("read", "Patient")
def get_patient(*, user_id: str, record_id: str) -> dict:
    """Return the patient chart (PHI)."""
    if record_id not in CASELOAD.get(user_id, set()):
        raise PermissionError("not on caseload")
    if record_id == "M100":
        return {"name": "Jane Doe", "dx": ["E11.9"]}
    raise KeyError(record_id)


assert get_patient(user_id="nurse-7", record_id="M100")["dx"] == ["E11.9"]
try:
    get_patient(user_id="nurse-7", record_id="M200")
except PermissionError:
    pass
else:
    raise AssertionError("expected PermissionError")

assert [e["outcome"] for e in AUDIT_LOG] == ["success", "denied"]
assert all("Jane" not in str(e) for e in AUDIT_LOG)       # no PHI in the audit trail
assert AUDIT_LOG[0]["at"].endswith("+00:00")
assert get_patient.__name__ == "get_patient" and "PHI" in (get_patient.__doc__ or "")
```

Complexity: O(1) overhead per call.

#### Follow-ups

- **Where should the events go?** An append-only store: a separate logging project or account, a WORM bucket, or a
  managed audit service. Never the same database the application can update.
- **How would you do this in FastAPI?** A dependency or middleware that knows the authenticated user from the token and
  writes the event, so endpoints cannot forget to call it.
