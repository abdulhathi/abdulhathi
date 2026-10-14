---
title: Payer, provider and life-sciences workflows
goal: Walk through the claim lifecycle, the X12 transactions, adjudication, prior authorisation, appeals and grievances, and value-based care, and tie each one to the projects you have delivered.
minutes: 50
---

"Healthcare" is one of the three mandatory skills in this JD, and it is where you have the most depth: 13 years at
Cognizant on Molina Healthcare, TMG Health and MedData programmes (claims, appeals and grievances, prior authorisation, utilisation
and care management across Medicaid, Medicare and Marketplace), then myMedidata in clinical trials, a Medicaid
Document AI platform, and Labcorp fulfilment. Most candidates for a "Python & AI" role cannot explain an 835 or the
difference between an appeal and a grievance. You can. This chapter gives you the precise vocabulary, so the domain
answers come out crisp and confident.

## The ecosystem in one picture

```text
   Member / patient ──enrols──▶ Health plan (payer) ◀──contracts── Provider network
         │                        ▲    │    ▲                           │
     receives care                │    │    │ 835 remittance + payment  │
         ▼                        │    │    └───────────────────────────┤
   Provider (hospital, physician, lab) ──837 claim──▶ Clearinghouse ──▶ Payer
         │                                  (Availity, Change Healthcare, Waystar)
         └── pharmacy claims ──NCPDP──▶ PBM (Express Scripts, CVS Caremark, Optum Rx)

   Regulators and sponsors: CMS (Medicare, Medicaid with the states, CHIP, Marketplace), state Medicaid agencies,
   state insurance departments, NCQA (accreditation, HEDIS)
```

| Player | Role |
|---|---|
| **Payer / health plan** | Insures members, builds provider networks, adjudicates claims, manages utilisation and quality. Molina is a Medicaid- and Medicare-focused managed care plan. |
| **Provider** | Delivers care and bills for it: hospitals (institutional), physicians (professional), labs (Labcorp), pharmacies |
| **Clearinghouse** | Validates, routes and translates EDI between providers and payers. **Availity** is also a multi-payer provider portal for eligibility, authorisations, claim status and appeals. |
| **PBM** (pharmacy benefit manager) | Runs the pharmacy benefit: formularies, pharmacy networks, drug prior authorisation, rebates |
| **CMS** | The federal agency running Medicare, overseeing Medicaid and CHIP with the states, and the federal Marketplace |
| **TPA** | Administers self-funded employer plans |

### Lines of business

| Programme | Who | How it is run |
|---|---|---|
| **Medicare** | People 65+, or with certain disabilities or ESRD | **Part A** hospital, **Part B** medical/outpatient, **Part C Medicare Advantage** (private plans such as Molina's covering A and B, usually with D), **Part D** drugs |
| **Medicaid** | Low-income people, run by each state with federal funding | Fee-for-service, or more often **managed care organisations (MCOs)** paid a capitated rate per member per month |
| **Marketplace** (ACA exchanges) | Individuals buying their own coverage | Qualified Health Plans with premium tax credits |
| **CHIP** | Children in families above the Medicaid limit | Run with Medicaid or separately |
| **Duals** | Eligible for both Medicare and Medicaid | Often D-SNPs (Dual Eligible Special Needs Plans). Medicaid is the payer of last resort. |

**MAGI vs Non-MAGI Medicaid.** Most eligibility groups (children, pregnant people, parents and the ACA expansion
adults) use **MAGI** (Modified Adjusted Gross Income) rules: income-based, with no asset test. **Non-MAGI**
groups (aged, blind, disabled, long-term care, Medicare Savings Programs) use SSI-related rules that usually
include an **asset (resource) test**. That is why they need different application forms and different evidence.

**Your angle:** the LDH Medicaid Document AI platform processed exactly these: MAGI and Non-MAGI application forms,
plus paystubs as income evidence. Explaining *why* the two forms differ shows you understood the business, not just the
pipeline.

## The claim lifecycle

1. **Enrolment** (X12 **834**): the plan learns who its members are, from employers, the Marketplace or the
   state Medicaid agency.
2. **Eligibility check** (**270/271**): before the visit, the provider asks whether the member is covered and
   what their benefits, copays and deductibles are.
3. **Prior authorisation** (**278**, a portal, or the new FHIR PAS): needed for selected services such as imaging,
   surgery, inpatient stays and specialty drugs.
4. **Care delivered**, then **coding**: diagnoses in ICD-10-CM, services in CPT/HCPCS with modifiers, and ICD-10-PCS
   plus revenue codes for inpatient facility claims.
5. **Claim creation and scrubbing**: front-end edits catch missing NPIs, invalid code combinations (NCCI edits) and
   eligibility problems before submission.
6. **Submission** (**837P** professional, **837I** institutional, **837D** dental) through a clearinghouse.
7. **Acknowledgments**: **TA1** for the interchange envelope, **999** for syntax, **277CA** for claim-level acceptance
   or rejection.
8. **Adjudication** by the payer (see below). The provider can track it with **276/277** claim status.
9. **Payment and remittance**: money by EFT, explained claim by claim in the **835** (ERA). The member gets an
   **Explanation of Benefits (EOB)**.
10. **Denials, appeals and patient billing**: the provider works the denials, appeals what it can, and bills the
    patient for their share.

### X12 transactions (HIPAA standard, version 005010)

| Transaction | Name | Direction |
|---|---|---|
| **834** | Benefit enrolment and maintenance | Sponsor (employer, state, exchange) → plan |
| **820** | Premium payment | Sponsor → plan |
| **270 / 271** | Eligibility and benefit inquiry / response | Provider ↔ payer |
| **276 / 277** | Claim status request / response | Provider ↔ payer |
| **278** | Health care services review: prior authorisation and referral request and response | Provider ↔ payer (UM) |
| **837P / 837I / 837D** | Health care claim: professional (paper equivalent CMS-1500) / institutional (UB-04) / dental | Provider → payer |
| **835** | Health care claim payment and remittance advice (ERA) | Payer → provider |
| **277CA** | Claim acknowledgment | Payer or clearinghouse → provider |
| **999 / TA1** | Implementation (syntax) acknowledgment / interchange acknowledgment | Receiver → sender |

Pharmacy claims are not X12: retail pharmacies use **NCPDP Telecommunication D.0** in real time, and e-prescribing
uses **NCPDP SCRIPT**.

**X12 structure:** an **ISA/IEA** interchange envelope, **GS/GE** functional groups, **ST/SE** transaction sets.
Segments end with a terminator (often `~`), elements are separated by `*`, and components by `:`. The ISA
segment is **fixed-width (106 characters)**, so a parser reads the delimiters from fixed positions in it. The data is
organised in **loops**: in an 837, 2000A billing provider, 2000B subscriber, 2300 claim, 2400 service line.

### Adjudication: what the payer's system does

1. **Intake and front-end edits:** valid syntax, valid member and provider, no exact duplicate.
2. **Eligibility and benefits:** was the member covered on the date of service, for this benefit, in network?
3. **Authorisation match:** if the service needs prior authorisation, is there an approved one that matches the
   service, dates and units?
4. **Clinical and coding edits:** NCCI procedure-to-procedure edits, medically unlikely edits (MUEs), medical policy,
   and medical necessity checks against the diagnosis.
5. **Pricing:** the contracted fee schedule; MS-DRG for inpatient stays; APC (OPPS) for hospital outpatient; RBRVS
   relative values for physician services; capitation for some arrangements.
6. **Coordination of benefits (COB):** if another plan is primary, pay as secondary.
7. **Member cost share:** deductible, copay, coinsurance, out-of-pocket maximum.
8. **Decision:** paid, denied or pended for manual review. Then the payment cycle, the 835 and the EOB.

### Reading an 835

- **CLP** (claim payment): the provider's claim ID, status (1 processed as primary, 2 secondary, 4 denied, 22
  reversal…), total charge, amount paid, patient responsibility and the payer's claim number.
