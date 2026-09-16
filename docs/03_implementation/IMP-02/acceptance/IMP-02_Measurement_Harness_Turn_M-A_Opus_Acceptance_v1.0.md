---
document_id: IMP-02-ACC-004
title: IMP-02 Measurement Harness (Turn M-A) — Independent Acceptance (Opus, v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: N/A
control: IMP-02 M1-M8 capacity-calibration measurement foundation — result schema, environment fingerprinting, evidence safety, run identity, M2a runtime observation, C_iam and DB-budget arithmetic helpers
owner: Unassigned
effective_date: UNKNOWN
last_reviewed: UNKNOWN
supersedes: none
baseline_commit: d57b436
---

# IMP-02 Measurement Harness (Turn M-A) — Independent Acceptance (Opus, v1.0)

| Item | Detail |
|---|---|
| Pack | `IMP-02` — `03_implementation/IMP-02/README.md`, the controlled owner of DEC-010 Layer L1 (trusted edge) and L2 (network isolation), and — as of the IMP-02 M1-M8 Capacity Calibration Architecture turn (Opus, architecture-only, no file changes) — of the M1-M8 measurement/capacity-calibration framework itself. Not a `02_modules/` entry; the 17-module delivery taxonomy is unchanged. |
| Scope of this record | **Turn M-A only — the trusted MEASUREMENT FOUNDATION.** No capacity calibration was performed. It provides the result schema, environment manifest, evidence-store safety boundary, run identity, an M2a runtime-observation capability, and pure `C_iam`/DB-budget calculation helpers. It does NOT provide M1, M3, M4, M5, M6, M7, or M8a results, and does NOT approve any production pool value, connection timeout, process count, `C_iam`, edge limit, `R_max`, `R_budget`, or `L_ip`. Turns A (`IMP-02-ACC-001`), B (`IMP-02-ACC-002`), and C (`IMP-02-ACC-003`) are otherwise unaffected — zero `platform/edge/**` changes. |
| Artifact | `platform/perf/{README.md,tsconfig.json,src/{schema,run-id,environment-manifest,evidence-store,secret-scan,capacity,db-budget,m2a-observe}.ts,evidence/.gitignore}` (11 new files), `platform/tests/unit/perf-*.test.ts` (9 new files, 85 tests), `platform/tests/integration/perf-m2a-observe.test.ts` (1 new file, 3 tests, `TEST_DATABASE_URL`-gated), `platform/tsconfig.json` (+2/−1, one project reference) |
| Governance | The IMP-02 M1-M8 Capacity Calibration Architecture turn (Opus, architecture-only, no file changes; `SELECTED — READY FOR CONTROLLED MEASUREMENT-HARNESS IMPLEMENTATION`), which validated/refined the M1-M8 framework's M2 (split into M2a/M2b), M7 (split into M7-UAT/M7-PROD), and M8 (split into the M8a mechanism test and the `K_max` governance input) definitions, and established the engineering-vs-governance boundary (`U`/`N`/`K_max` are never harness outputs). |
| Implementation commit | `d57b436` (`feat(imp02): add measurement harness foundation`) — originally committed locally as `84a1725`, never published (confirmed: `git branch -r --contains 84a1725` returns nothing), amended once before its first push after a GitHub push-protection rejection (a test fixture used a Stripe-key-shaped string; replaced with a non-provider-shaped value; only the fixture line differs between `84a1725` and `d57b436`) — see §3. |
| Reviewer | One independent Opus acceptance review of `d57b436`, attacking every stated control directly with malformed/adversarial input rather than relying on the shipped tests, against a freshly initialized scratch PostgreSQL 17.10. |
| Verification | Independently constructed ~45 direct attack payloads against the threshold guard, the secret scanner, path confinement (including a real symlink-escape proof), safe-write ordering, `C_iam`, and the DB-budget calculator; reproduced the dirty-tree refusal against a genuinely dirty tree targeting an unroutable RFC 5737 address; verified M2a's runtime evidence against an independently-constructed control `pg.Pool` across two distinct configurations; inspected the fully serialized evidence record for credential/terminology leakage; independently reproduced the full canonical regression twice (once mid-review, once post-fix) from a freshly migrated+granted scratch database, `--no-file-parallelism`. |

---

## 1. Verdict

**IMP-02 MEASUREMENT HARNESS TURN M-A: COMPLETE / ACCEPTED** (at `d57b436`).

The measurement foundation is sufficiently trustworthy to build Turn M-B on. The single most load-bearing control — that no result can read `PASS`/`FAIL` without naming a governed threshold — survived every bypass attempt constructed against it: `undefined`, `null`, empty string, whitespace-only, tab/newline-only, numeric coercion, an object with a `toString()`, and an array were all rejected. Four non-blocking findings were opened (three LOW, one INFORMATIONAL); none is a control failure in the delivered scope, and none blocked acceptance.

**This does NOT mean any capacity calibration has been performed, any production numeric value has been selected, M1-M8 are complete, M2 is complete, or `FND-FIND-001` is closed.** M2b remains blocked on a deployment-topology decision this repository has no evidence source for, so production `C_iam` remains **UNDETERMINED**. **FND-FIND-001 REMAINS HIGH/OPEN. FND-FIND-010 REMAINS CLOSED (unaffected by this turn). PRODUCTION L2 REMAINS NOT PROVEN/PENDING. M1-M8 REMAIN NOT PERFORMED. PRODUCTION PRE-AUTH POLICY REMAINS NOT APPROVED. INTERNET EXPOSURE REMAINS PROHIBITED.**

---

## 2. Scope / Diff

`d57b436`: 22 files, 2,308 insertions, 1 deletion — `platform/perf/**` (11 new files), 10 new test files (85 + 3 tests), `platform/tsconfig.json` (+2/−1, one project reference to `./perf`). Independently confirmed via `git diff --name-only 6e063d4..d57b436 -- platform/services platform/packages platform/edge platform/infra docs`: **empty** — zero production-source or governance-document changes. No migration, no grant, no dependency/lockfile change.

## 3. Local Amend Deviation — Independently Verified

The implementer disclosed that the first push (`84a1725`) was rejected by GitHub push protection over a test fixture shaped like a well-known payment-provider live secret key, fixed the fixture, and amended the commit before its first successful push. Independently verified as far as repository evidence permits:

- `git cat-file -t 84a1725` confirms the object exists locally; `git branch -r --contains 84a1725` returns **nothing** — it reached no remote branch.
- Reflog shows exactly one `commit (amend)` immediately following the original `commit`, ~5 minutes apart.
- `git diff 84a1725..d57b436` contains **only** the fixture change — a single test-fixture string, shaped like a well-known payment-provider live secret key, replaced with a non-provider-shaped internal-token-style fixture, plus an explanatory comment — nothing else differs.
- `d57b436`'s parent is `6e063d4` (the prior governance-closure commit); remote history is linear.

**Classification: INFORMATIONAL process deviation only.** No shared/published history was rewritten.

## 4. Perf Isolation

Independently confirmed via `npx vitest list --filesOnly`: **207 collected files, all under `tests/`, zero under `perf/`.** `npm test` cannot execute measurement code as a side effect. `perf/` is nonetheless fully typechecked — `rm -rf */dist && npx tsc -b` returns **0 errors**. No `setInterval`, `setTimeout`, `.listen(`, `http.`, or `fetch(` exists anywhere in `perf/src` — load generation is structurally impossible in this turn's code.

## 5. Result-Status / Threshold-Guard Attack

Attacked `createMeasurementResult`/`validateStatusThresholdPairing` directly with ~24 malformed plain objects, bypassing the shipped tests entirely:

| Class | Result |
|---|---|
| `PASS`/`FAIL` + undefined / null / `""` / `"   "` / `"\t\n "` / `0` / `123` / an object with `toString()` / an array | **REJECTED** (all nine) |
| `PASS`/`FAIL` + genuine non-empty `threshold_ref` | accepted (correct) |
| `OBSERVED`/`INCONCLUSIVE`/`INVALID` + a real `threshold_ref` | **REJECTED** (all three) |

The control is airtight in the delivered scope. Two residual gaps — carried as findings, not control failures — are that (a) `status`/`measurement_id` are validated only by TypeScript, not at runtime (an untyped caller could construct `status: "APPROVED"` or `measurement_id: "M2"`), and (b) an empty/whitespace-only `threshold_ref` is accepted on non-PASS/FAIL results (schema cleanliness only — the status still correctly reads `OBSERVED`, so no false authority is conveyed). See §12.

## 6. Measurement-ID / K_max / U-N Boundary

`ALL_MEASUREMENT_IDS` = exactly `M1, M2a, M2b, M3, M4, M5, M6, M7-UAT, M7-PROD, M8a` — no bare `"M2"`, no `"M8b"`, confirmed both at the type level and the runtime constant. No field named or shaped as `k_max`/`K_max`/`assumed_k` exists anywhere in `perf/src` (comment-stripped, field-declaration-pattern scan), and a real serialized M2a evidence record contains no such substring. A comment-stripped scan for `R_max`, `R_budget`, `L_ip`, `S_neg`, `utilization`, `headroom`, and `const U =`/`const N =` across all eight modules returns **zero hits in code**.

## 7. Dirty-Tree Refusal

Reproduced with a **genuinely dirty tree** (a real untracked file, the real `readRealGitInfo` provider — no injected provider) against an unroutable RFC 5737 TEST-NET-3 target: `status: INVALID`, `working_tree_clean: false`, **33 ms elapsed** — decisive proof no TCP connection attempt was made. `database`/`service_topology` both report `observed: false`. Tree independently restored to clean afterward. Clean-tree → `OBSERVED`, verified in §8.

## 8. M2a Runtime Evidence

Verified against a fresh scratch PostgreSQL 17.10 using **two distinct configurations plus an independently constructed control `pg.Pool`**: requested `{max:7, connectionTimeoutMillis:2345}` → `effective` `7/2345`, matching the control Pool exactly; requested `{max:2, connectionTimeoutMillis:911}` → `effective` `2/911`, likewise matching; absent options → `effective` `10/undefined`, matching node-postgres's own library default. Distinct inputs producing distinct, independently-verified outputs rules out request-echo. `iam_processes_total: 1` is emitted only alongside `source: "observed_local_process — ... NOT production deployment topology"`. `does_not_prove` carries all five required statements verified in **runtime output**, not README prose.

**Serialized-evidence credential/terminology scan:** the full JSON record contains none of the `DATABASE_URL`, host, port, or user; and none of "production process count", "production capacity", "approved default", "production policy", "recommended", "M2 complete", "calibrated", `R_max`, `R_budget`, `L_ip`, or `K_max`.

## 9. Secret Scanner

Attacked across every vector: credential-bearing `postgres://`/`postgresql://`/`https://` URLs (including mixed-case schemes, URL-encoded passwords, and creds inside escaped JSON) — all flagged; a plain URL with no credentials — clean (correct); PEM markers (RSA/plain/EC/OPENSSH/ENCRYPTED/DSA, multi-line embedded) — all flagged; prose mentioning "private key" — clean (correct); `Authorization: Bearer <realistic token>` — flagged; a known secret nested inside an object and inside an array — both flagged; empty/undefined `knownSecrets` entries — correctly ignored, no wildcard match. **The thrown error message never contains the matched secret or credential**, verified on both a known-secret match and a credential-URL match, including the exception's `.stack`.

## 10. Path Confinement, Safe-Write Ordering, Atomic Write

Every string-based traversal attempt (`/etc/passwd`, `../`, six-deep `../../../../../../`, `a/b/../../../x`, bare `..`, a backslash variant) — **REJECTED**. URL-encoded and double-encoded traversal resolve to literal directory names inside `evidence/`, never an escape. **A real symlink placed inside `perf/evidence/` IS followed** — proven concretely (a write landed at `/tmp/opus-symlink-target/pwned.json`); recorded as `IMP-02-FIND-010` (§12), assessed non-blocking today because Turn M-A has no untrusted/external path entrypoint. Symlink and target removed immediately after proof.

Safe-write ordering proven stronger than the design required: on a rejected payload, **the parent directory is never even created** — confirmed via `existsSync`/`readdirSync` before and after three separate rejected writes. Successful writes use temp-file-then-`rename`; zero `.tmp-*` residue after success; file mode `0600`; overwrite replaces content atomically.

## 11. C_iam / DB-Budget Calculators

**C_iam:** homogeneous (`poolMax × iamProcessesTotal`) verified across five pairs; heterogeneous (`Σ pool.max_i`) verified across four arrays; **no hidden `× instance_count`** — extra `instanceCount`/`iam_instance_count` fields are silently ignored, proven by comparing outputs with and without them. All **20** malformed-evidence cases (missing/zero/negative/fractional/`NaN`/`Infinity`/string-typed inputs, empty/whitespace source, empty/invalid heterogeneous arrays) return `UNDETERMINED` — never `0`, `1`, or an assumed value.

**DB-budget:** arithmetic verified (9×10×1 service demand against `max_connections:100` → slack `2`, within budget; raising one service to 40 → slack `−28`, `withinBudget:false`, **never clamped to zero**). All **18** failure cases return `UNDETERMINED`. Returned keys contain no `recommend`/`approved`/`safe_`/`suggest`/`optimal` substring at any nesting level. Both calculators independently confirmed to contain **zero embedded integer literals of two or more digits** outside comments.

## 12. Findings

| ID | Severity | Title | Disposition |
|---|---|---|---|
| `IMP-02-FIND-010` | LOW | Evidence writer follows symlinks outside `perf/evidence/` | Proven concretely; non-blocking today (no untrusted path entrypoint exists in Turn M-A). **MUST be closed before Turn M-B introduces any externally-influenced path segment.** Fix: `realpathSync` containment check after directory creation. |
| `IMP-02-FIND-011` | LOW | `status`/`measurement_id` not runtime-validated | Every in-repo producer is `strict`-TypeScript, typechecked by `tsc -b`; the attack required deliberately bypassing the compiler via an untyped script. **MUST be closed before Turn M-B introduces any CLI/JSON/untyped entrypoint** — at which point this would rise to MEDIUM. Fix: validate `status` and `measurement_id` against runtime allowlists inside `createMeasurementResult`. |
| `IMP-02-FIND-012` | LOW | Whitespace-only `threshold_ref` may remain on non-PASS/FAIL results | PASS/FAIL enforcement itself is NOT bypassed — an empty/whitespace `threshold_ref` on an `OBSERVED`/`INVALID` result names no governed threshold and conveys no false authority. Schema-cleanliness fix: normalize/reject empty or whitespace-only `threshold_ref` consistently regardless of status. |
| `IMP-02-FIND-013` | INFORMATIONAL | Bundled test/scanner refinement observations | (a) scanner does not match lowercase PEM markers, `PGP PRIVATE KEY BLOCK`, or lowercase `bearer`; (b) `buildEnvironmentManifest` accepts an empty `commit_sha` from an injected test provider, contained at the result-creation layer; (c) the Vitest-boundary test is near-tautological; (d) the `K_max`/glob checks are source-text regexes where a runtime check is feasible; (e) the rejected-write test asserts file-absence rather than the stronger directory-non-creation property the implementation actually provides. No action required; informational only. |

None of the four findings blocked acceptance. **`IMP-02-FIND-010` and `IMP-02-FIND-011` are a mandatory Turn M-B gate** — see §14.

## 13. Independently-Confirmed Blockers (not remediated, not findings)

Four architectural gaps surfaced by the M1-M8 architecture turn's source inspection were independently re-verified true by direct repository inspection during this review (not merely accepted from the implementer's report): (1) no Dockerfile/compose/Kubernetes/PM2/systemd/`node:cluster` artifact exists anywhere, confirming production IAM process count has no evidence source; (2) no `statement_timeout`/`idle_in_transaction_session_timeout`/`lock_timeout`/Fastify `requestTimeout` exists anywhere in `services/`/`packages/`; (3) `edge/haproxy.base.cfg` and `uat/haproxy.limits.cfg` declare no stats socket or stats listener; (4) `IAM_CLIENT_TIMEOUT_MS = 5000` at `services/wlt1/src/lib/iam-client.ts:25` is a hard-coded source constant. No governance finding ID is invented for these four items — they are prerequisites, not defects, and no code turn should invent one for a gap it did not create.

