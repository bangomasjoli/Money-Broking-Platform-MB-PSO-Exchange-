# 03 Evidence — DEC-015: Client Asset, Fiat Banking, Virtual Account, Custody & Settlement Architecture

Independent facts read from the repository during the DEC-015 drafting turn (initial pass plus the
continuation turn). This is an **architecture / fund-flow / governance** task: there is no
implementation, so there are no test, typecheck or lint results to record. Nothing here is a
review verdict or an acceptance.

## 1. Preflight state (start of the drafting turn)

| Check | Result |
|---|---|
| `git fetch origin --prune` | Completed |
| Branch | `main` |
| `HEAD` | `43f2f34a1640dde2934c591342abfc7b14e0082c` |
| `origin/main` | `43f2f34a1640dde2934c591342abfc7b14e0082c` (equal) |
| `git status --short` | empty (clean tree) |
| `git diff --stat` / `git diff` | empty |
| `git log -10 --oneline` head | `43f2f34 docs: accept MIG-004 environment availability control` … `cefdbe9 docs(workflow): rebaseline master workflow map v1.3` |
| Latest accepted backend implementation | `5a4f872` (`MIG-004`) — `CURRENT_STATE.md` §2, §4 |
| Migration head | `071` (`platform/infra/migrations/071_cfg1_environment_scope.cjs`; 71 files listed) |
| `CURRENT_STATE.md` active task | None (§5) |
| Next decision number | `DEC-015` — last entry in `docs/DECISION_LOG.md` is `DEC-014` (l.1235) |

**Continuation-turn state check** (before further writes): `git status --short` showed 5 entries,
which expand (`git ls-files --others --exclude-standard`) to **6 untracked files and 0 modified
files**: `tasks/DEC-015/01-plan.md`, `tasks/DEC-015/task.json`, the STR-04 architecture document and
three provider requirements documents (the `tasks/DEC-015/` directory is one status line for two
files). `git diff --check` rc=0. `03-evidence.md` did not exist and was created by this continuation.

## 2. Reference branches (read-only)

| Branch | Commit inspected | Governance state observed |
|---|---|---|
| `origin/module/ACC-01` | `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be` | README + `task.json`: blueprint v0.10, round-10 verdict ACCEPT (blueprint/architecture only), `state: PLANNING`, `acceptanceStatus: NOT_ACCEPTED`, `PLAN_READY` not set, open RF-01 (HIGH), RF-02, RF-05 (MEDIUM), RF-09 (LOW); not merged (29 commits ahead of `main`, `git log main..origin/module/ACC-01`) |
| `origin/module/AST-01` | `1978f2e24192b7d893939b25ec9176cc9920791a` | README + `task.json`: blueprint v1.8, round-9 verdict ACCEPT (blueprint/architecture only), `state: IDLE`, `NOT_ACCEPTED`, `PLAN_READY` not set, open F02, F05, F17 (HIGH), F21 (MEDIUM), F46 (LOW); DCR-AST1-010 P1 gate; not merged (20 commits ahead) |

Neither `docs/02_modules/ACC-01/` nor `docs/02_modules/AST-01/` exists on `main`. Branch files were
read with `git show <branch>:<path>`; nothing was checked out, merged, rebased or cherry-picked.

**ACC-01 files read:** `README.md`; `blueprint/v0.10/01_Module_Blueprint.md` (§1, §2, §3, §4.1,
ACC-REQ-021/-027/-030/-037, §7.1, §11.3); `05_Database_Design.md` (`purpose` CHECK l.68, immutability
trigger l.525, enum governance l.496); `13_Reconciliation_Design.md` (whole); `15_Regulatory_Mapping.md`
(§1, §2); `17_Dependency_Change_Requests_And_Open_Questions.md` (DCRs, OQs, §4); `02_Workflow.md` and
`06_State_Machine.md` searched; `tasks/ACC-01/04-review-r10.md` (verdict, §10, §12, §14, §15);
`tasks/ACC-01/task.json`.

**AST-01 files read:** `README.md`; `blueprint/v1.8/01_Module_Blueprint.md` (§1–§3.11, §5.1–§5.8, §6,
§7, §8.6, §9); `05_Database_Design.md` (`ast1.custody_support` l.738–748, `ux_ast1_custody_live` l.809);
`17_Dependencies_And_Open_Decisions.md` (DCR-AST1-001…010, OQ-1…OQ-8); `tasks/AST-01/04-review-r9.md`
(decision, §3, external gates); `tasks/AST-01/task.json`.

