---
title: HL7 v2, FHIR and code sets
goal: Read an HL7 v2 message, explain FHIR resources, REST and SMART on FHIR, name the right code set for any field, and describe a v2-to-FHIR integration.
minutes: 50
---

Interoperability is the heart of healthcare IT services, and most healthcare technology firms list it as a core
offering. Expect at least one question like "Have you worked with HL7 or FHIR?" or "How would you integrate with an EHR?". A strong answer
names the standards correctly, shows you can read a real message, and moves straight to engineering concerns:
mapping, terminology, idempotency, ordering, validation and security.

Three generations of standards are still in production at the same time:

| Standard | Format | Where you meet it |
|---|---|---|
| **HL7 v2** (2.1 to 2.9; 2.3 and 2.5.1 are very common) | Pipe-delimited text messages over MLLP/TCP | Inside hospitals: admissions (ADT), lab orders and results, scheduling. Still the large majority of in-hospital interfaces. |
| **HL7 v3 / CDA / C-CDA** | XML documents | Clinical document exchange between organisations: Continuity of Care Documents, discharge summaries |
| **FHIR** (R4 dominant; R4B, R5 published) | RESTful JSON/XML resources | Modern APIs: patient apps, payer APIs required by CMS, EHR app platforms, analytics |

## HL7 v2 in practice

