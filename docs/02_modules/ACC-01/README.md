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
**Available blueprint versions:** v0.1
**Authoritative blueprint version:** none — v0.1 is a **planning pack**, not certified. [DOCUMENT_REGISTER.md](../../DOCUMENT_REGISTER.md) is the sole authority for blueprint version and status; this README does not decide it, and no register row has been added (out of this task's ownership — see dependency request DCR-ACC-GOV-01).
**Blueprint status:** **PLANNED / AWAITING REVIEW**
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

Location: [`blueprint/v0.1/`](blueprint/v0.1/) — start at its [README](blueprint/v0.1/README.md).

Planning task record: [`../../03_implementation/tasks/ACC-01/`](../../03_implementation/tasks/ACC-01/) (`01-plan.md`, `task.json`).

## Reviews

- none — awaiting review.

## Acceptance evidence

- none — nothing is accepted.

## Open items

Dependency-change requests (`DCR-ACC-*`), open questions (`OQ-*`) and proposed human decisions (`HD-*`) are recorded in [`blueprint/v0.1/17_Dependency_Change_Requests_And_Open_Questions.md`](blueprint/v0.1/17_Dependency_Change_Requests_And_Open_Questions.md). Findings are owned by [OPEN_FINDINGS.md](../../OPEN_FINDINGS.md); this pack raises none itself — a human promotes.