- **CAS** (adjustment): a **group code** plus **CARC** (claim adjustment reason code) and amount.
  Group codes: **CO** contractual obligation (the provider writes it off), **PR** patient responsibility, **OA**
  other adjustment, **PI** payer-initiated reduction. Examples: CARC **1** deductible, **2** coinsurance, **3** copay,
  **45** charge exceeds the fee schedule, **197** precertification or authorisation absent.
- **RARC** (remittance advice remark codes) add explanation.
- **Balancing rule:** charge = paid + total adjustments, for every claim. Posting systems reject an 835 that does
  not balance.

## Utilisation management, prior authorisation and care management

**Utilisation management (UM)** checks that care is medically necessary and delivered in the right setting:

- **Prospective** (prior authorisation): before the service.
- **Concurrent:** during an inpatient stay (continued-stay reviews, discharge planning).
- **Retrospective:** after the service, as part of claims review.

Reviewers apply criteria sets such as **InterQual** or **MCG**, plus the plan's medical policies. Nurses can approve, but a medical-necessity denial must be made by a physician or
other appropriately qualified clinical reviewer. Providers can ask for a **peer-to-peer** discussion with that reviewer.

**CMS-0057-F** (the Interoperability and Prior Authorization final rule, 2024) applies to Medicare Advantage, Medicaid,
CHIP and federal Marketplace plans:

- From **1 January 2026**: decisions within **72 hours for expedited** and **7 calendar days for standard**
  requests (this applies to MA, Medicaid and CHIP; Marketplace plans are excluded from these timeframes), a
  **specific reason** for every denial, and public reporting of prior-authorisation metrics.
- By **January 2027**: FHIR **Prior Authorization**, **Provider Access** and **Payer-to-Payer** APIs. These are built on
  the HL7 **Da Vinci** guides: CRD (does this need authorisation?), DTR (fill in the documentation) and PAS
  (submit the request). Drugs are excluded from the API requirements.

**Care management** works with members who have complex needs: risk stratification (who needs outreach),
assessments, care plans, transitions of care after discharge, and disease management programmes (diabetes, heart
failure, behavioural health). Predictive models drive who gets outreach.

**Your angle:** at Molina I built web-based **Utilization Management** workflows covering prior authorisation, case
management, pharmacy and behavioural health across several health plans. I also integrated **Availity's multi-payer
appeals** with Molina's Appeals & Grievances system.

## Appeals and grievances

| | **Appeal** | **Grievance** |
|---|---|---|
| What | A request to reconsider an **adverse benefit determination**: a denied, reduced or terminated service, or a denied payment | A complaint about **anything else**: quality of care, access, wait times, staff behaviour, customer service |
| Example | "The plan denied my MRI authorisation." | "I waited 40 minutes on hold and the nurse was rude." |
| Outcome | The decision is upheld or overturned | The issue is resolved; no coverage decision |

**Medicaid managed care** (42 CFR 438 Subpart F):