## 3. Governance documents inspected

`docs/00_project_state/CLAUDE_CODE_USAGE_RULES.md` (whole); `CURRENT_STATE.md` (whole);
`docs/DECISION_LOG.md` (headings; DEC-011…DEC-014 in full, l.844–1273); `docs/DOCUMENT_REGISTER.md`
(§1, §2, §3, §4d); `docs/OPEN_FINDINGS.md` (rows for `IAM2-FIND-002`, `IAM2-FIND-003`,
`WDR-FIND-001`, `CFG-FIND-002`, `WLT-FIND-016`); `docs/03_implementation/tasks/README.md` and
`_templates/`. `A2-Q1`/`A2-Q2` are recorded in Doc 00 v1.5 §23 (l.2313–2314), not in `OPEN_FINDINGS.md`.

## 4. Repository-wide search methodology

Case-insensitive `grep -r` over `docs/` and `platform/` (`*.md`, `*.ts`, `*.tsx`, `*.cjs`, `*.json`),
excluding `90_archive/`, `*/reviews/`, `node_modules/`, `dist/`, for: client money / client-money,
safeguard, virtual account, sole source / source of truth, DvP / delivery versus payment, omnibus,
Fireblocks, Binance, Kraken, prefund, custodian, Maybank / CIMB / Muamalat, "application pending",
inventory; followed by targeted reads of each hit's section. Module IDs, seeded codes, config keys
and migration names were searched in `platform/`. The §65 stale-assumption searches were re-run in
the continuation with fifteen targeted patterns (STR-04 §55).

## 5. Material search results

| Topic | Result |
|---|---|
| Bank candidates (Maybank, CIMB, Bank Muamalat) | **0 hits** in `docs/` and `platform/` at `43f2f34` |
| "Client money safeguarding account = required" | 12 current hits: Charter l.436 (rule form), SRS l.115, l.390, Module Index l.128, Role Matrix l.107, Workflow Map l.107, System Rules l.118, masters 07 l.76, 08 l.76, 09 l.81, 10 l.77, 11 l.85; WF-07 purpose l.599; UI spec quotation l.918 |
| "Sole/only source of balances" | Charter l.925; Module Index l.405, l.534; Workflow Map l.1921 |
| Named LP "Binance" in current masters | Charter v1.5 l.1043, l.1338, l.1378, l.1436, l.1447; SRS v1.3 l.910; master 07 l.200, l.232; master 08 l.201; Doc 00 l.576 and appendix l.2044 are historical/explanatory |
| "Atomic completion" (DvP) | LED-01 v1.1 and v1.2 `01_Module_Blueprint.md` l.366; "Atomic Settlement Journal" in `03_Diagrams.md` l.92 is journal atomicity |
| Exchange approval evidence | **None.** Doc 00 v1.5 §6 table l.534 "Exchange application pending; scope unresolved — `R1-Q1b`"; `R1-Q1b` open (l.2296); `CURRENT_STATE.md` §1; seeded reasons in `platform/services/cfg1/src/lib/doc00-baseline.ts` l.56–60 |
| VA-implies-control, ledger-holds-money, Fireblocks-as-custodian, client-assets-as-treasury, client financing, bank-account-as-master-account, custody-account-as-subaccount, address-as-instrument, classification-as-ownership | **0 hits** |

## 6. Master documents inspected

Doc 00 v1.5 (§5.2, §6, §7, §8.2, §10.1, §10.6–§10.8, §12C, §23, appendix); Charter v1.5 (§9.1–§9.4,
l.925, LP lines); SRS v1.3 (l.115, l.390, l.910, l.944–948, `MON-SRS-007`); Module Index v1.4 (§6–§16A
rows, §19 rules, §20 cross-track rule l.731, l.128, l.795); Role Matrix v1.3 (l.107, l.628, l.1132,
§23 l.944); Workflow Map v1.3 (headings; WF-07 §11, WF-15 §19, WF-19 §23, l.107, l.1921); System Rules
v1.3 (l.118, SET-RULE-001, l.2133); masters 07–11 v1.2 (baseline blocks; provider, DvP, bank/custodian
integration lines).