A message is a set of **segments** separated by carriage returns (`\r`). Each segment starts with a three-letter
ID and is split into **fields** by `|`. Fields split into **components** (`^`), **repetitions** (`~`) and
**subcomponents** (`&`), with `\` as the escape character.

```text
MSH|^~\&|EHR|HOSP|LAB|LABFAC|20261013083000||ADT^A01^ADT_A01|MSG00001|P|2.5.1
EVN|A01|20261013083000
PID|1||MRN12345^^^HOSP^MR~M998877^^^PLAN^MB||DOE^JANE^Q||19610315|F|||123 MAIN ST^^IRVINE^CA^92620||(562)555-0100
PV1|1|I|4W^401^A^HOSP||||1234567893^SMITH^JOHN
```

| Segment | Meaning | Fields worth knowing |
|---|---|---|
| **MSH** | Message header | MSH-1 field separator `\|`, MSH-2 encoding characters `^~\&`, MSH-3/4 sending application and facility, MSH-5/6 receiving application and facility, MSH-7 timestamp, **MSH-9 message type** (`ADT^A01`), **MSH-10 control ID**, MSH-11 processing ID (P/T/D), MSH-12 version |
| **EVN** | Event | EVN-1 trigger event, EVN-2 recorded time |
| **PID** | Patient identification | **PID-3 identifier list** (MRN, member ID, with assigning authority and type), **PID-5 name** (family^given^middle), PID-7 birth date, PID-8 sex, PID-11 address, PID-13 home phone |
| **PV1** | Patient visit | PV1-2 patient class (I inpatient, O outpatient, E emergency), PV1-3 location (unit^room^bed), PV1-7 attending doctor, PV1-19 visit number |
| **OBR** | Observation request | The ordered test or panel, order numbers, ordering provider |
| **OBX** | Observation result | OBX-2 value type (NM, ST, CWE…), **OBX-3 code** (usually LOINC), **OBX-5 value**, OBX-6 units, OBX-7 reference range, **OBX-8 abnormal flag** (H, L, N…), **OBX-11 status** (F final, P preliminary, C corrected) |
| **ORC** | Common order | Order control (NW new, CA cancel), placer and filler order numbers |
| **IN1** | Insurance | Plan, member and group numbers |
| **MSA / ERR** | Acknowledgment | MSA-1 code (AA, AE, AR), MSA-2 the control ID being acknowledged |

**The MSH off-by-one trap.** In MSH, the field separator itself *is* MSH-1. So when you split an MSH line on
`|`, the element at index 1 is MSH-2. For every other segment, index *n* is field *n*. Every hand-written v2 parser
has had this bug at some point. Mentioning it shows you have actually done this work.

### Common message types

| Type | Trigger events | Use |
|---|---|---|
| **ADT** (admit, discharge, transfer) | A01 admit, A02 transfer, A03 discharge, A04 register an outpatient, A08 update patient information, A40 merge patients | Keeps every downstream system's patient and visit data in sync |
| **ORM / OML** | O01 / O21 | Orders (lab, radiology) |
| **ORU** | R01 | Results: lab values, reports |
| **SIU** | S12 new appointment, S14 modify, S15 cancel | Scheduling |
| **MDM** | T02 | Documents and transcriptions |
| **DFT** | P03 | Charges sent to billing |
| **VXU** | V04 | Immunisations to state registries |
| **ACK** | n/a | Acknowledges any message |

**Transport:** v2 usually travels over **MLLP** (Minimal Lower Layer Protocol) on TCP. Each message is wrapped in a
start byte `0x0B` and ends with `0x1C 0x0D`. The receiver replies with an **ACK** whose MSA segment carries
**AA** (accepted), **AE** (application error) or **AR** (rejected). Enhanced mode adds commit-level codes CA, CE and CR.
Senders usually wait for the ACK before sending the next message, which preserves order.

**Interface engines** route, transform and monitor these feeds: NextGen Connect (formerly Mirth), Rhapsody,
InterSystems HealthShare, Cloverleaf. Cloud options include the **Google Cloud Healthcare API** (HL7v2, FHIR and DICOM
stores) and **Azure Health Data Services** (FHIR service, DICOM service), with a v2-to-FHIR conversion step.

## FHIR in practice

**FHIR** (Fast Healthcare Interoperability Resources) models healthcare as about 150 **resources**: small,
addressable JSON or XML documents with a standard REST API.

```json
{
  "resourceType": "Patient",
  "id": "pat-123",
  "meta": { "versionId": "3", "lastUpdated": "2026-10-13T08:30:00Z",
            "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
  "identifier": [{
    "type": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0203", "code": "MR" }] },
    "system": "http://hospital.example.org/mrn",
    "value": "MRN12345"
  }],
  "name": [{ "family": "Doe", "given": ["Jane", "Q"] }],
  "gender": "female",
  "birthDate": "1961-03-15",
  "address": [{ "line": ["123 Main St"], "city": "Irvine", "state": "CA", "postalCode": "92620" }]
}
```

The building blocks you will use every day:

- **Identifier:** `system` (whose ID it is: the namespace) plus `value`. A patient has many identifiers: MRNs from each
  hospital, member IDs from each plan.
- **CodeableConcept:** `coding: [{system, code, display}]` plus optional `text`. One concept can carry several codings,
  for example a local lab code and its LOINC equivalent.
- **Reference:** `{"reference": "Patient/pat-123"}` links resources together (Observation.subject → Patient).
- **Quantity**, **Period**, **HumanName**, **Address**, **ContactPoint**: typed data elements.
- **Extensions:** the official way to add data the base spec does not have, such as the US Core race and ethnicity
  extensions. Each extension is identified by a URL.
- **Profiles** (StructureDefinitions) constrain resources for a use case: required fields, must-support elements,
  bound value sets. **Implementation Guides** (IGs) bundle profiles: **US Core** for US clinical data, **CARIN Blue
  Button** for payer claims data, **Da Vinci** (CRD, DTR, PAS) for payer–provider workflows like prior authorisation.

### Resources you should be able to name

| Area | Resources |
|---|---|
| People and organisations | Patient, Practitioner, PractitionerRole, Organization, Location, RelatedPerson |
| Clinical | Encounter, Condition, Observation, DiagnosticReport, Procedure, AllergyIntolerance, Immunization, CarePlan |
| Medications | Medication, MedicationRequest, MedicationDispense, MedicationStatement |
| Documents | DocumentReference, Composition, Binary |
| Financial / payer | Coverage, Claim, ClaimResponse, **ExplanationOfBenefit**, CoverageEligibilityRequest/Response |
| Scheduling | Appointment, Schedule, Slot |
| Infrastructure | Bundle, OperationOutcome, CapabilityStatement, Provenance, AuditEvent, Consent |
| Terminology | CodeSystem, ValueSet, ConceptMap |

### The REST API

```http
GET    [base]/Patient/pat-123                       read
GET    [base]/Patient/pat-123/_history/2            version read
POST   [base]/Patient                               create (server assigns the id)
PUT    [base]/Patient/pat-123                       update (send If-Match: W/"3" for optimistic locking)
PATCH  [base]/Patient/pat-123                       patch
DELETE [base]/Patient/pat-123                       delete
GET    [base]/Patient?family=doe&birthdate=ge1960-01-01&_count=50     search → Bundle (searchset)
GET    [base]/Observation?patient=pat-123&code=http://loinc.org|4548-4&_sort=-date
GET    [base]/Encounter?patient=pat-123&_include=Encounter:practitioner
GET    [base]/Patient/pat-123/$everything           operation: the whole record
GET    [base]/metadata                              CapabilityStatement: what this server supports
POST   [base]                                       a transaction or batch Bundle
```

Search details worth knowing: **token** parameters use `system|code`; date prefixes are `eq`, `ne`, `gt`, `lt`,
`ge`, `le`; modifiers include `:exact`, `:contains` and `:missing`; **chaining** uses `subject:Patient.name=doe`;
`_include` and `_revinclude` pull in related resources; `_elements` and `_summary` trim the payload. Results come
back as a paged Bundle with a `next` link. Errors return an **OperationOutcome**. The media type is
`application/fhir+json`.

**Bundle types:** `searchset` (search results), `transaction` (all succeed or none do), `batch` (each entry runs on
its own), `document` (a Composition plus its contents), `message`, `collection` and `history`.

Paging through a search is the most common client task. Here it is with `httpx`, tested against a fake server:

```python
from collections.abc import Iterator

import httpx

BASE = "https://fhir.example.org/r4"


def bundle(ids: list[str], next_url: str | None) -> dict:
    links = [{"relation": "next", "url": next_url}] if next_url else []
    return {
        "resourceType": "Bundle", "type": "searchset", "link": links,
        "entry": [{"fullUrl": f"{BASE}/Patient/{i}", "resource": {"resourceType": "Patient", "id": i}} for i in ids],
    }


PAGES = {
    f"{BASE}/Patient?family=doe&_count=2": bundle(["1", "2"], f"{BASE}/Patient?family=doe&_count=2&_page=2"),
    f"{BASE}/Patient?family=doe&_count=2&_page=2": bundle(["3"], None),
}


def fake_server(request: httpx.Request) -> httpx.Response:
    assert request.headers["Accept"] == "application/fhir+json"
    assert request.headers["Authorization"].startswith("Bearer ")
    return httpx.Response(200, json=PAGES[str(request.url)])


def search(client: httpx.Client, url: str) -> Iterator[dict]:
    """Yield every resource in a FHIR search, following the Bundle's next links."""
    next_url: str | None = url
    while next_url:
        response = client.get(next_url)
        response.raise_for_status()
        page = response.json()
        for entry in page.get("entry", []):
            yield entry["resource"]
        next_url = next((link["url"] for link in page.get("link", []) if link["relation"] == "next"), None)


client = httpx.Client(
    transport=httpx.MockTransport(fake_server),
    headers={"Accept": "application/fhir+json", "Authorization": "Bearer test-token"},
)
assert [p["id"] for p in search(client, f"{BASE}/Patient?family=doe&_count=2")] == ["1", "2", "3"]
```

A generator keeps memory flat, however many pages there are. In production you would add retries with backoff on
429 and 5xx responses, and a token refresh.

### SMART on FHIR, Bulk Data and CDS Hooks

- **SMART App Launch** is a profile of **OAuth 2.0 and OpenID Connect** for FHIR apps. *EHR launch*: the app opens
  inside the EHR with a launch context (the current patient and encounter). *Standalone launch*: the app starts on its own
  and asks the user to pick a patient. Scopes look like `patient/Observation.read` (v1) or `patient/Observation.rs`
  (v2: c, r, u, d, s for create, read, update, delete, search), plus `launch/patient`, `openid fhirUser` and
  `offline_access`. SMART v2 requires PKCE. Servers publish their endpoints at `/.well-known/smart-configuration`.
- **SMART Backend Services:** system-to-system access with no user. It uses the OAuth client credentials grant
  with a JWT signed by the client's private key, and scopes like `system/Patient.rs`.
- **Bulk Data (Flat FHIR):** `GET [base]/Group/{id}/$export` with `Prefer: respond-async` returns `202 Accepted`
  and a status URL to poll. The output is NDJSON files, one resource per line. Used for population analytics and
  payer data exchange.
- **CDS Hooks:** the EHR calls your decision-support service at moments like `patient-view` and `order-sign`. You
  return **cards** (info, warning or critical) with suggestions or links to launch a SMART app.

## Code sets: the right vocabulary for each field

| Code set | Codes what | Owner | Example | FHIR system URI |
|---|---|---|---|---|
| **ICD-10-CM** | Diagnoses (US) | CDC/NCHS (CMS for administration) | `E11.9` type 2 diabetes without complications | `http://hl7.org/fhir/sid/icd-10-cm` |
| **ICD-10-PCS** | Inpatient hospital procedures (7 characters) | CMS | (facility claims only) | `http://www.cms.gov/Medicare/Coding/ICD10` |
| **CPT** | Professional services and procedures (5 characters) | AMA | `99213` office visit, established patient | `http://www.ama-assn.org/go/cpt` |
| **HCPCS Level II** | Supplies, equipment, drugs, ambulance (letter + 4 digits) | CMS | J-codes for injectable drugs | `https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets` |
| **LOINC** | Lab tests and clinical observations | Regenstrief Institute | `4548-4` hemoglobin A1c, `2345-7` glucose | `http://loinc.org` |
| **SNOMED CT** | Clinical terms: problems, findings, procedures | SNOMED International | `44054006` type 2 diabetes mellitus | `http://snomed.info/sct` |
| **RxNorm** | Normalised clinical drug names | NLM | RxCUI concepts | `http://www.nlm.nih.gov/research/umls/rxnorm` |
| **NDC** | Drug packages | FDA | 10 digits (4-4-2, 5-3-2, 5-4-1); 11-digit 5-4-2 on claims | `http://hl7.org/fhir/sid/ndc` |
| **NPI** | Providers (people and organisations) | CMS (NPPES) | 10 digits with a Luhn check digit | `http://hl7.org/fhir/sid/us-npi` |
| **CVX** | Vaccines | CDC | | `http://hl7.org/fhir/sid/cvx` |
| **UCUM** | Units of measure | Regenstrief | `mg/dL`, `%` | `http://unitsofmeasure.org` |
| **MS-DRG** | Inpatient payment groups | CMS | | |

The quick way to remember them: **diagnosis → ICD-10-CM; what the doctor did → CPT/HCPCS (ICD-10-PCS for
inpatient facility claims); lab test → LOINC; clinical problem list → SNOMED CT; drug → RxNorm (NDC for the
package on the claim); provider → NPI.** Terminology services (CodeSystem, ValueSet and ConceptMap with operations
such as `$expand`, `$validate-code` and `$translate`) handle lookups and mappings between them.

## Interoperability regulations

- **21st Century Cures Act (2016)** and ONC's 2020 Cures Act Final Rule: certified EHRs must offer standardised FHIR
  R4 APIs (US Core, SMART App Launch, Bulk Data), and **information blocking** is prohibited. Providers, health IT
  developers and HIEs may not interfere with access to electronic health information, except under defined
  exceptions such as privacy, security, preventing harm and infeasibility.
- **USCDI** (United States Core Data for Interoperability) defines the minimum data classes certified systems must
  exchange. ONC's HTI-1 rule moved certified health IT to USCDI v3 from January 2026.
- **CMS Interoperability and Patient Access rule (CMS-9115-F, 2020):** Medicare Advantage, Medicaid, CHIP and
  federal Marketplace plans must offer a **Patient Access API** (claims and clinical data through FHIR, using CARIN
  Blue Button and US Core). Medicare Advantage, Medicaid and CHIP must also offer a Provider Directory API.
- **CMS Interoperability and Prior Authorization rule (CMS-0057-F, 2024):** prior-authorisation decisions within **72
  hours (expedited)** and **7 calendar days (standard)**, with specific denial reasons, from January 2026. The Provider
  Access, Payer-to-Payer and **Prior Authorization APIs** (built on the Da Vinci IGs) are due in January 2027. The
  details are in the payer workflows chapter.
- **TEFCA** (Trusted Exchange Framework and Common Agreement): a national network of networks run through
  **QHINs** (Qualified Health Information Networks), live since December 2023. It sits alongside existing networks
  such as Carequality, CommonWell and regional HIEs.

## Interview questions

### What does an HL7 v2 message look like, and how do you parse it? {core}

It is pipe-delimited text: segments separated by carriage returns, each starting with a three-letter ID such as MSH,
PID, PV1 or OBX. Fields are split by `|`, components by `^`, repetitions by `~` and subcomponents by `&`, and `\` is
the escape character. Read the actual delimiters from MSH-1 and MSH-2 rather than hard-coding them.

To parse it, split on `\r`, then on the field separator, and handle the MSH quirk: the separator itself is MSH-1, so
indexes in MSH are shifted by one. In production I would use an interface engine or a library (for example `hl7apy`
or `python-hl7` in Python, HAPI in Java), but I can write a correct minimal parser on a whiteboard.

### Walk me through MSH, PID, PV1 and OBX. {core}

MSH is the header: sending and receiving application and facility, timestamp, message type in MSH-9 (such as
`ADT^A01`), control ID in MSH-10 (used for the ACK and for de-duplication) and version in MSH-12. PID is the
patient: PID-3 the identifier list (MRN and member IDs, each with an assigning authority and type), PID-5 the name,
PID-7 the birth date, PID-8 the sex, PID-11 the address. PV1 is the visit: patient class (inpatient, outpatient,
emergency), location, attending doctor, visit number.

OBX carries one result: the code in OBX-3 (usually LOINC), the value in OBX-5, units in OBX-6, reference range in OBX-7,
abnormal flag in OBX-8, and result status in OBX-11 (final, preliminary or corrected).

### What are ADT, ORM and ORU messages? Name some trigger events. {core}

ADT messages keep patient and visit data in sync: A01 admit, A02 transfer, A03 discharge, A04 register an outpatient,
A08 update patient information, A40 merge two patient records. ORM (or OML in newer versions) carries orders, and ORU^R01
carries results such as lab values. Others: SIU for scheduling, MDM for documents, DFT for charges, VXU for immunisations.

A typical lab flow is: ADT^A04 registers the patient, ORM^O01 places the lab order, the lab returns ORU^R01 results,
and each message gets an ACK.

### How do acknowledgments and MLLP work?

MLLP wraps each message on a TCP connection with a start byte (0x0B) and end bytes (0x1C 0x0D). The receiver replies
with an ACK message whose MSA segment has AA (accepted), AE (error: the message was understood but failed processing)
or AR (rejected, for example an unsupported message type or a bad header), plus the original control ID. The sender
usually waits for the ACK before sending the next message, which preserves order.

On AE or AR, the message goes to an error queue for a person to look at, rather than blocking the feed. Senders resend
when no ACK arrives, so receivers must be idempotent on MSH-10.

### What is FHIR, and how is it different from HL7 v2? {core}

FHIR models healthcare data as resources (Patient, Encounter, Observation, Claim…) exposed through a RESTful API in
JSON or XML, using web standards: HTTP verbs, OAuth 2.0, JSON. HL7 v2 is event-driven messaging: it pushes messages
when something happens, over MLLP, with lots of site-specific variation.

So v2 answers "tell me when something happens" inside a hospital, while FHIR answers "let me query or update this data"
across organisations and apps. They coexist: hospitals still run v2 feeds internally and expose FHIR APIs at the edge,
often converting v2 to FHIR in an integration layer. FHIR also supports messaging and subscriptions, but REST is how it
is mainly used.

### What is a FHIR resource, and what are its key parts? {core}

A resource is the smallest exchangeable unit with its own identity: it has a `resourceType`, a server-assigned `id`, and
`meta` (versionId, lastUpdated, profiles). It also has a human-readable narrative (`text`), extensions, and its data
elements. Resources link to each other through References, such as Observation.subject → Patient/123.

The data types to know are **Identifier** (system + value, because a patient has many IDs), **CodeableConcept** (one or
more codings from systems like LOINC or SNOMED, plus text), **Reference**, **Quantity** and **Period**. Base resources
are deliberately general, and profiles like US Core constrain them for a use case.

### Explain the FHIR REST interactions and give a search example. {core}

Read is `GET /Patient/123`; version read is `/_history/2`; create is `POST /Patient`; update is `PUT /Patient/123`
(with `If-Match` on the ETag for optimistic locking); then patch and delete. Search is
`GET /Observation?patient=123&code=http://loinc.org|4548-4&date=ge2026-01-01&_sort=-date&_count=50`,
which returns a searchset Bundle with paging links.

Other useful pieces: `_include` and `_revinclude` to pull in related resources, chained searches like
`subject:Patient.name=doe`, `$everything` on a patient, `/metadata` for the CapabilityStatement, and a transaction
Bundle POSTed to the base URL for atomic multi-resource writes.

### What is a Bundle, and when would you use transaction versus batch?

A Bundle is a container of resources. A searchset holds search results. A **transaction** is processed atomically:
every entry succeeds or none do, and entries can reference each other using temporary `urn:uuid:` fullUrls that the
server rewrites to real IDs. A **batch** processes each entry independently and returns a status for each one.

Use a transaction when the resources only make sense together, for example a Patient, an Encounter and their
Observations converted from one ORU message. Use a batch for bulk independent loads, where one bad record should not
reject the rest.

### What is SMART on FHIR? {core}

SMART on FHIR is the security and launch framework for FHIR apps, built on OAuth 2.0 and OpenID Connect. An app is
registered with the EHR's authorisation server and requests scopes such as `patient/Observation.rs` or
`user/Patient.read`. It gets an access token plus launch context: which patient and encounter the user is working
on. EHR launch starts the app inside the EHR; standalone launch has the user pick a patient. SMART v2 requires PKCE.

For system-to-system work, such as nightly Bulk Data exports, SMART Backend Services uses the client credentials grant
with a JWT signed by the client's private key, and `system/` scopes.

**Your angle:** the token side is familiar: I used JWT/OAuth2 at Medidata and SAML at Quantiphi. SMART is OAuth with
healthcare launch context and scopes on top.

### What are profiles, US Core and implementation guides?

Base FHIR resources are deliberately loose. A **profile** (a StructureDefinition) constrains a resource for a use case:
which fields are required or must be supported, which value sets the codes must come from, which extensions are
allowed. An **implementation guide** packages profiles, value sets and rules. **US Core** is the US baseline for
clinical data and is required for certified EHR APIs. **CARIN Blue Button** covers payer claims data
(ExplanationOfBenefit) for the CMS Patient Access API. The **Da Vinci** guides cover payer–provider workflows: CRD,
DTR and PAS for prior authorisation, and PDex for payer data exchange. You validate resources against the profiles you
claim to support.

### Which code set would you use for a diagnosis, a procedure, a lab test, a drug and a provider? {core}

Diagnosis: ICD-10-CM on claims and SNOMED CT in clinical problem lists. Procedure: CPT or HCPCS Level II for
professional and outpatient services, and ICD-10-PCS for inpatient facility procedures. Lab test or clinical
observation: LOINC, with units in UCUM. Drug: RxNorm clinically, NDC for the specific package on pharmacy claims.
Provider: the 10-digit NPI. Also useful: CVX for vaccines, MS-DRG for inpatient payment, and taxonomy codes for provider
specialty.

**Your angle:** utilisation management, appeals and claims (your Molina work) are built on exactly these codes:
ICD-10 diagnoses and CPT/HCPCS services on authorisation requests and claims. Go only as deep as you actually worked
with them.

### What are the Cures Act, information blocking and the CMS interoperability rules? {core}

The 21st Century Cures Act and ONC's 2020 final rule require certified EHRs to offer standard FHIR R4 APIs (US Core,
SMART, Bulk Data), and prohibit information blocking: practices that interfere with access to or exchange of electronic
health information, except under defined exceptions such as privacy, security, harm prevention and infeasibility. On the payer side, CMS's
2020 Patient Access rule required Medicare Advantage, Medicaid, CHIP and federal Marketplace plans to offer a FHIR
Patient Access API, and all but the Marketplace plans to offer a provider directory API.