- The member has **60 days** from the denial notice to appeal to the plan.
- The plan resolves standard appeals in **30 calendar days** and expedited appeals in **72 hours**.
- Grievances are resolved within **90 days**.
- The member must normally finish the plan's appeal before asking for a **State Fair Hearing**. If the plan misses its
  deadlines, the member is treated as having finished it.

**Medicare Advantage (Part C) has five levels:**

1. **Plan reconsideration:** 30 days for a standard pre-service request, 72 hours expedited, 60 days for payment.
2. **Independent Review Entity (IRE):** a denial the plan upholds is forwarded automatically.
3. **Administrative Law Judge** hearing at OMHA.
4. **Medicare Appeals Council.**
5. **Federal district court.**

Levels 3 and 5 require a minimum amount in dispute. Medicare Advantage grievances are resolved within 30 days.

**Provider disputes** (claim payment disagreements, reconsiderations) usually run through a separate contractual
process from **member** appeals, which systems must keep apart. Every case has regulatory clocks, required letters
and audit trails, which is why A&G systems are workflow engines with SLA timers.

## Value-based care and quality

- **Fee-for-service** pays per service. **Value-based care** pays for outcomes and cost: pay-for-performance,
  **shared savings** (ACOs, the Medicare Shared Savings Program), bundled payments, and **capitation** (a fixed
  amount per member per month, sometimes with downside risk).
- **Risk adjustment:** Medicare Advantage plans are paid more for sicker members. The **CMS-HCC** model maps documented
  diagnoses to Hierarchical Condition Categories and combines them with demographics into a **risk adjustment factor
  (RAF)**. Diagnoses must be documented in a qualifying encounter each year. Coders often use the **MEAT** convention
  (Monitored, Evaluated, Assessed/Addressed, Treated). CMS checks the evidence in **RADV** audits. The ACA Marketplace
  has its own HHS-HCC model.
- **HEDIS** (NCQA): standard quality measures such as breast cancer screening, controlling high blood pressure, and
  glycaemic control for patients with diabetes. Medicaid MCOs and Medicare Advantage plans report them.
- **Medicare Star Ratings** (1–5 stars) combine HEDIS, CAHPS member surveys, the Health Outcomes Survey and
  operational measures, including appeals and complaint handling. Plans with 4 stars or more earn quality bonus
  payments, so stars are worth a lot of money.

## Life sciences: clinical trials

- Trial phases I–IV. The systems involved: **EDC** (electronic data capture, such as Medidata Rave), **eCOA/ePRO**
  (patient-reported outcomes), **eConsent**, **RTSM/IRT** (randomisation and drug supply), **CTMS** (trial operations),
  and **decentralised and hybrid trials**, where patients take part remotely.
- Rules: **21 CFR Part 11** (FDA requirements for electronic records and signatures: validated systems, secure audit
  trails, unique electronic signatures linked to their records), **ICH E6 Good Clinical Practice** (the R3 revision was
  finalised in 2025), IRB/ethics approval, informed consent, and HIPAA where providers' PHI is involved.
- Data standards for FDA submissions: **CDISC** CDASH (collection), SDTM (tabulation), ADaM (analysis).

**Your angle:** myMedidata is the patient-facing side of Medidata's platform: patients register, give **eConsent** and
take part in remote and hybrid studies. It integrates with Medidata's core clinical-trial systems and has to meet
regulatory requirements, which is where Part 11 audit trails come in.

## Revenue cycle management (the provider side)

Patient access (scheduling, registration, eligibility, authorisations) → charge capture and coding → claim submission
→ payment posting from 835s → denial management and appeals → patient billing and collections.

Key metrics: **clean claim rate** (claims accepted first time), **denial rate**, **days in A/R**, **first-pass
resolution rate**, **net collection rate**.

## CitiusTech, and why this role

**What to know:** CitiusTech was founded in 2005 and works only in **healthcare and life sciences**. Its clients are
**payers, providers, medtech and life-sciences/pharma** companies, mainly in the US. Services span digital
engineering, data and analytics, cloud, **interoperability (HL7/FHIR)**, automation, and **AI and GenAI**. It has a US
presence (Princeton, New Jersey) and large delivery centres in India. Before the interview, check their website's
newsroom for the latest GenAI and platform announcements, and mention one by name.

**Why CitiusTech, in your words:** "Almost my whole career has been in healthcare: payer systems at Molina, clinical
trials at Medidata, and most recently a Medicaid Document AI platform. CitiusTech works only in healthcare and life
sciences, across payers, providers and life sciences, and it is investing heavily in data, interoperability and AI.
That is exactly where my experience is. I want to be in a place where the domain knowledge is valued and where I can
build production AI systems for healthcare clients, not generic apps."

## Interview questions

### Walk me through the life of a claim, from the visit to payment. {core}

The member enrols (834). Before the visit, the provider checks eligibility and benefits (270/271) and gets a prior
authorisation if the service needs one (278 or a portal). After care, the encounter is coded (ICD-10-CM diagnoses,
CPT/HCPCS services), scrubbed for errors, and submitted as an 837P or 837I through a clearinghouse, which returns 999
and 277CA acknowledgments. The payer adjudicates: eligibility, authorisation match, coding and medical-necessity edits,
pricing against the contract, coordination of benefits, then the member's cost share.

Payment goes by EFT, with an 835 remittance explaining every adjustment. The member gets an EOB, and the provider
bills the patient's share and works any denials, which may become appeals.