## 7. Module blueprints inspected (on `main`)

Authoritative v1.1 unless stated: LED-01 (§5.3–§5.8, §5.15, §5.18, §5.19, component list l.619–644);
DEP-01 (workflow step 5, §5.22, open item l.911, component list l.606–635); WDR-01 (§1 l.40, §5.22,
component list l.578–605); REC-01 (§5.7, external statements l.362–379, component list l.575–600);
WLT-01 (§2 purpose, §5.2); E2E-01 (`03`, `05`, `15` searched); TRD-01 v1.2 (§5.7, §5.13); INC-01
searched. Register sections §2/§3 used for authority (v1.1 authoritative for REVIEW_REQUIRED packs).

## 8. Source code / schema / test / configuration inspection

- `platform/services/` contains only `aml1, cfg1, clt1, fnd, iam, iam2, kyc1, sec1, wlt1` — **no
  ledger, account, asset, deposit, withdrawal, reconciliation, treasury, fee or LP service or schema
  exists**.
- `platform/infra/migrations/061_wlt1_fiat_payout_destination.cjs`: `wlt1.fiat_rail_coverage`
  (`coverage_status` × `activation_status`, deny-by-default) seeded with MY/MYR, SG/SGD, HK/HKD,
  ID/IDR, all `inactive`; `account_identifier_type IN ('local_account')`, `bank_identifier_type IN
  ('bic')`; `destination_type IN ('wallet','fiat_payout')`.
- `049_wlt1_core.cjs` l.139: `wallet_type IN ('hosted','unhosted','unknown')`.
- `014_cfg1_core.cjs` l.153 `balance.direct_edit` and `lp_settlement_approval.bypass` prohibited.
- Provider-registry precedents: `platform/services/aml1/src/lib/providers/registry.ts`,
  `platform/services/wlt1/src/lib/providers/`.
- `platform/services/wlt1/src/config.ts` l.184, l.545 `WLT1_FIAT_VERIFICATION_REQUIRED`.
- UI: `platform/apps/web/components/site/public-trust-control.tsx` l.101;
  `public-product-preview.tsx` l.99, l.107; `public-operating-model.tsx`;
  `components/admin/feature-config-data.ts` l.47, l.67–81, l.169–172.
- Tests: `platform/tests/unit/wlt1-fiat-providers.test.ts`, `wlt1-providers.test.ts`,
  `aml1-stub-provider.test.ts`, `aml1-provider-registry.test.ts` (names only).

Classification of each: STR-04 §43.6. **No file under `platform/` was modified.**

## 9. Compatibility evidence

| Module | Classification | Decisive evidence |
|---|---|---|
| ACC-01 | `DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY` | File 01 §2 "Never in ACC-01: … wallet addresses, any monetary amount, any balance, any ledger identifier"; ACC-REQ-007/-009/-037; ACC-REQ-030 attesters "LED-01 (and later WLT-01/others)"; file 13 R-10 pinned attester set; file 05 `purpose` "Label only"; file 01 §11.3 |
| AST-01 | `DEC015_COMPATIBLE_FUTURE_INTEGRATION_ONLY` (conditional trigger FI-AST-2) | File 01 §6 `custody_model ∈ {THIRD_PARTY_CUSTODIAN, NOT_SUPPORTED}` "no value exists for AIX self-custody"; §1.2 excludes wallet addresses/ledger/balances; file 05 `ux_ast1_custody_live (instrument_id, domain)`; §5.2 C6; §5.8 allow-list |

## 10. Contradictions identified

| Contradiction | Owner | Class |
|---|---|---|
| AIX safeguarded client-money account mandated as the only fiat model (Charter §9.2 and baseline blocks) vs DEC-015 rail hierarchy | Masters | MASTER_REBASELINE |
| WF-07 purpose "received into a safeguarded client-money account" | Workflow Map | MASTER_REBASELINE |
| "Sole/only source of balances" vs accounting-truth/evidence principle | Charter, Module Index, Workflow Map | MASTER_REBASELINE |
| Named LP in Charter v1.5, SRS v1.3, masters 07/08 vs Doc 00 v1.5 provider neutrality | Masters | MASTER_REBASELINE (DEC015-PNF-01) |
| "Atomic completion" for linked two-leg settlement | LED-01 | BLUEPRINT_REVISION (DEC015-PNF-03) |
| WLT-01 v1.1 `custody = out_of_scope` vs Module Index v1.4 "custody orchestration" extension | WLT-01 | BLUEPRINT_REVISION (planned) |
| LED-01 v1.1 "Reconciliation Engine" vs REC-01 reconciliation ownership | LED-01 | BLUEPRINT_REVISION (DEC015-PNF-09) |
| WF-19 vendor record with no owning module | Module Index / Workflow Map | HUMAN_DECISION (HD-DEC015-01; DEC015-PNF-08) |
| No contradiction with ACC-01 v0.10 or AST-01 v1.8 | — | — |