CMS-0057-F, from 2024, adds prior-authorisation decision deadlines from 2026 (72 hours expedited, 7 calendar days standard)
and Provider Access, Payer-to-Payer and Prior Authorization FHIR APIs by 2027. For a Medicaid plan like Molina, that is a
major engineering programme.

### How would you design an HL7 v2 to FHIR integration pipeline? {deep}

Receive v2 over MLLP in an interface engine or a managed endpoint, persist the raw message first (for replay and audit),
and ACK quickly. Put it on a queue partitioned by patient, so each patient's messages stay in order. A transformer
maps segments to resources: PID to Patient, PV1 to Encounter, OBX to Observation. Terminology mapping translates local
codes to LOINC or SNOMED through ConceptMaps. The transformer writes a transaction Bundle to the FHIR server, using
conditional updates on business identifiers (`PUT Patient?identifier=system|MRN12345`), so a replayed message does not
create duplicates.

Add a dead-letter queue for mapping failures, monitoring of message lag and error rates, and patient-merge
handling (ADT^A40). On GCP, the Cloud Healthcare API gives you an HL7v2 store, a FHIR store and Pub/Sub notifications;
Azure Health Data Services offers a FHIR service with conversion templates.

**Your angle:** the LDH Document AI pipeline had the same shape: event-driven ingestion, transformation and validation,
human review for exceptions, then submission to an external API.