**Your angle:** I have worked on several points in that chain: authorisations and appeals at Molina, including the
Availity integration where providers submit and track claim appeals.

### What are the main HIPAA X12 transactions? {core}

834 enrolment, 820 premium payment, 270/271 eligibility, 276/277 claim status, 278 prior authorisation and referrals,
837 claims (P professional, I institutional, D dental), 835 payment and remittance, and the acknowledgments: TA1, 999
and 277CA. The mandated version is 005010. Pharmacy is different: NCPDP D.0 for claims and SCRIPT for e-prescribing.

### What happens during claim adjudication? {core}

Front-end edits validate the format, member, provider and duplicates. Then eligibility and benefits on the date of
service, matching to an approved authorisation, clinical and coding edits (NCCI, MUEs, medical policy), and pricing
against the provider's contract: a fee schedule, MS-DRG for inpatient, APC for outpatient. After that, coordination
of benefits if another plan is primary, and the member's deductible, copay and coinsurance. The claim ends up paid,
denied with reason codes, or pended for a human. Most volume is auto-adjudicated, and the pended queue is where cost,
and the opportunity for ML, sits.

### What is the difference between an appeal and a grievance? {core}

An appeal asks the plan to reconsider an adverse benefit determination: a denied, reduced or terminated service, or a
denied payment. A grievance is a complaint about anything else: quality of care, access, wait times, customer service.
They follow different regulatory processes and timelines. In Medicaid managed care: standard appeals in 30 days,
expedited in 72 hours, grievances in 90 days, and then a State Fair Hearing. Medicare Advantage has five appeal levels,
from plan reconsideration through the Independent Review Entity, an ALJ and the Appeals Council, to federal court.

**Your angle:** appeals and grievances was one of my areas at Molina, including integrating Availity's multi-payer
appeals so providers could submit and track claim appeals electronically. If they ask about internals, describe only
what you worked on; A&G systems in general classify cases, run SLA clocks for standard and expedited cases, and
generate the required letters.

### What is prior authorisation, and what changed with CMS-0057-F? {core}

Prior authorisation is utilisation management before the service: the provider asks the plan to approve selected
services such as imaging, surgery, inpatient stays and specialty drugs. Reviewers check medical necessity against
criteria like InterQual or MCG. Nurses can approve, but a medical-necessity denial needs a physician or other qualified
clinical reviewer.

CMS-0057-F applies to Medicare Advantage, Medicaid, CHIP and federal Marketplace plans. Since January 2026, MA,
Medicaid and CHIP plans must decide expedited requests within 72 hours and standard ones within 7 calendar days, every
plan must give a specific denial reason, and plans publish prior-authorisation metrics. By January 2027, plans must
offer FHIR Prior Authorization, Provider Access and Payer-to-Payer APIs, based on the Da Vinci CRD, DTR and PAS guides.

**Your angle:** I built UM workflows at Molina covering prior authorisation, case management, pharmacy and behavioural
health, so I know the intake, clinical review, decision and notification steps these APIs automate.

### Explain Medicare, Medicaid and the Marketplace, and the Medicare parts. {core}

Medicare is federal coverage for people 65 and over or with certain disabilities: Part A hospital, Part B medical, Part C
Medicare Advantage (private plans that cover A and B, usually with D), and Part D drugs. Medicaid is run by each state
with federal funding, for low-income people, and most states deliver it through managed care organisations paid a
capitated rate. The Marketplace is the ACA exchange where individuals buy qualified health plans, often with subsidies.
Dual-eligible members have both Medicare and Medicaid, and Medicaid pays last.

Medicaid eligibility splits into MAGI groups (income-based, no asset test) and Non-MAGI groups (aged, blind and
disabled, usually with an asset test).

**Your angle:** Molina operates across all three lines. The LDH Medicaid Document AI work processed MAGI and Non-MAGI
applications plus paystubs for income verification.

### What is an 835, and how do you reconcile it?

The 835 is the electronic remittance advice: for each claim, a CLP segment with the charge, the amount paid, the
patient's responsibility and the status, and CAS segments that explain every dollar of difference with a group code
(CO contractual, PR patient responsibility, OA other, PI payer-initiated) and a CARC reason code (for example 45: charge
exceeds the fee schedule; 197: authorisation absent). RARC codes add remarks.

Reconciliation means checking that each claim balances (charge = paid + adjustments) and matching the 835's total to the
actual EFT deposit using the TRN trace number. Then you post payments, move PR amounts to patient billing, and send
denials to work queues by reason code.

### What does a clearinghouse do, and what is Availity? {core}

A clearinghouse sits between many providers and many payers. It validates claims against payer-specific edits,
translates formats, routes transactions, and returns acknowledgments and remittances, so a provider integrates once
instead of with every payer. Examples are Availity, Change Healthcare (part of Optum) and Waystar. Availity is also a
multi-payer provider portal: eligibility, authorisations, claim status, remittances and appeals, used by many large
health plans.

**Your angle:** I integrated Availity's multi-payer appeals with Molina's A&G system, so providers could submit and track
claim appeals through Availity instead of separately with Molina.

### What is the difference between an 837P and an 837I?

The 837P is the professional claim: physician and other practitioner services, and the electronic form of the CMS-1500.
Services are coded with CPT/HCPCS plus modifiers and a place-of-service code. The 837I is the institutional claim:
hospitals, skilled nursing facilities and home health, the electronic form of the UB-04. It carries a type of bill,
revenue codes, ICD-10-PCS procedures for inpatient stays, and admission and discharge details, and is often priced by
MS-DRG or APC. One hospital stay usually produces both: an 837I from the facility and 837Ps from the physicians.