## 11. Proposed finding evidence

`DEC015-PNF-01`…`10` with file/line evidence: STR-04 §41.2. None promoted to `OPEN_FINDINGS.md`.

## 12. Ownership self-check

First-draft D-1…D-5 were re-tested against the evidence in §6–§8 above (STR-04 §53). Outcome: D-1
narrowed; D-2 LQD-01 extension **withdrawn** (HD-DEC015-01 raised); D-3 corrected (LED-01 owns
reservations; WDR-01 transmits — WDR-01 v1.1 l.582 "LED Reserve Adapter — Validates reserve"); D-4
narrowed; D-5 corrected (DEP-01 v1.1 receipt ingestion adapters own inbound events).

## 13. Changed-file allowlist validation (pre-commit)

`git status --short` + `git ls-files --others --exclude-standard` + `git diff --name-only`:

| Path | Allowed by continuation §61 |
|---|---|
| `docs/05_strategy/AIX_Client_Asset_Fiat_Banking_Virtual_Account_Custody_Settlement_Architecture_v0.1.md` | Yes |
| `docs/05_strategy/AIX_Bank_PSP_Settlement_Provider_Requirements_v0.1.md` | Yes |
| `docs/05_strategy/AIX_Institutional_Custodian_Requirements_v0.1.md` | Yes |
| `docs/05_strategy/AIX_LP_OTC_Counterparty_Requirements_v0.1.md` | Yes |
| `docs/03_implementation/tasks/DEC-015/01-plan.md`, `03-evidence.md`, `task.json` | Yes |
| `docs/00_project_state/CURRENT_STATE.md` (+2 lines: DEC-015 PROPOSED pointer in §7 and §8) | Yes |
| `docs/DOCUMENT_REGISTER.md` (+4 rows in §4d: STR-04, STR-04A, STR-04B, STR-04C) | Yes |

The first-draft provider documents were named `AIX_Provider_Requirements_*_v0.1.md`; they were
never committed and were renamed (untracked `mv`) to the required names in the continuation.
Paths under `docs/01_masters/`, `docs/02_modules/`, `platform/`, plus `docs/DECISION_LOG.md` and
`docs/OPEN_FINDINGS.md`: **none changed**. No `02-implementation-report.md`, `04-review.md`,
`05-remediation.md` or `06-acceptance.md` exists for DEC-015.

## 14. Final validation evidence (pre-commit, continuation turn)

| Check | Result |
|---|---|
| `git fetch origin --prune` then heads | `HEAD` = `origin/main` = `43f2f34a1640dde2934c591342abfc7b14e0082c`; `origin/module/ACC-01` = `3f23c3dcb2c5023a64afa2bd2dfb0ef77fe544be`; `origin/module/AST-01` = `1978f2e24192b7d893939b25ec9176cc9920791a` (unchanged) |
| `git diff --check` | rc=0, no output |
| Trailing whitespace in untracked files | none found |
| Forbidden-path check | none |
| `task.json` | valid JSON; `state: PLANNING`, `risk: CRITICAL`, `category: architecture / fund-flow / governance`, `acceptanceStatus: NOT_ACCEPTED`, no `acceptance` object |
| STR-04 structure | 57 `##` sections; 7 Mermaid diagrams; ends with `DEC-015 STATUS: PROPOSED / AWAITING HUMAN ACCEPTANCE` |
| False-claim scan of the new documents | Provider names appear only as candidates or as impact-matrix citations; "live Exchange" appears only in prohibitions; no acceptance, `PLAN_READY` or implementation-authorisation claim |

The resulting commit SHA is not recorded here (a file cannot contain its own commit hash); it is
recorded in the turn report and is the commit that introduces this file.
