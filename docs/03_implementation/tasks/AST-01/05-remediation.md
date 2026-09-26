# 05 Remediation — AST-01: blueprint v1.1

- **Task ID:** AST-01
- **Status:** **REMEDIATED / AWAITING RE-REVIEW.** Nothing is accepted. **Implementation is not authorised.**
- **Remediating agent:** Claude Sonnet 5 (`claude-sonnet-5`); effort not specified in the invocation.
- **Reviewed blueprint:** v1.0 @ `78ec1e4` (kept **unchanged** — reviewed historical evidence)
- **Review:** [04-review.md](04-review.md) at `45d9a2f` — verdict **REMEDIATE**; 6 HIGH, 4 MEDIUM, 5 LOW open, F16 already fixed
- **Starting HEAD:** `45d9a2f` (branch `module/AST-01`, tree clean, `main` = `origin/main` = `43f2f34`)
- **Remediated pack:** [docs/02_modules/AST-01/blueprint/v1.1/](../../../02_modules/AST-01/blueprint/v1.1/README.md)
- **Independence note:** the remediation and the original blueprint are by the same model family, and the review it answers was produced in the same session as the v1.0 authoring. **A separate-context re-review is required** before any finding is closed. Findings below are marked *remediated*, not *closed*.

## Human decisions applied (approved by Aiman)

`AST-HD-1` fiat · `AST-HD-2` product admission · `AST-HD-3` synthetic emulation · `AST-HD-4` presumptive classes · `AST-HD-6` human holds · `AST-HD-8` SECURITY→NON_SECURITY · `AST-HD-9` granularity · `AST-HD-10` token/logging. Full text and application points: [17 §1.1](../../../02_modules/AST-01/blueprint/v1.1/17_Dependencies_And_Open_Decisions.md).

**Not silently decided.** `HD-5` (Pay treatment of security outcomes) and `HD-7` (meaning of `RWA` eligibility) were **not** in the approved package. They are recorded as **pending, non-blocking**, with their reviewed positions (`SUPPORTED WITH CORRECTION`, `SUPPORTED`) preserved and a fail-closed working default for `HD-5` only. Two further items are recorded as pending because this remediation had to choose a fail-closed working position: **P-3** (`SECURITY`/`SECURITY_TOKEN` class label + `NON_SECURITY` refused) and **P-4** (digital MYR-denominated instruments stay denied until OQ-6). None is recorded as human-approved.

## Finding map

Status vocabulary: **REMEDIATED** = corrected in v1.1 within the AST-01 boundary; **CARRY-FORWARD / EXTERNAL OWNER** = the correction needs another owner and is recorded, not implemented. A finding can be both (remediated in AST-01, with an external dependency recorded).