### How do patient identity and matching work without a national patient ID? {deep}

The US has no national patient identifier, so each organisation issues its own MRN, and each plan its own member ID. An
**Enterprise Master Patient Index (EMPI)** links records using deterministic rules (exact SSN plus DOB) and
probabilistic matching: weighted comparisons of name, DOB, sex, address and phone, with nickname and typo handling.
Scores above a threshold auto-link, a grey zone goes to a person for review, and below that the records stay separate.
In FHIR, Patient.identifier holds all the known IDs, `link` connects duplicates, and the `$match` operation asks a
server for candidates. False merges are worse than missed links, because they mix two people's clinical data.

### How does FHIR handle versioning and concurrent updates? {deep}

Every change creates a new version; `meta.versionId` and the `ETag` header expose it, and `_history` returns past
versions. For optimistic locking, the client sends `If-Match: W/"3"` on a PUT, and the server rejects it with 412
Precondition Failed if someone else has already written version 4. Conditional create (`If-None-Exist`) and conditional
update on identifiers make writes idempotent, which matters for retried messages.

### What is the difference between FHIR R4 and R5, and why do most systems use R4? {deep}

R4 was the first release with normative (stable, backward-compatible) content, including Patient and Observation, and
it is the version US regulations name: ONC certification, US Core, CARIN, and the Da Vinci guides that CMS-0057-F
points to. R5 (2023) improved subscriptions, added resources and refined others, but the regulatory ecosystem and most
vendors stay on R4, with R4B as a minor update. In an interview, say: build on R4 and US Core unless a partner
specifically needs R5 features.