### Explain deductible, copay, coinsurance, out-of-pocket maximum and allowed amount.

The **allowed amount** is the contracted price for a service: the billed charge minus the contractual adjustment (CO).
The **deductible** is what the member pays each year before the plan starts sharing costs. A **copay** is a flat amount
per service, such as $30 for an office visit, often not subject to the deductible. **Coinsurance** is a percentage of the
allowed amount after the deductible, such as 20%. The **out-of-pocket maximum** caps what the member pays in a year, and
copays, coinsurance and deductibles count towards it. After that, the plan pays 100% of covered in-network care. The EOB
shows all of this for each claim.

### What are value-based care, risk adjustment, HEDIS and Star Ratings?

Value-based care pays for outcomes and total cost rather than volume: shared savings for ACOs, bundled payments,
capitation with risk. Risk adjustment pays Medicare Advantage plans more for sicker members. The CMS-HCC model turns each
year's documented diagnoses into hierarchical condition categories and a risk score, so complete and accurate diagnosis
documentation is worth real money, and CMS audits it through RADV. HEDIS is NCQA's set of quality measures, such as
cancer screenings and blood pressure and diabetes control. Medicare Star Ratings combine HEDIS, member surveys and
operational measures, and 4+ star plans earn bonus payments.

### Where would you apply machine learning in a payer organisation? {core}

The highest-value areas:

- **Claim denial and pend prediction:** score claims before submission or adjudication so problems get fixed early.
- **Auto-adjudication of pended claims**, and **prior-authorisation triage:** auto-approve clear cases and route the
  rest to nurses. A model never auto-denies; a clinician makes that decision.
- **Fraud, waste and abuse detection:** anomaly detection on provider billing patterns.
- **Care management risk stratification:** who will be readmitted or have a costly event, so outreach comes first.
- **HEDIS gap closure:** which members are likely to miss a screening.
- **Document AI:** extract fields from faxes, medical records and applications.

The engineering is the same everywhere: clean labelled history, leakage-safe features (only what was known at decision
time), metrics that match the cost of errors (recall for fraud, precision for auto-approval), explainability for
reviewers, fairness checks across populations, and a human in the loop for adverse decisions.

**Your angle:** the Document AI platform is a live example: ML extraction, a Pydantic validation gate, then human review
before anything affects a Medicaid application.

### Why CitiusTech, and why healthcare? {core}

Keep it specific. Almost my whole career has been in healthcare: payer systems for Molina (claims, appeals, prior
authorisation, utilisation management), clinical trials at Medidata, and most recently a Medicaid Document AI platform
on GCP. CitiusTech focuses only on healthcare and life sciences, with payer, provider, medtech and life-sciences clients,
and its strengths in interoperability, data and AI match where I want to grow: building production Python and AI
systems where the domain knowledge actually matters. I like that the work affects real patients and members, and that
the compliance bar (HIPAA, audit, validation) is high, because I have worked to that standard for years.

### What is coordination of benefits? {deep}

When a member has more than one coverage, COB decides who pays first. The primary plan adjudicates normally, and the
secondary plan pays some or all of what remains, up to its own allowed amount, using the primary's remittance. Rules
include the employee's own plan before a spouse's plan, the **birthday rule** for children covered by both parents (the
parent whose birthday comes earlier in the calendar year is primary), Medicare Secondary Payer rules (an employer group
plan is primary for working people 65 and over when the employer has 20 or more employees), and Medicaid as the payer of
last resort. In claims systems, wrong COB data is a major source of overpayments and recoveries.

### What are the most common denial reasons, and how do you reduce them? {deep}

Eligibility and coverage problems; missing or mismatched prior authorisation (CARC 197); coding errors and NCCI bundling
edits; missing or invalid data (NPI, member ID, diagnosis pointer); medical necessity; duplicates; and timely-filing
limits (12 months from the date of service for Medicare, often shorter for commercial and Medicaid plans). Reduce them
upstream: real-time eligibility checks at scheduling, an authorisation check at order time, claim scrubbers with
payer-specific rules, and analytics on 835 reason codes so the top denial causes get fixed at the source. A prediction
model on historical 835s can flag risky claims before submission.

### What is fraud, waste and abuse, and how is it detected? {deep}

Fraud is intentional deception for payment (billing for services never provided). Waste is overuse of services. Abuse is
practice inconsistent with sound business or medical practice, such as upcoding. Detection combines rules (NCCI edits,
MUEs, impossible combinations like a hysterectomy on a male patient, more than 24 hours billed in a day), statistical
outlier analysis against peer providers, network analysis of providers and members, and supervised models trained on
confirmed cases. Payers run Special Investigations Units, and their prepayment edits stop money going out rather than
chasing it back later.

### What is care management, and how does data drive it? {deep}

Care management helps members with complex or chronic conditions: assessments, individual care plans, medication
reconciliation, transitions of care after discharge, and programmes for conditions like diabetes, COPD, heart failure,
behavioural health and maternity. Data drives who gets attention: risk stratification from claims, pharmacy, lab and ADT
feeds (for example, a real-time alert when a member is admitted), predicted readmission or cost scores, and care gaps.
Success is measured in avoided admissions, readmission rates, ED visits and quality measures.

**Your angle:** the Molina Utilization Management platform supported case management workflows alongside prior
authorisation.

### What should an engineer know about clinical-trial systems and 21 CFR Part 11? {deep}

