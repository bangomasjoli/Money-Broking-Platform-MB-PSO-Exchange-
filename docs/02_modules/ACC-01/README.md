---
document_id: ACC-01-IDX
title: ACC-01 — Account Structure (Master Account & Subaccount)
version: N/A
document_status: DRAFT
implementation_status: NOT_STARTED
module: ACC-01
control: Master account and subaccount identity, lifecycle, legal-entity ownership
owner: Unassigned
effective_date: 2026-09-26
last_reviewed: 2026-09-26
supersedes: none
baseline_commit: 5a4f872
---

# ACC-01 — Account Structure (Master Account & Subaccount)

**Module ID:** ACC-01
**Module name:** Account Structure — Master Account & Subaccount
**Master Module Index status:** NEW (Phase C — institutional foundations; Module Index §7, §18, §19)
**Available blueprint versions:** v0.1, v0.2, v0.3, v0.4
**Authoritative blueprint version:** none — v0.1, v0.2, v0.3 and v0.4 are **planning packs**, not certified. [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) is the sole authority for blueprint version and status; this README does not decide it, and no register row has been added (out of this task's ownership — see dependency request DCR-ACC-GOV-01).
**Blueprint status:**

| Version | Status |
|---|---|
| **v0.1** | **REVIEWED / REMEDIATE** — independent review at `42316fe`, verdict REMEDIATE ([`04-review.md`](../../03_implementation/tasks/ACC-01/04-review.md)). Preserved unchanged as the reviewed historical pack |
| **v0.2** | **REVIEWED / REMEDIATE** — separate-context re-review verdict REMEDIATE ([`04-review-r2.md`](../../03_implementation/tasks/ACC-01/04-review-r2.md)); remediation record [`05-remediation.md`](../../03_implementation/tasks/ACC-01/05-remediation.md). Preserved unchanged as reviewed historical evidence |
| **v0.3** | **REVIEWED / REMEDIATE** — separate-context review verdict REMEDIATE ([`04-review-r3.md`](../../03_implementation/tasks/ACC-01/04-review-r3.md)); remediation record [`05-remediation-r2.md`](../../03_implementation/tasks/ACC-01/05-remediation-r2.md). Preserved unchanged as reviewed historical evidence |
| **v0.4** | **REMEDIATED / AWAITING RE-REVIEW** — remediates R3-F01…R3-F07 under the human decisions ACC-R3-HD-01…03, after the conductor's `HUMAN_DECISION_REQUIRED` escalation (max planning rounds reached; [`06-human-decision-r3.md`](../../03_implementation/tasks/ACC-01/06-human-decision-r3.md), [`05-remediation-r3.md`](../../03_implementation/tasks/ACC-01/05-remediation-r3.md)); **not yet re-reviewed — separate-context re-review required** |

**Nothing is accepted. Implementation is not authorised.**

**Implementation status:** NOT_STARTED — no application code, no migration, no test exists for this module.

## What ACC-01 owns

Master Account and Subaccount — nothing else. It is the **account layer between the legal entity and the ledger** (`DEC-011`), and it is **not** an identity domain and **not** a balance domain.

```txt
CLT-01 Legal Entity            (sole owner: legal entity, client identity, membership)
  → ACC-01 Master Account
      → ACC-01 Subaccount
          → LED-01 Ledger Account   (sole owner: ledger account, balances, journals, postings)
```

## Blueprint pack

Current pack: [`blueprint/v0.4/`](blueprint/v0.4/) — start at its [README](blueprint/v0.4/README.md). Historical (reviewed, REMEDIATE, unchanged): [`blueprint/v0.3/`](blueprint/v0.3/), [`blueprint/v0.2/`](blueprint/v0.2/) and [`blueprint/v0.1/`](blueprint/v0.1/).

Task record: [`../../03_implementation/tasks/ACC-01/`](../../03_implementation/tasks/ACC-01/) (`01-plan.md`, `04-review.md`, `05-remediation.md`, `04-review-r2.md`, `05-remediation-r2.md`, `04-review-r3.md`, `06-human-decision-r3.md`, `05-remediation-r3.md`, `task.json`).

## Reviews

- [`04-review.md`](../../03_implementation/tasks/ACC-01/04-review.md) — v0.1, verdict **REMEDIATE** (independent architecture/compliance review; same-session, model-level independence only).
- [`04-review-r2.md`](../../03_implementation/tasks/ACC-01/04-review-r2.md) — v0.2 (separate-context), verdict **REMEDIATE**.
- [`04-review-r3.md`](../../03_implementation/tasks/ACC-01/04-review-r3.md) — v0.3 (separate-context), verdict **REMEDIATE**.
- v0.4 — **awaiting separate-context re-review**.

## Acceptance evidence

- none — nothing is accepted.

## Open items

Dependency-change requests (`DCR-ACC-*`, classified ACC-BUILD / ACC-REAL-USE / LED-DESIGN / GO-LIVE / GOV), open questions (`OQ-*`) and human decisions are recorded in [`blueprint/v0.4/17_Dependency_Change_Requests_And_Open_Questions.md`](blueprint/v0.4/17_Dependency_Change_Requests_And_Open_Questions.md). **No dependent module has changed.** Operation of ACC-01 depends on environment-agnostic `DEP-*` prerequisites (headed by `IAM2-FIND-002` and the IAM-02 actor-binding contract), each satisfied only by behaviour verified from the owning service or by an authoritative governance record — never by configuration; two governance-only prerequisites are hard-unsatisfied until governance closes them; **environment availability belongs to CFG-01**, not ACC-01. Human decisions ACC-R3-HD-01…03 are recorded in file 17 §4.4. Findings are owned by [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md); this pack raises none itself — a human promotes.