### What is FHIR Bulk Data, and when would you use it? {deep}

It exports large populations instead of paging through searches. You call `$export` at the system, Patient or Group
level with `Prefer: respond-async`. The server returns 202 with a status URL, you poll it, and you download NDJSON files
(one resource per line), usually authorised with SMART Backend Services. Use it for analytics and ML feature pipelines,
payer-to-payer exchange, quality measures and loading a data warehouse. NDJSON streams line by line into Spark,
BigQuery or pandas in chunks.

### What are CDS Hooks? {deep}

CDS Hooks is a standard for calling external clinical decision support from inside the EHR workflow. At defined hooks
(`patient-view`, `order-select`, `order-sign`, `appointment-book`, `encounter-discharge`) the EHR POSTs context to your
service, often with prefetched FHIR data. You reply within a tight time budget with cards: info, warning or critical,
with suggestions or links to launch a SMART app. Example: at order-sign for an imaging study, return a card saying the
plan requires prior authorisation, with a link to the Da Vinci DTR questionnaire.

### What is C-CDA, and how does it relate to FHIR? {deep}

Consolidated CDA is a set of XML document templates based on HL7 v3: Continuity of Care Document, Discharge Summary,
Referral Note and others. Each document has a human-readable section and coded entries. It is widely used for
transitions of care and HIE document exchange, and is still part of EHR certification. FHIR's equivalent is a `document`
Bundle, with a Composition followed by the referenced resources. Mapping C-CDA to FHIR is a common integration task, and
HL7 publishes a C-CDA on FHIR guide.

### How would you validate FHIR resources in Python? {deep}

There are three layers. Structural: parse into typed models. The `fhir.resources` package provides Pydantic models for
FHIR resources, or I write a small Pydantic model for the subset my service uses. Profile conformance: run the HL7
validator (Java) or call the server's `$validate` operation against US Core or the IG's profiles in CI and at ingestion.
Business rules: domain checks such as "an Observation must reference an existing Patient" or "the code must come from
this value set", using terminology operations like `$validate-code`.

```python
from datetime import date
from typing import Literal

from pydantic import BaseModel, ValidationError


class HumanName(BaseModel):
    family: str
    given: list[str] = []


class Patient(BaseModel):
    resourceType: Literal["Patient"]
    id: str | None = None
    name: list[HumanName]
    gender: Literal["male", "female", "other", "unknown"] | None = None
    birthDate: date | None = None


ok = Patient.model_validate({"resourceType": "Patient", "name": [{"family": "Doe", "given": ["Jane"]}],
                             "gender": "female", "birthDate": "1961-03-15"})
assert ok.birthDate == date(1961, 3, 15)

try:
    Patient.model_validate({"resourceType": "Patient", "name": [], "gender": "F"})
except ValidationError as e:
    assert e.errors()[0]["loc"] == ("gender",)
else:
    raise AssertionError("'F' is a v2 code, not a FHIR gender")
```

**Your angle:** the same pattern was the quality gate on the Medicaid Document AI platform: Pydantic schemas validated
ML-extracted fields before human review.

### What is DICOM, and where does it fit? {deep}

DICOM is the standard for medical imaging: it is both a file format, with pixel data and a header of tags such as
patient, study, series and modality, and a network protocol. Images live in PACS. DICOMweb (QIDO-RS for search, WADO-RS
for retrieval, STOW-RS for storing) brings it to REST. FHIR references imaging through ImagingStudy and
DiagnosticReport, and medical-imaging AI pipelines read DICOM. It matters for medtech clients, and both Google Cloud
Healthcare API and Azure Health Data Services offer DICOM stores.

## Coding problems

### Parse an HL7 v2 message {medium core}

Write a parser that turns an HL7 v2 message into an object with a `get(segment, field, component=None, repetition=0)`
method. Field numbers must follow the HL7 numbering, including the MSH quirk. Read the delimiters from the message
itself. Missing fields return `""`.

```text
get("MSH", 9)           → "ADT^A01^ADT_A01"
get("MSH", 9, 2)        → "A01"
get("PID", 5, 1)        → "DOE"
get("PID", 3, 1, 1)     → "M998877"     (second repetition, first component)
```

#### Hints

1. Split the message into segments on `\r` (accept `\n` too), and fields on the separator in position 3 of the MSH line.
2. For MSH, insert the field separator as field 1 so that `fields[n]` is MSH-*n* for every segment.
3. Components and repetitions use the characters in MSH-2: `^`, `~`, `\`, `&`. Components are 1-based in HL7.

#### Solution

Store each segment as a list of fields, and make MSH line up with the others by putting the separator back in as
field 1. Keep repeated segments (several OBX lines) in a list.

```python
from collections import defaultdict