## 14. Turn M-B Gate

**Turn M-B MUST NOT begin with an externally-influenced/untyped entrypoint until `IMP-02-FIND-010` and `IMP-02-FIND-011` are closed.** If Turn M-B's initial scope remains entirely typed and internal (no CLI, no JSON ingestion, no network-facing path), the two findings may legitimately remain open a while longer under their current LOW classification — but should still preferably be remediated at the start of that turn rather than deferred further, since both findings become materially more serious the moment such an entrypoint is introduced.

## 15. Canonical Regression — Independently Reproduced

Independently reproduced from a freshly initialized scratch PostgreSQL 17.10 (9 runtime roles created, 70 migrations applied, all 9 grant files applied with 0 errors), clean tree, `--no-file-parallelism`:

```
Test Files  204 passed | 3 skipped (207)
     Tests  5165 passed | 53 skipped (5218)
```

**0 failures.** Reproduced twice (once mid-review confirming the pre-fix state, once post-amend against the final published commit) with identical results.

| | Prior baseline (`6af0d25`) | New (Turn M-A) | This turn (`d57b436`) |
|---|---|---|---|
| Files passed / skipped / total | 194 / 3 / 197 | +10 / +0 / +10 | **204 / 3 / 207** |
| Tests passed / skipped / total | 5077 / 53 / 5130 | +88 / +0 / +88 | **5165 / 53 / 5218** |

