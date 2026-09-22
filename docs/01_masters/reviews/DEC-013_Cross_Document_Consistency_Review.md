---
document_id: REV-XDOC-DEC013
title: DEC-013 Re-Baseline — Cross-Document Consistency Review
version: 1.0
document_status: APPROVED
implementation_status: N/A
module: N/A
control: Cross-document consistency evidence for the DEC-013 master re-baseline
owner: Unassigned
effective_date: 2026-09-22
last_reviewed: 2026-09-22
supersedes: none
baseline_commit: 36ea3fc
---

# DEC-013 Re-Baseline — Cross-Document Consistency Review

**Verdict: CONSISTENT. ACCEPT.**

Scope: the seven governed documents promoted for `DEC-013` — Doc 00 `v1.5`, Charter `v1.5`,
Module Index `v1.4`, SRS `v1.3`, Role Matrix `v1.3`, Workflow Map `v1.3`, System Rules `v1.3` —
plus `DECISION_LOG.md`, `DOCUMENT_REGISTER.md`, `STR-03` and `CURRENT_STATE.md`.

---

## 1. Chain integrity

| Document | Version | Base documents | Review evidence | Predecessor archived |
|---|---|---|---|---|
| Doc 00 | `v1.5` | `DEC-013`, `STR-03` | `00_..._v1.5_Review.md` | `v1.4` ✓ |
| Charter | `v1.5` | Doc 00 `v1.5` | `01_..._v1.5_Review.md` | `v1.4` ✓ |
| Module Index | `v1.4` | Doc 00 `v1.5`, Charter `v1.5` | `03_..._v1.4_Review.md` | `v1.3` ✓ |
| SRS | `v1.3` | Doc 00 `v1.5`, Charter `v1.5`, Index `v1.4` | `02_..._v1.3_Review.md` | `v1.2` ✓ |
| Role Matrix | `v1.3` | + SRS `v1.3` | `04_..._v1.3_Review.md` | `v1.2` ✓ |
| Workflow Map | `v1.3` | + Role Matrix `v1.3` | `05_..._v1.3_Review.md` | `v1.2` ✓ |
| System Rules | `v1.3` | + Workflow Map `v1.3` | `06_..._v1.3_Review.md` | `v1.2` ✓ |

Each document's Document Control block names only current base versions. Every archived
predecessor is byte-identical to its pre-move state (`git diff --name-status` reports `R100` for
all seven).

**Knowingly stale, in scope for a later turn:** masters **07–11** are `CAN WAIT` under Doc 00
§25.1 and still name `00_v1.3` / `01_v1.3` / `03_v1.2` as their base documents. This is recorded,
not overlooked.

---

## 2. The four states, traced end to end

| Concept | Doc 00 | Charter | Index | SRS | Role Matrix | Workflow | Rules |
|---|---|---|---|---|---|---|---|
| Build state | §1.D.1 | §6.4 | §5.4 | §2A | §3.7 r6 | §3.7 | `SYS-RULE-006` |
| Environment availability | §1.E | §26.1 | §5.4 | §2B | §3.8 | §3.7 r2 | `SYS-RULE-007` |
| Production activation | §1.D.3, §21 | §6.4 | §5.4 | §2A | §19A | `WF-34` | `SYS-RULE-008`, `CFG-RULE-004` |
| Product/asset eligibility | §1.D, §12A | §12A.5 | §9 | `AST-SRS-001` | §22.2 | `WF-35` | `SYS-RULE-009`, `ASSET-RULE-002` |
| Unknown → fail closed | §21 r1, §21A r5 | §26.1 r8 | §5.4 r4 | `STATE-SRS-002` | §3.7 | §3.7 r3 | **`SYS-RULE-010`** |
| Conjunctive access | §21A r2 | — | §19 r11 | `STATE-SRS-003` | **§3.7** | — | **`SYS-RULE-011`** |

**No document represents the four as one boolean.** SRS `STATE-SRS-001` and System Rules
§29 (`single_enabled_boolean = prohibited_as_sole_representation`) state the prohibition
explicitly.

---

## 3. The permanent boundary, traced end to end

The six MB-boundary capabilities plus the Exchange-domain reuse prohibition appear as a permanent,
environment-independent prohibition in every document:

| Document | Location |
|---|---|
| Doc 00 `v1.5` | §1.D.4, §6, §7.7, §20.1, §20.5 final row |
| Charter `v1.5` | §3, §6.3, §10.2A, §12.6, §12A.6 |
| Module Index `v1.4` | §13, §16A.2, §17.1, §19 rule 5A |
| SRS `v1.3` | §7 constraints 1–6, `SPT-SRS-004`/`017`/`018`, `EXG-SRS-101`…`106`, §19.1 |
| Role Matrix `v1.3` | §5.4, §19 rule 2, §20 rule 9, §22.1, §27 |
| Workflow Map `v1.3` | `WF-11` §15.4, `WF-29` §33.1–§33.3, `WF-33` §33D.4 |
| System Rules `v1.3` | `LIC-RULE-002`, `LIC-RULE-003`, `LIC-RULE-005`, §25, §29 |

**Verified by search:** "client-to-client" appears in all seven; "every environment" appears in
all seven. **No document conditions any of the six on an approval**, and three state explicitly
that no approval path exists (Doc 00 §6, Role Matrix §22.1 rule 4, Workflow `WF-29` §33.2).

---

## 4. The Exchange boundary, stated consistently

> *The Exchange matching engine belongs only to the securities domain and grants AIX Spot nothing.*

| Document | Statement |
|---|---|
| Doc 00 §12E.4 | Five binding rules; names every forbidden MB caller |
| Charter §12A.6 | Four binding rules |
| Module Index §16A.2, §19 rule 5A | Five rules; requires `EXO-01` to carry it as a tested invariant |
| SRS `EXG-SRS-101`…`106` | Six requirements, incl. no shared execution code |
| Role Matrix §22.1, §27 | Denied to every role; two prohibited permission codes |
| Workflow `WF-33` §33D.4 | Five rules; `WF-11` and `WF-33` never converge |
| System Rules `LIC-RULE-005` | Rule with enforcement point, two error codes, invariant test requirement |

**All seven state it holds identically in all five environments.** `EXO-01` appears in all seven.

---

## 5. Identifier discipline

| Item | Position | Stated in |
|---|---|---|
| `exchange.*` | **Frozen** as the MB-boundary prohibition namespace, permanently; not reused | Doc 00 §9A, §12E.5; Index §16A.3; SRS `EXG-SRS-106`; Rules `LIC-RULE-005` r5; `DEC-013` cl. 10 |
| `securities.token_trading` | Name unchanged; means **live securities trading in PRODUCTION**; non-production permitted against synthetic instruments only; **not permission for securities in MB Spot** | Doc 00 §9A; `DEC-013` cl. 9; `STR-03` §6 |
| `securities_market.*` | **Reserved, not seeded** | Doc 00 §12E.5; Index §16A.3; SRS `EXG-SRS-106`; Rules §29 |
| `EXCHANGE_MODULE_LOCKED` | **Retained**, meaning unchanged | Doc 00 §9A; Workflow §37; Rules §26, `LIC-RULE-002` |
| `assertNoExchangeRuntime` | **Retained**, not deleted; `MIG-001` specified, not authorised | Doc 00 §9A, §25.3; `DEC-013` cl. 8; `STR-03` §5 |
| `PROHIBITED_EXCHANGE_FRAGMENTS` | Retained unchanged, incl. the `exchange` fragment | Doc 00 §9A constraint 2 |

**No seeded identifier is renamed, deleted or added by any of the seven documents.**

---

## 6. Regulatory questions

All twenty questions carried by Doc 00 v1.4 are preserved, plus **`R6-Q1`** (external controlled
demo). Verified present across the seven: `R1-Q1b`, `R1-Q2`, `R1-Q3`, `R1-Q4`, `R3-Q1b`,
`R3-Q2b`, `R3-Q3`, `R3-Q6`, `R4-Q1`…`R4-Q7`, `R5-Q1`, `R5-Q2`, `A2-Q1`, `A2-Q2`, `R-MODEL-C`,
`R6-Q1`.

**None is answered, narrowed or softened.** Each now holds its capability's **production
activation** closed rather than its architecture — the same production effect, stated in Doc 00
§23 and `SYS-RULE-010`.

---

## 7. Module count