class HL7Message:
    def __init__(self, raw: str) -> None:
        lines = [line for line in raw.replace("\n", "\r").split("\r") if line.strip()]
        if not lines or not lines[0].startswith("MSH"):
            raise ValueError("message must start with MSH")
        self.field_sep = lines[0][3]
        enc = lines[0].split(self.field_sep)[1]
        self.comp_sep, self.rep_sep = enc[0], enc[1]
        self.segments: dict[str, list[list[str]]] = defaultdict(list)
        for line in lines:
            parts = line.split(self.field_sep)
            if parts[0] == "MSH":
                parts = ["MSH", self.field_sep, *parts[1:]]   # MSH-1 is the separator itself
            self.segments[parts[0]].append(parts)

    def get(self, segment: str, field: int, component: int | None = None, repetition: int = 0, index: int = 0) -> str:
        rows = self.segments.get(segment, [])
        if index >= len(rows) or field >= len(rows[index]):
            return ""
        value = rows[index][field]
        if segment == "MSH" and field in (1, 2):
            return value                                   # never split the delimiters themselves
        reps = value.split(self.rep_sep)
        if repetition >= len(reps):
            return ""
        value = reps[repetition]
        if component is None:
            return value
        comps = value.split(self.comp_sep)
        return comps[component - 1] if component <= len(comps) else ""


RAW = "\r".join([
    r"MSH|^~\&|EHR|HOSP|LAB|LABFAC|20261013083000||ADT^A01^ADT_A01|MSG00001|P|2.5.1",
    "EVN|A01|20261013083000",
    "PID|1||MRN12345^^^HOSP^MR~M998877^^^PLAN^MB||DOE^JANE^Q||19610315|F|||123 MAIN ST^^IRVINE^CA^92620||(562)555-0100",
    "PV1|1|I|4W^401^A^HOSP||||1234567893^SMITH^JOHN",
])
msg = HL7Message(RAW)
assert msg.get("MSH", 1) == "|" and msg.get("MSH", 2) == r"^~\&"
assert msg.get("MSH", 3) == "EHR"
assert msg.get("MSH", 9) == "ADT^A01^ADT_A01"
assert msg.get("MSH", 9, 2) == "A01"
assert msg.get("MSH", 10) == "MSG00001" and msg.get("MSH", 12) == "2.5.1"
assert msg.get("PID", 3, 1) == "MRN12345"
assert msg.get("PID", 3, 1, repetition=1) == "M998877"
assert msg.get("PID", 5, 1) == "DOE" and msg.get("PID", 5, 2) == "JANE"
assert msg.get("PID", 7) == "19610315" and msg.get("PID", 8) == "F"
assert msg.get("PV1", 2) == "I" and msg.get("PV1", 7, 2) == "SMITH"
assert msg.get("PID", 30) == "" and msg.get("OBX", 5) == "" and msg.get("PID", 5, 9) == ""
assert HL7Message(RAW.replace("\r", "\n")).get("PID", 5, 1) == "DOE"   # tolerate \n
```

Complexity: O(n) to parse a message of length n; each `get` is O(length of the field).

#### Follow-ups

- **Escape sequences?** `\F\`, `\S\`, `\R\`, `\T\` and `\E\` stand for the field, component, repetition,
  subcomponent and escape characters inside data. Unescape after splitting, never before.
- **Would you write this in production?** No: use an interface engine or a library (`hl7apy`, `python-hl7`, HAPI), and
  keep the raw message. The point is understanding the structure.

### Map an HL7 v2 PID segment to a FHIR Patient {medium core}

Using the message from the previous problem, build a FHIR R4 Patient dict: an MRN identifier (`type` code `MR`,
`system` `http://hospital.example.org/mrn`), the name with family and given names, gender mapped from v2 (F → female,
M → male, O → other, U and anything else → unknown), `birthDate` in `YYYY-MM-DD`, the address and the home phone. Leave
out elements that are empty rather than writing empty strings.

#### Hints

1. Work field by field from a small `get(field, component)` helper over the split PID line.
2. HL7 dates are `YYYYMMDD[HHMM…]`; FHIR `birthDate` is `YYYY-MM-DD`. Slice, then validate with `date.fromisoformat`.
3. Build lists only when there is data. FHIR forbids empty strings and empty arrays.

#### Solution

```python
from datetime import date

PID = "PID|1||MRN12345^^^HOSP^MR~M998877^^^PLAN^MB||DOE^JANE^Q||19610315|F|||123 MAIN ST^^IRVINE^CA^92620||(562)555-0100"
GENDER = {"F": "female", "M": "male", "O": "other", "U": "unknown"}
TYPE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0203"


def pid_to_patient(pid_line: str) -> dict:
    fields = pid_line.split("|")

    def get(n: int, comp: int = 1, rep: int = 0) -> str:
        if n >= len(fields):
            return ""
        reps = fields[n].split("~")
        if rep >= len(reps):
            return ""
        parts = reps[rep].split("^")
        return parts[comp - 1] if comp <= len(parts) else ""

    patient: dict = {"resourceType": "Patient"}

    identifiers = []
    for rep in range(len(fields[3].split("~")) if len(fields) > 3 else 0):
        if get(3, 5, rep) == "MR":
            identifiers.append({
                "type": {"coding": [{"system": TYPE_SYSTEM, "code": "MR"}]},
                "system": "http://hospital.example.org/mrn",
                "value": get(3, 1, rep),
            })
    if identifiers:
        patient["identifier"] = identifiers

    family, given = get(5, 1), [g for g in (get(5, 2), get(5, 3)) if g]
    if family or given:
        patient["name"] = [{k: v for k, v in (("family", family), ("given", given)) if v}]

    patient["gender"] = GENDER.get(get(8), "unknown")

    if raw_dob := get(7):
        patient["birthDate"] = date.fromisoformat(f"{raw_dob[:4]}-{raw_dob[4:6]}-{raw_dob[6:8]}").isoformat()

    address = {"line": [get(11, 1)] if get(11, 1) else [], "city": get(11, 3), "state": get(11, 4), "postalCode": get(11, 5)}
    address = {k: v for k, v in address.items() if v}
    if address:
        patient["address"] = [address]

    if phone := get(13):
        patient["telecom"] = [{"system": "phone", "value": phone, "use": "home"}]
    return patient


assert pid_to_patient(PID) == {
    "resourceType": "Patient",
    "identifier": [{"type": {"coding": [{"system": TYPE_SYSTEM, "code": "MR"}]},
                    "system": "http://hospital.example.org/mrn", "value": "MRN12345"}],
    "name": [{"family": "DOE", "given": ["JANE", "Q"]}],
    "gender": "female",
    "birthDate": "1961-03-15",
    "address": [{"line": ["123 MAIN ST"], "city": "IRVINE", "state": "CA", "postalCode": "92620"}],
    "telecom": [{"system": "phone", "value": "(562)555-0100", "use": "home"}],
}
sparse = pid_to_patient("PID|1||||SMITH||||X")
assert sparse == {"resourceType": "Patient", "name": [{"family": "SMITH"}], "gender": "unknown"}
```