Part 11 is the FDA rule that makes electronic records and signatures trustworthy: validated systems, secure computer-generated
audit trails with timestamps that never overwrite the original value, access controls, unique electronic signatures linked
to their records, and record retention. In practice: every create, update and delete is audited with who, when, the old
and new values and the reason; changes go through change control with validation evidence; and signatures need
re-authentication. Trial data then flows into CDISC formats (SDTM, ADaM) for submission. ICH E6 Good Clinical Practice
governs how the trial itself is run.

**Your angle:** myMedidata's eConsent and remote participation features sit inside these constraints, which is why
audit trails and controlled releases matter on that kind of platform. Describe only the parts you personally handled.

### How do Medicaid managed care plans work, and what data do they exchange with the state? {deep}

The state contracts with MCOs and pays each a capitated monthly rate per member, adjusted for risk. The plan takes the
financial risk, builds the network and pays providers. Data flows both ways. The state sends enrolment (834) and
capitation payments (820). The plan submits **encounter data**: every service it paid, in 837 format, which the state uses
to set rates and check quality. The plan also reports quality measures, appeals and grievances, and network adequacy.
Each state contract adds its own rules, timelines and reports, which is why Medicaid systems need heavy configuration
per state.

### What is a PBM, and how does pharmacy differ from medical claims? {deep}

A pharmacy benefit manager runs the drug benefit for a plan: formulary design (covered drugs, tiers), pharmacy networks,
real-time claims adjudication at the counter (NCPDP D.0, answered in seconds), drug prior authorisation and step therapy,
drug-utilisation review, and rebates from manufacturers. Medical claims are batch X12 837s adjudicated over days or
weeks. Pharmacy claims are real-time point-of-sale transactions. Drugs given in a clinic (infusions) are often billed on
the medical benefit with HCPCS J-codes, which creates the medical versus pharmacy benefit split plans have to manage.

## Coding problems

### Calculate the member's cost share {medium core}

Write `cost_share(allowed, benefit, accumulators)` that returns what the member pays, what the plan pays, and the
updated accumulators, using these rules:

- If the benefit has a **copay**, the member pays `min(copay, allowed)` and the deductible does not apply.
- Otherwise the member pays the deductible first (`min(allowed, deductible_remaining)`), then **coinsurance** on the rest.
- The member's total is capped at `oop_remaining`; everything the member pays counts towards it.
- Money is exact: use `Decimal` and round to cents with half-up rounding.

```text
allowed 1000, deductible remaining 500, coinsurance 20%, OOP remaining 3000
→ member 600.00 (500 deductible + 100 coinsurance), plan 400.00, deductible remaining 0, OOP remaining 2400
```

#### Hints

1. Never use floats for money: `0.1 + 0.2 != 0.3`. Build `Decimal` values from strings.
2. Compute the member share before the out-of-pocket cap, then apply the cap with `min`.
3. The deductible accumulator only goes down by the part that was actually applied to the deductible.

#### Solution

Work in the order an adjudication engine does: copay or deductible, then coinsurance, then the out-of-pocket cap, then
the plan pays the rest. Return new accumulator values instead of mutating the input. That makes it easy to test and
safe to replay.

```python
from dataclasses import dataclass, replace
from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True)
class Benefit:
    coinsurance: Decimal = Decimal("0")
    copay: Decimal | None = None


@dataclass(frozen=True)
class Accumulators:
    deductible_remaining: Decimal
    oop_remaining: Decimal


def cost_share(allowed: Decimal, benefit: Benefit, acc: Accumulators) -> tuple[Decimal, Decimal, Accumulators]:
    to_deductible = Decimal("0")
    if benefit.copay is not None:
        member = min(benefit.copay, allowed)
    else:
        to_deductible = min(allowed, acc.deductible_remaining)
        member = to_deductible + (allowed - to_deductible) * benefit.coinsurance
    member = min(member, acc.oop_remaining).quantize(CENT, rounding=ROUND_HALF_UP)
    to_deductible = min(to_deductible, member)          # the cap can cut into the deductible part too
    plan = (allowed - member).quantize(CENT, rounding=ROUND_HALF_UP)
    new_acc = replace(
        acc,
        deductible_remaining=acc.deductible_remaining - to_deductible,
        oop_remaining=acc.oop_remaining - member,
    )
    return member, plan, new_acc


D = Decimal
acc = Accumulators(deductible_remaining=D("500"), oop_remaining=D("3000"))

member, plan, acc1 = cost_share(D("1000"), Benefit(coinsurance=D("0.20")), acc)
assert (member, plan) == (D("600.00"), D("400.00"))
assert acc1 == Accumulators(D("0"), D("2400.00"))

member, plan, acc2 = cost_share(D("150"), Benefit(copay=D("30")), acc)          # office visit with a copay
assert (member, plan) == (D("30.00"), D("120.00")) and acc2.deductible_remaining == D("500")

member, plan, _ = cost_share(D("20"), Benefit(copay=D("30")), acc)              # allowed below the copay
assert (member, plan) == (D("20.00"), D("0.00"))

capped = Accumulators(deductible_remaining=D("500"), oop_remaining=D("1000"))
member, plan, acc3 = cost_share(D("10000"), Benefit(coinsurance=D("0.20")), capped)
assert (member, plan) == (D("1000.00"), D("9000.00")) and acc3.oop_remaining == D("0.00")

member, _, _ = cost_share(D("99.99"), Benefit(coinsurance=D("0.15")), Accumulators(D("0"), D("5000")))
assert member == D("15.00")                                                     # 14.9985 rounds half-up
```