**37**, stated consistently in Doc 00, Charter, Module Index, SRS, Role Matrix, Workflow Map,
System Rules, `DOCUMENT_REGISTER.md` and `CURRENT_STATE.md`. Verified by unique-identifier
extraction from Module Index §6–§16A: 37 distinct codes, all 33 v1.3 codes retained unrenumbered.

---

## 8. Terminology

| Old | New | Retired consistently |
|---|---|---|
| "MB Spot Broking Terminal" | **AIX Spot** | Charter, SRS `PRD-SRS-005`, Workflow `WF-11`, Rules |
| "Future-Locked Exchange" | Permanent prohibition **or** production-gated capability | SRS §19, Role Matrix §22, Workflow `WF-29`, Index §17, Rules `LIC-RULE-002`/`002A` |
| "Locked Future Modules" incl. Market Surveillance | Surveillance is a **required control** (`SUR-01`) | Charter §12.6, SRS `SPT-SRS-014`, Index §13 |
| `NOT DESIGNED` as a status | **NO BUILD** where permanent; **BUILD** otherwise | Doc 00 §20 |
| `Future-Locked` classification label | Retired | Index §3 |

---

## 9. Scope discipline

**Out of scope, no build, no gate** — derivatives, perpetual futures, futures, margin, leverage,
lending, staking, yield/earn, DeFi yield, privacy coins, algorithmic stablecoins, MYR pairs,
self-custody. Stated in Doc 00 §20.6, Charter §6.5 / §10.2B, Index §17.3, SRS §19.4, Role Matrix
§22.3, Rules `ASSET-RULE-001` and §25.

**No document states a requirement, role, workflow or module for any of them.**

---

## 10. Repository-level verification

| Check | Result |
|---|---|
| `git diff --check` after every document | **Clean**, all eight commits |
| Files changed since baseline `b62ed89` | **`docs/` only** — 15 added, 7 renamed to archive, 2 modified |
| `platform/` changes | **None** (`git diff --stat b62ed89..HEAD -- platform/` empty) |
| Source, migrations, tests, dependencies | **None changed** |
| Runtime guards | **None modified** — `no-exchange.ts` intact at HEAD |
| Seeded identifiers | **None changed** — `securities.token_trading` present in all three seeded copies |
| Sealed CFG-01 Doc 00 hash | **Still valid** — neither hash input (licence status, prohibited-feature registry) changed |
| Archived predecessors | **Byte-identical** (`R100` for all seven) |

---

## 11. Residual items — recorded, not defects

| # | Item | Status |
|---|---|---|
| 1 | Masters **07–11** carry stale base-document rows | `CAN WAIT` per Doc 00 §25.1. Scheduled, not overlooked |
| 2 | `MIG-001`…`MIG-010` are specified but unauthorised | Deliberate. Each needs its own approved task record |
| 3 | The five `exchange.*` codes seeded `until_formal_exchange_licence_approval` contradict Doc 00 §6's STANDING classification | Recorded as `MIG-006`. The seeded data is **weaker** than the document; the document governs |
| 4 | `CFG-01` accepts, hashes and logs `environment` but never evaluates it | Recorded as `MIG-004`. **The capability-state model has no code enforcement until it lands** |
| 5 | `DOC00_SOURCE_VERSION = "v1.3"` is two versions stale | Recorded as `MIG-008`. The seal remains valid |
| 6 | `R6-Q1` is newly raised and unanswered | External DEMO exposure fails closed until answered |
| 7 | Module blueprints for the 37-module set are not written | Next phase; explicitly out of scope here |

**Item 4 is the one to carry forward.** Until `MIG-005` → `MIG-004` land, the four-state model is
**documented but not enforceable in code**: a capability can only be enabled in all five
environments or none. No capability whose production activation is gated may be enabled anywhere
until the environment dimension exists.

---

## 12. Conclusion

**CONSISTENT. ACCEPT.** The seven documents agree on the capability-state model, the environment
model, the permanent boundary, the Exchange boundary, identifier discipline, the module set, the
open regulatory questions and the out-of-scope set.

**No regulatory approval is claimed. No live regulated activity is authorised. No code,
migration, test, dependency, seeded identifier, sealed hash or runtime guard is changed.**