| Finding | Sev | Status | v1.1 location | What was done |
|---|---|---|---|---|
| **F01** MB-domain deposit path for security instruments | HIGH | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-002) | 01 §5.1, §5.3, §5.7, §5.8; 04 §6; 05 §6–7; 10 T-DER-08, T-DOM-06 | Deposit/withdrawal are **domain-scoped subjects** (`DEPOSIT_MB_PSO`, `WITHDRAWAL_MB_PSO`, `DEPOSIT_SECURITIES`, `WITHDRAWAL_SECURITIES`). Security × MB/PSO custody is `INELIGIBLE` (matrix, boot invariant, SQL backstop B1). "≥ 1 permitted product" counts only same-domain products. **WLT-01 consumer/domain contract** specified (incl. quarantine of unsolicited inbound, no ledger credit) and recorded as DCR-AST1-002 — not implemented |
| **F02** Token/verify not bound to subject/caller | HIGH | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-004) | 01 §5.8; 04 §1.1, §6.1–6.2; 05 §8.1; 10 T-DOM-* | Per-service **subject allow-list**; tokens bind instrument, subject, **domain, consumer service**, environment, **classification record id**; `verify-decision` requires authenticated consumer = token consumer, stated subject and instrument = token's, fresh re-derivation on the current record id. Cross-domain verification tested. Consumer contract → DCR-AST1-004 |
| **F03** Real instruments derive securities-route eligibility | HIGH | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-008(f)) | 01 §5.3 (⁵), §5.9; 05 §7 B5; 09; 10 T-DER-09 | Real `SECURITY` × {`RWA`, `SECONDARY_MARKET`, `SECURITIES_MARKET`, securities custody} ⇒ `NOT_ASSESSED` (`SECURITIES_ROUTE_REAL_INSTRUMENT_NOT_ASSESSED`) in every environment, per Doc 00 §12E.2/§12B/`DEC-013` cl. 9; synthetic instruments build/test the full lifecycle. Non-production classification of a real instrument is labelled provisional test data. Lifting the cell needs a Doc 00 revision |
| **F04** DB backstop trusts app-supplied columns | HIGH | **REMEDIATED** | 01 §5.5; 05 §1 (rule 6), §2, §5.1, §6, §7, §8.1; 10 T-SEC-03…06, T-SEC-12 | **`ast1.deployment_environment`** (set at bootstrap, no runtime write) and **`authoritative_state()` / `backstop_permits()`**, which read the classification **ledger**, instrument, hold and environment tables. Triggers on log, token, admission, attestation, custody, operational state. Row columns are audit copies. Admission/attestation bound to the **current** record. `PAY` and MB custody included. Backstop is coarser than the matrix, independently written, parity-tested. **Residual stated** (wrong instrument id → closed at verify) |
| **F05** No trustworthy checker identity from IAM-02 | HIGH | **REMEDIATED (claim corrected)** + **CARRY-FORWARD** (DCR-AST1-001(d)) | 01 INV-05, §4.8; 04 §3; 05 §5.1, §8; 07 §2 | Removed the claim that AST-01 verifies maker ≠ checker itself. Only **IAM-02-attested** approver identities and policy id are stored; DB constrains stored values. **Governed classification apply is disabled until DCR-AST1-001(a)+(d)**; tests use a labelled stub of the extended contract. **No IAM-02 change made** |
| **F06** Elevated-approval bypass | HIGH | **REMEDIATED** | 01 §3.9, §4.7; 05 §3, §4.1–4.2, §5.1; 10 T-SEC-10, T-CLS-09/14 | **Lineage model** (`lineage`, `lineage_merge`, asset predecessor declaration, automatic on-chain continuity incl. retired instruments, candidate surfacing). `elevated` = any real `SECURITY` record anywhere in the lineage, **computed by trigger from the ledger**; requires two attested checkers, new post-`SECURITY` evidence not reusing the old bundle, "lineage reviewed" attestation. Closes `SECURITY→UNRESOLVED→NON_SECURITY`, retire→recreate, replacement asset. **Residual AR-19** (disguised replacement) stated |
| **F07** Holds change outcome; mis-cited authority | MED | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-006) | 01 §4.6, INV-09; 02 W4; 04 §4; 05 §5.2, §8; 06 SM-4; 07 §2, §5 | Hold is a **narrowing conjunct** (`INSTRUMENT_ON_HOLD`); classification outcome unchanged; held `SECURITY` still returns the hard-rule reason. **Human hold: maker-checker**; **system integrity failure: immediate**. `SYS-RULE-008` and the kill switch cited as **precedent only**. The v1.0 "TIGHTEN may apply without approval" rule removed. Role Matrix authority → DCR-AST1-006 |
| **F08** Fiat default wrong | MED | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-008(b), OQ-6) | 01 §3.10, §5.3; 04 §2.2, §6.1, §6.4; 05 §4.2; 09; 10 T-FIA-* | Fiat = reference data, **outside the §12A API**. `evaluate` on fiat ⇒ `200 not_applicable`, `SUBJECT_NOT_APPLICABLE_FIAT`, no token — never `deny`/`INELIGIBLE`; `GET /currencies/{iso}` is the fiat surface; backstop B3 forbids any fiat `allow`. Fiat quote legs and Pay are not made impossible. MYR restriction stays a pair/product control (owner unassigned, OQ-6); digital MYR stays fail-closed (P-4) |
| **F09** Synthetic single source of truth | MED | **REMEDIATED** | 01 §4.5; 05 §1 (rule 3), §4.2, §5.1; 10 T-SYN-*, T-SCH-06 | `declared_synthetic`, `synthetic_emulates`, `instrument_code` immutable **from INSERT**; **no emulation column on the classification record**; record outcome ⇔ instrument declaration by trigger |
| **F10** Matrix not total | MED | **REMEDIATED** | 01 §5.3, §5.5; 09 (`MATRIX_CELL_NOT_DEFINED`); 10 T-DER-01/02 | Any unlisted combination ⇒ `NOT_ASSESSED`; boot invariant evaluates 5 outcome states × 10 classes × 10 subjects × 6 environments and throws on any gap, forbidden `PERMITS`, or fiat non-`NOT_APPLICABLE` |
| **F11** Rule for open regulatory questions | LOW | **REMEDIATED** | 01 §5.9; 17 §3 | Three buckets: route-membership/classification ⇒ AST-01 `NOT_ASSESSED`; operating permission ⇒ CFG-01; Doc 00-stated positions followed verbatim. Boundary cases named. Explains the RWA/secondary asymmetry |
| **F12** AST-SRS-001 field coverage | LOW | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-008(e)) | 01 §10; 05 §4.3 (`instrument_risk_profile`) | Every field mapped. Risk classification: informational `risk_tier`, not a derivation input. Listing status: `product_admission` / **EXTERNAL (`EXM-01`)**. Production activation: **READ-THROUGH, CFG-01-owned, never stored**. Client eligibility: `INVESTOR_CLASS_ONLY` vs supplied `client_class` (now used) + EXTERNAL client status |
| **F13** Attestation currency and `WF-32` sequencing | LOW | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-004(h)) | 01 §5.4, §8.6; 02 W8; 05 §6; 10 T-DER-10, T-CNJ-07 | Attestation bound to the **current** record (trigger); a later record makes it inert (`SECURITIES_MARKET_ATTESTATION_STALE`); `EXM-01` evaluates `SECONDARY_MARKET` (no attestation dependency) before admission — no circularity |
| **F14** Citations and authority map | LOW | **REMEDIATED** + **CARRY-FORWARD** (DCR-AST1-006) | 07 header, §5; 01 sources; 12 §3; 17 §4 | Role Matrix "§5.2A rule 9" → **§19 rule 9**; "§22" → **§28**; Module Index "§17" → **§19**; `SYS-RULE-008` demoted to precedent. **07 §5 maps every change kind** to a Role Matrix row (§19 rule 9, §23 "Asset approval", §23 "Asset/pair activation") or to DCR-AST1-006 where the matrix has none |
| **F15** `EXCHANGE` enum | LOW | **REMEDIATED** | 01 §5.1; 04 §1.3; 05 §6, §8.1; 10 T-BND-04; 17 §3 | Renamed **`SECURITIES_MARKET`** throughout (subject, domain, product, tables, route). No `exchange.*` or `EXCHANGE` identifier introduced; legacy MB-prohibition namespace untouched. OQ-7 resolved |
| **F16** `task.json` not conductor-valid | LOW | **CLOSED (by the review; unchanged)** | `task.json` | Remains conductor-valid (validated again below) |