Complexity: O(1).

#### Follow-ups

- **Family deductibles?** Track individual and family accumulators. The member's share stops at whichever limit is
  reached first, and both accumulators are updated.
- **Claims arrive out of order, or get reversed?** Accumulators must be recalculated in date-of-service order, and
  a reversal (CLP status 22) restores them. That is why real engines keep accumulator history, not a single running
  total.

### Summarise an 835 remittance {medium}

Write `parse_835(raw)` that reads the delimiters from the ISA segment (the element separator is the character at
index 3, the component separator at index 104 and the segment terminator at index 105), then returns one summary
per claim: claim ID, status text (`1` → "processed as primary", `4` → "denied", anything else → "other"), charge, paid,
patient responsibility, the list of adjustments `(group, reason, amount)` from CAS segments, and `balanced` (charge ==
paid + all adjustments). A CAS segment can hold up to six reason/amount/quantity triplets.

#### Hints

1. ISA is fixed-width (106 characters including the terminator), which is exactly why the delimiters can be read from
   fixed positions.
2. Walk the segments in order. A CLP starts a new claim, and the CAS segments that follow belong to it.
3. CAS elements after the group code come in threes: reason, amount, quantity. Step through them with `range(2, len, 3)`.

#### Solution

```python
from decimal import Decimal

STATUS = {"1": "processed as primary", "2": "processed as secondary", "4": "denied", "22": "reversal"}


def parse_835(raw: str) -> list[dict]:
    elem, term = raw[3], raw[105]      # raw[104] is the component separator (SVC01 is a composite like HC:99213)
    claims: list[dict] = []
    for segment in filter(None, (s.strip() for s in raw.split(term))):
        e = segment.split(elem)
        if e[0] == "CLP":
            claims.append({
                "claim_id": e[1], "status": STATUS.get(e[2], "other"),
                "charge": Decimal(e[3]), "paid": Decimal(e[4]),
                "patient_resp": Decimal(e[5] or "0"), "adjustments": [],
            })
        elif e[0] == "CAS" and claims:
            group = e[1]
            for i in range(2, len(e), 3):
                if e[i]:
                    claims[-1]["adjustments"].append((group, e[i], Decimal(e[i + 1])))
    for c in claims:
        c["balanced"] = c["charge"] == c["paid"] + sum((a[2] for a in c["adjustments"]), Decimal("0"))
    return claims


isa_fields = ["00", " " * 10, "00", " " * 10, "ZZ", "PAYER".ljust(15), "ZZ", "PROVIDER".ljust(15),
              "261013", "0830", "^", "00501", "000000001", "0", "P", ":"]
ISA = "ISA*" + "*".join(isa_fields) + "~"
assert len(ISA) == 106

RAW = ISA + "~".join([
    "GS*HP*PAYER*PROVIDER*20261013*0830*1*X*005010X221A1",
    "ST*835*0001",
    "BPR*I*150.00*C*CHK" + "*" * 12 + "20261013",
    "TRN*1*CHK12345*1512345678",
    "CLP*CLAIM001*1*200.00*150.00*30.00*MC*PAYERCLM1*11",
    "CAS*CO*45*20.00",
    "CAS*PR*1*30.00",
    "CLP*CLAIM002*4*500.00*0*0*MC*PAYERCLM2*11",
    "CAS*CO*197*500.00",
    "CLP*CLAIM003*1*120.00*80.00*25.00*MC*PAYERCLM3*11",
    "CAS*CO*45*10.00**253*2.00",
    "CAS*PR*2*25.00",
    "SE*13*0001", "GE*1*1", "IEA*1*000000001",
]) + "~"

claims = parse_835(RAW)
assert [c["claim_id"] for c in claims] == ["CLAIM001", "CLAIM002", "CLAIM003"]
assert claims[0]["adjustments"] == [("CO", "45", Decimal("20.00")), ("PR", "1", Decimal("30.00"))]
assert claims[0]["status"] == "processed as primary" and claims[0]["balanced"]
assert claims[1]["status"] == "denied" and claims[1]["adjustments"] == [("CO", "197", Decimal("500.00"))]
assert claims[2]["adjustments"][:2] == [("CO", "45", Decimal("10.00")), ("CO", "253", Decimal("2.00"))]
assert not claims[2]["balanced"]        # 120 != 80 + 10 + 2 + 25: an 835 that should be rejected
```

Complexity: O(n) in the size of the file.

#### Follow-ups

- **Would you hand-parse X12 in production?** No: use a proper EDI library or translator (or the clearinghouse's
  JSON API), validated against the 005010 implementation guide. But knowing the envelope and delimiter rules makes
  you effective when something breaks.
- **How do you match the 835 to the bank deposit?** The TRN trace number and the BPR total are matched against the
  EFT, which is called reassociation.

### Track prior-authorisation decision deadlines {easy core}

Each request has an ID, a `received` timestamp (timezone-aware), an `urgency` (`"expedited"` or `"standard"`) and an
optional `decided` timestamp. Under CMS-0057-F, expedited requests are due 72 hours after receipt and standard
requests 7 calendar days after. Write `triage(requests, now)` that returns the open (undecided) requests sorted by due
time, each labelled `"overdue"`, `"at risk"` (less than 25% of the window left) or `"on track"`, plus a list of
decided requests that missed their deadline.

#### Hints