The 53 skips remain fully and unchanged accounted for by the three Lima-harness-gated live suites (`imp02-edge-live` 23, `imp02-uat-tls-live` 22, `imp02-uat-topology-live` 8). Migration head `070` (70 migrations, no `071`); all 9 grant files independently confirmed SHA-256-identical between `6e063d4` and `d57b436`.

## 16. IMP-02 Overall Status

Acceptance of Turn M-A does not constitute IMP-02 completion, M2 completion, or any capacity calibration. Unaffected and unresolved: M1, M3, M4, M5, M6, M7 (UAT or production-shaped), M8a; production `C_iam` (UNDETERMINED — M2b has no evidence source); risk-governance terms `U`/`N`/`K_max`; production pre-authentication numeric policy; the full A1–A10 abuse-test matrix at production shape; production TLS certificate lifecycle/cipher policy/backend mTLS; production deployment of L2; OPS-05 maker-checker sign-off; a named accountable human owner (`Unassigned`). **IMP-02 REMAINS IN_PROGRESS.**

## 17. FND-FIND-001 — Unaffected

Turn M-A does not close `FND-FIND-001` and was never capable of doing so — it is a measurement-instrument turn, not a numeric-policy or production-deployment turn. **`FND-FIND-001` REMAINS HIGH/OPEN.**