Complexity: O(length of the segment).

#### Follow-ups

- **Where do the mapping rules come from?** HL7 publishes a v2-to-FHIR implementation guide with segment and
  table mappings. Teams usually encode the rules as templates (Liquid templates in Azure's converter, or engine
  mappings) rather than hand-written code.
- **What about the member ID in the second repetition?** It is the health plan's identifier. It is better carried
  on a `Coverage` resource (`Coverage.subscriberId`, or an identifier with type `MB`) than as another hospital ID.

### Build an ACK for a received message {easy}

Given a parsed message's MSH fields, write `build_ack(msh, code, control_id, now)` that returns an ACK: the sending and
receiving application and facility swapped, message type `ACK^<trigger>^ACK`, a new control ID, the same processing ID
and version, and an `MSA|<code>|<original control id>` segment. For code `AE` or `AR`, add an
`ERR|||<error code>^<text>` segment when an error is given. Segments are joined with `\r`.

#### Hints

1. Original fields: MSH-3/4 are the sender and MSH-5/6 the receiver. In the ACK they swap.
2. MSA-2 echoes the *original* MSH-10, which is how the sender matches the ACK to its message.

#### Solution

```python
def build_ack(msh: list[str], code: str, control_id: str, now: str, error: tuple[str, str] | None = None) -> str:
    """msh is the original MSH line split on '|' (index n = MSH-(n+1))."""
    send_app, send_fac, recv_app, recv_fac = msh[2], msh[3], msh[4], msh[5]
    trigger = msh[8].split("^")[1] if "^" in msh[8] else ""
    original_id, processing, version = msh[9], msh[10], msh[11]
    segments = [
        "|".join(["MSH", msh[1], recv_app, recv_fac, send_app, send_fac, now, "",
                  f"ACK^{trigger}^ACK", control_id, processing, version]),
        f"MSA|{code}|{original_id}",
    ]
    if code in ("AE", "AR") and error:
        segments.append(f"ERR|||{error[0]}^{error[1]}")
    return "\r".join(segments)


msh = r"MSH|^~\&|EHR|HOSP|LAB|LABFAC|20261013083000||ADT^A01^ADT_A01|MSG00001|P|2.5.1".split("|")
ack = build_ack(msh, "AA", "ACK00001", "20261013083001")
assert ack == (
    r"MSH|^~\&|LAB|LABFAC|EHR|HOSP|20261013083001||ACK^A01^ACK|ACK00001|P|2.5.1" + "\rMSA|AA|MSG00001"
)
nack = build_ack(msh, "AE", "ACK00002", "20261013083002", ("101", "Required field missing PID-3"))
assert nack.split("\r")[1:] == ["MSA|AE|MSG00001", "ERR|||101^Required field missing PID-3"]
assert build_ack(msh, "AE", "ACK00003", "20261013083003").count("\r") == 1   # no ERR without details
```

Complexity: O(1).

#### Follow-ups

- **When do you send AE versus AR?** AR for something wrong with the message itself or its header (unsupported type
  or version, unknown receiver). AE when the message is valid but processing failed (a required field missing,
  or an unknown patient).
- **Should you ACK before or after writing to the database?** ACK once the message is durably stored (raw message
  persisted or queued). Processing can happen after that, with errors routed to a work queue.

### Flag abnormal lab results from an ORU message {easy core}

Given the OBX lines of an ORU^R01 message, return a list of `(loinc_code, name, value, unit, flag)` for **final** results
whose abnormal flag is not `N` and not empty, with numeric values as `float`. Then convert each one to a FHIR
Observation `valueQuantity` with UCUM units.

```text
OBX|1|NM|2345-7^Glucose^LN||182|mg/dL|70-99|H|||F
OBX|2|NM|4548-4^Hemoglobin A1c^LN||8.2|%|4.0-5.6|H|||F
OBX|3|NM|2160-0^Creatinine^LN||0.9|mg/dL|0.6-1.2|N|||F
OBX|4|NM|2823-3^Potassium^LN||2.9|mmol/L|3.5-5.1|L|||P
```

#### Hints

1. For OBX, index n of `line.split("|")` is OBX-n: code in 3, value in 5, unit in 6, flag in 8, status in 11.
2. Only convert OBX-5 to a number when OBX-2 is `NM`.

#### Solution

```python
OBX_LINES = [
    "OBX|1|NM|2345-7^Glucose^LN||182|mg/dL|70-99|H|||F",
    "OBX|2|NM|4548-4^Hemoglobin A1c^LN||8.2|%|4.0-5.6|H|||F",
    "OBX|3|NM|2160-0^Creatinine^LN||0.9|mg/dL|0.6-1.2|N|||F",
    "OBX|4|NM|2823-3^Potassium^LN||2.9|mmol/L|3.5-5.1|L|||P",
]


def abnormal_finals(lines: list[str]) -> list[tuple[str, str, float | str, str, str]]:
    out = []
    for line in lines:
        f = line.split("|")
        f += [""] * (12 - len(f))                     # tolerate trailing empty fields being omitted
        code, name, *_ = f[3].split("^") + ["", ""]
        flag, status = f[8], f[11]
        if status != "F" or flag in ("", "N"):
            continue
        value: float | str = float(f[5]) if f[2] == "NM" else f[5]
        out.append((code, name, value, f[6], flag))
    return out


def to_observation(code: str, name: str, value: float, unit: str, flag: str) -> dict:
    return {
        "resourceType": "Observation",
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": name}]},
        "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
        "interpretation": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": flag}]}],
    }


results = abnormal_finals(OBX_LINES)
assert results == [("2345-7", "Glucose", 182.0, "mg/dL", "H"), ("4548-4", "Hemoglobin A1c", 8.2, "%", "H")]
obs = to_observation(*results[1])
assert obs["valueQuantity"] == {"value": 8.2, "unit": "%", "system": "http://unitsofmeasure.org", "code": "%"}
assert abnormal_finals(["OBX|1|NM|2345-7^Glucose^LN||95|mg/dL|70-99"]) == []   # short line, no flag
```