1. Map urgency to a `timedelta` once: `{"expedited": timedelta(hours=72), "standard": timedelta(days=7)}`.
2. Remaining time is `due - now`; "at risk" means `remaining < window / 4`.
3. Compare timezone-aware datetimes only, never naive ones, because the clocks run across time zones.

#### Solution

```python
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

WINDOW = {"expedited": timedelta(hours=72), "standard": timedelta(days=7)}


@dataclass(frozen=True)
class AuthRequest:
    id: str
    received: datetime
    urgency: str
    decided: datetime | None = None

    @property
    def due(self) -> datetime:
        return self.received + WINDOW[self.urgency]


def triage(requests: list[AuthRequest], now: datetime) -> tuple[list[tuple[str, str, datetime]], list[str]]:
    open_items = []
    late_decisions = []
    for r in requests:
        if r.decided is not None:
            if r.decided > r.due:
                late_decisions.append(r.id)
            continue
        remaining = r.due - now
        if remaining < timedelta(0):
            label = "overdue"
        elif remaining < WINDOW[r.urgency] / 4:
            label = "at risk"
        else:
            label = "on track"
        open_items.append((r.id, label, r.due))
    open_items.sort(key=lambda item: item[2])
    return open_items, late_decisions


utc = timezone.utc
now = datetime(2026, 10, 13, 12, 0, tzinfo=utc)
requests = [
    AuthRequest("PA-1", datetime(2026, 10, 10, 9, 0, tzinfo=utc), "expedited"),          # due 10-13 09:00
    AuthRequest("PA-2", datetime(2026, 10, 11, 0, 0, tzinfo=utc), "expedited"),          # due 10-14 00:00
    AuthRequest("PA-3", datetime(2026, 10, 12, 8, 0, tzinfo=utc), "standard"),           # due 10-19 08:00
    AuthRequest("PA-4", datetime(2026, 10, 1, 8, 0, tzinfo=utc), "standard",
                decided=datetime(2026, 10, 9, 8, 0, tzinfo=utc)),                         # decided a day late
    AuthRequest("PA-5", datetime(2026, 10, 12, 8, 0, tzinfo=timezone(timedelta(hours=-7))), "expedited"),
]
open_items, late = triage(requests, now)
assert [(i, label) for i, label, _ in open_items] == [
    ("PA-1", "overdue"), ("PA-2", "at risk"), ("PA-5", "on track"), ("PA-3", "on track"),
]
assert late == ["PA-4"]
assert open_items[2][2] == datetime(2026, 10, 15, 15, 0, tzinfo=utc)   # 08:00 at UTC-7 is 15:00 UTC, + 72 h
```

Complexity: O(n log n) for the sort.

#### Follow-ups

- **Does every plan use these clocks?** CMS-0057-F sets them for Medicare Advantage, Medicaid and CHIP. States and
  accreditation bodies may set stricter limits, and drug authorisations have their own rules. So keep the windows in
  configuration per line of business, not in code.
- **What happens when a request is pended for missing information?** The rules define when the clock can pause or
  when the request must be decided on what is available. Model the clock as events (received, information requested,
  information received, decided), not as one timestamp.

### Find suspected duplicate claims {easy}

Given claim lines as dicts with `claim_id`, `member_id`, `npi`, `dos` (date of service), `cpt`, `modifier` and
`charge`, return groups of claim IDs that look like duplicates: the same member, provider, date of service, procedure
code and modifier, but **different** claim IDs. Ignore the case of the modifier and surrounding spaces. Sort each group,
and sort the groups by their first claim ID.

#### Hints

1. Build a normalised key tuple and group with `defaultdict(set)`.
2. A set of claim IDs per key automatically ignores the same claim sent twice under one ID.

#### Solution

```python
from collections import defaultdict


def suspected_duplicates(lines: list[dict]) -> list[list[str]]:
    groups: dict[tuple, set[str]] = defaultdict(set)
    for line in lines:
        key = (
            line["member_id"].strip(), line["npi"].strip(), line["dos"],
            line["cpt"].strip().upper(), (line.get("modifier") or "").strip().upper(),
        )
        groups[key].add(line["claim_id"])
    return sorted((sorted(ids) for ids in groups.values() if len(ids) > 1), key=lambda g: g[0])


lines = [
    {"claim_id": "C1", "member_id": "M1", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": "", "charge": 150},
    {"claim_id": "C2", "member_id": "M1", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": None, "charge": 150},
    {"claim_id": "C3", "member_id": "M1", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": "25", "charge": 150},
    {"claim_id": "C4", "member_id": "M2", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": "", "charge": 150},
    {"claim_id": "C1", "member_id": "M1", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": "", "charge": 150},
    {"claim_id": "C5", "member_id": "M2 ", "npi": "1234567893", "dos": "2026-10-01", "cpt": "99213", "modifier": " ", "charge": 140},
]
assert suspected_duplicates(lines) == [["C1", "C2"], ["C4", "C5"]]
assert suspected_duplicates([]) == []
```

Complexity: O(n) to group, plus sorting the output.

#### Follow-ups

- **Are these really duplicates?** Not always: a modifier such as 76 (repeat procedure by the same physician) or a
  bilateral procedure makes a repeat legitimate. That is why systems flag *suspected* duplicates for review, or apply
  payer-specific rules, rather than denying automatically.
- **Near duplicates** (same service, dates one day apart, or a different rendering provider in the same group)? Use
  fuzzier keys or a scoring model, and measure precision, because a false positive delays a provider's payment.