## DCR status (all still recorded, none implemented)

| DCR | Change in v1.1 | Implemented? |
|---|---|---|
| 001 IAM-02 | **(d) added** — attested approver identity + policy id; (a)+(d) gate enabling governed classification apply | **No** |
| 002 WLT-01/LED-01 | **Expanded** — MB-domain-only subjects, quarantine of unsolicited inbound, no securities path | **No** |
| 003 CFG-01 | Feature-code namespace guidance (`asset_registry.*`; not `exchange.`, not `securities_market.*`) | **No** |
| 004 Consumers | **Expanded** — allow-listed subjects, bound tokens, per-attempt re-verify, fiat via reference endpoint | **No** |
| 005 Document store | Unchanged | **No** |
| 006 Role Matrix | **Broadened** — every change kind without a row; elevated two-checker rule; single-actor authority only if desired | **No** |
| 007 FND-01/`MIG-001` | Route/enum compliance recorded | **No** |
| 008 Masters | **(e), (f) added**; (b) reframed on AST-HD-1 | **No** |
| 009 Control layer | Unchanged | **No** — `DOCUMENT_REGISTER`, `CURRENT_STATE`, `MODULE_STATUS` not touched |

## task.json

Conductor-valid, **`state: "IDLE"`** (the authoritative conductor state for a task the conductor has not advanced; `PLAN_READY` is written only by the conductor's human `approve-plan` checkpoint and is a precondition of the implementation gate, so it is **not** used — a remediation-pending task therefore cannot satisfy the implementation-start gate). Only schema-approved keys and enums; `planner: null` (no planner metadata invented); human-readable status in `title`; full decision and remediation detail here in Markdown. `roundCounts.remediation: 1`. Open findings remain **F01–F15** until re-review closes them.

**Validator result** (the conductor's compiled `validateTaskManifest`, `aix-conductor/dist/records.js`, run read-only; conductor repository unchanged): `{"ok":true,"errors":[]}`.

## Boundaries observed

Documentation only. No `platform/**`, migration, test code, CFG-01/IAM-02/WLT-01/LED-01 edit, master/register edit, or `main` merge. v1.0 files untouched.

## Next

Separate-context re-review of v1.1 against `04-review.md`, focusing on: the SQL backstop concept and its parity with the TypeScript matrix; the lineage model and AR-19 residual; the F03 real-instrument cells versus Doc 00 §12E.2; the domain/consumer binding completeness; the fiat contract; the P-3/P-4 pending positions. Then human decision on `HD-5`, `HD-7`, `P-3`, `P-4` and on DCR-AST1-006.