## 18. FND-FIND-010 — Unaffected, Consumed As Governed Input

Turn M-A does not reopen or modify `FND-FIND-010` (CLOSED at `6af0d25`) — it consumes that closure's governed `{max?, connectionTimeoutMillis?}` seam as the exact target of the M2a observer, unmodified. **`FND-FIND-010` REMAINS CLOSED.**

## 19. Documentation Impact

This record, plus updates to `docs/03_implementation/IMP-02/README.md` (new "Measurement Harness — Turn M-A" section, M1-M8 table M2 split into M2a/M2b, refined `C_iam` model note, corrected stale IAM Capacity Gap cross-reference, Pack Contents, status block), `DOCUMENT_REGISTER.md` (this record registered in §4b as `IMP-02-ACC-004`), `OPEN_FINDINGS.md` (IMP-02 section updated; `IMP-02-FIND-010` through `IMP-02-FIND-013` registered; `FND-FIND-001`'s row updated), `DECISION_LOG.md` (DEC-010's chronology extended — baseline commit unchanged), and `00_project_state/MODULE_STATUS.md` / `PROJECT_HANDOVER.md` (chronology).

## 20. Final Statement

**IMP-02 MEASUREMENT HARNESS TURN M-A: COMPLETE / ACCEPTED (at `d57b436`).**
**The threshold-authority control (`PASS`/`FAIL` require a non-empty governed `threshold_ref`) survived every direct-attack bypass attempt.**
**M2a runtime evidence independently verified against a control `pg.Pool` across two distinct configurations; the dirty-tree refusal independently verified against a genuinely dirty tree and an unroutable database target (33 ms, no connection attempt).**
**`C_iam` and DB-budget calculators independently verified across 38 combined malformed-input cases: always `UNDETERMINED`, never a fabricated number; never a recommended value.**
**`IMP-02-FIND-010` through `IMP-02-FIND-013`: OPEN (LOW / LOW / LOW / INFORMATIONAL, non-blocking). `IMP-02-FIND-010`/`011` are a mandatory Turn M-B gate.**
**`IMP-02-FIND-001` through `IMP-02-FIND-009` (Turns A/B/C): unchanged, OPEN.**
**IMP-02 OVERALL: IN_PROGRESS — not complete.**
**FND-FIND-001: REMAINS HIGH/OPEN.** **FND-FIND-010: REMAINS CLOSED (unaffected).**
**M1-M8: NOT YET PERFORMED. M2: NOT COMPLETE (M2a observation capability built; M2b BLOCKED). PRODUCTION C_iam: UNDETERMINED.**
**PRODUCTION PRE-AUTH NUMERIC POLICY: NOT APPROVED.** **PRODUCTION L2: NOT PROVEN / PENDING.**
**INTERNET EXPOSURE: REMAINS PROHIBITED.**