Complexity: O(total length of the lines).

#### Follow-ups

- **The units are not UCUM (for example `MG/DL`)?** Normalise through a units map, and do not guess. Bad units in
  clinical data are a patient-safety problem.
- **Corrected results (status C)?** Update the existing Observation (matched on order number and OBX set ID or
  code) with status `corrected`, rather than adding a duplicate.

### Validate an NPI {easy}

An NPI is 10 digits, and the last one is a Luhn check digit computed over the 9 base digits with the prefix `80840`.
In practice: double every other digit starting from the rightmost of the 9 base digits, add the digits of the
products and the undoubled digits, add 24 (which accounts for the prefix), and the check digit is
`(10 - total % 10) % 10`. Write `is_valid_npi(s)`. `"1234567893"` is valid.

#### Hints

1. Reject anything that is not exactly 10 digits before doing any arithmetic.
2. Doubling 7 gives 14, which contributes 1 + 4 = 5. A shortcut is `d * 2 - 9` when the product is over 9.

#### Solution

```python
def is_valid_npi(npi: str) -> bool:
    if len(npi) != 10 or not npi.isdigit():
        return False
    base, check = npi[:9], int(npi[9])
    total = 24                                     # the 80840 prefix's contribution
    for i, ch in enumerate(reversed(base)):
        d = int(ch)
        if i % 2 == 0:                             # rightmost base digit is doubled
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10 == check


assert is_valid_npi("1234567893")
assert not is_valid_npi("1234567890")
assert not is_valid_npi("123456789")               # too short
assert not is_valid_npi("12345678a3")
assert not is_valid_npi(" 1234567893")
```

Complexity: O(1), since the length is fixed.

#### Follow-ups

- **Does a valid check digit mean the provider exists?** No. It only catches typos. Look the NPI up in the NPPES
  registry (CMS publishes an API and a downloadable file) and check that it is active and that the taxonomy fits.

### Validate a FHIR transaction Bundle {medium}

Write `validate_bundle(bundle)` that returns a list of error strings (empty when valid) for a transaction Bundle:

- `resourceType` must be `Bundle` and `type` must be `transaction`;
- every entry needs a `resource` with a `resourceType`, and `request.method` and `request.url`;
- every `reference` anywhere inside a resource must resolve either to another entry's `fullUrl` (such as
  `urn:uuid:…`) or be a relative reference of the form `Type/id`;
- every Observation needs `status` and `code`.

#### Hints

1. Collect all `fullUrl`s first, then walk each resource.
2. References can be nested anywhere (`subject`, `performer[0]`, `extension[…]`). Write a recursive generator that
   yields every value under a `"reference"` key in dicts and lists.
3. A regex for relative references: `^[A-Z][A-Za-z]+/[A-Za-z0-9\-.]{1,64}$`.

#### Solution

```python
import re
from collections.abc import Iterator
from typing import Any

RELATIVE = re.compile(r"^[A-Z][A-Za-z]+/[A-Za-z0-9\-.]{1,64}$")


def references(node: Any) -> Iterator[str]:
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "reference" and isinstance(value, str):
                yield value
            else:
                yield from references(value)
    elif isinstance(node, list):
        for item in node:
            yield from references(item)


def validate_bundle(bundle: dict) -> list[str]:
    errors: list[str] = []
    if bundle.get("resourceType") != "Bundle":
        return ["not a Bundle"]
    if bundle.get("type") != "transaction":
        errors.append(f"type must be transaction, got {bundle.get('type')!r}")
    entries = bundle.get("entry", [])
    full_urls = {e["fullUrl"] for e in entries if "fullUrl" in e}
    for i, entry in enumerate(entries):
        resource = entry.get("resource")
        if not isinstance(resource, dict) or "resourceType" not in resource:
            errors.append(f"entry[{i}]: missing resource or resourceType")
            continue
        request = entry.get("request", {})
        if not request.get("method") or not request.get("url"):
            errors.append(f"entry[{i}]: missing request.method or request.url")
        for ref in references(resource):
            if ref not in full_urls and not RELATIVE.match(ref):
                errors.append(f"entry[{i}]: unresolved reference {ref!r}")
        if resource["resourceType"] == "Observation":
            for required in ("status", "code"):
                if required not in resource:
                    errors.append(f"entry[{i}]: Observation missing {required}")
    return errors


PATIENT_URL = "urn:uuid:7c1b0e9a-0000-4000-8000-000000000001"
good = {
    "resourceType": "Bundle", "type": "transaction",
    "entry": [
        {"fullUrl": PATIENT_URL, "resource": {"resourceType": "Patient", "name": [{"family": "Doe"}]},
         "request": {"method": "POST", "url": "Patient"}},
        {"fullUrl": "urn:uuid:7c1b0e9a-0000-4000-8000-000000000002",
         "resource": {"resourceType": "Observation", "status": "final",
                      "code": {"coding": [{"system": "http://loinc.org", "code": "4548-4"}]},
                      "subject": {"reference": PATIENT_URL},
                      "performer": [{"reference": "Practitioner/dr-smith"}]},
         "request": {"method": "POST", "url": "Observation"}},
    ],
}
assert validate_bundle(good) == []

bad = {
    "resourceType": "Bundle", "type": "batch",
    "entry": [
        {"resource": {"resourceType": "Observation", "subject": {"reference": "urn:uuid:missing"}},
         "request": {"method": "POST"}},
        {"request": {"method": "POST", "url": "Patient"}},
    ],
}
assert validate_bundle(bad) == [
    "type must be transaction, got 'batch'",
    "entry[0]: missing request.method or request.url",
    "entry[0]: unresolved reference 'urn:uuid:missing'",
    "entry[0]: Observation missing status",
    "entry[0]: Observation missing code",
    "entry[1]: missing resource or resourceType",
]
assert validate_bundle({"resourceType": "Patient"}) == ["not a Bundle"]
```

Complexity: O(total size of the Bundle): every node is visited once.

#### Follow-ups

- **Is this enough before sending it to a server?** It is a fast pre-check. The server still validates against
  profiles. Run the official HL7 validator, or `$validate`, in CI and on samples of production traffic.
- **What does the server do with the `urn:uuid` references?** In a transaction, it assigns real IDs and rewrites
  every reference to those fullUrls in the same Bundle. That is why related resources can be created in one call.
