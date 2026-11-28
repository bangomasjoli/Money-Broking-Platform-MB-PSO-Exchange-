# 06 Acceptance — AIX-CI-HARD-001-L1

> **Implementation-scope acceptance of slice L1 only.** This record covers two CI guard files. It is not acceptance of L2, L3, the `AIX-CI-HARD-001` programme or any other slice, not hosted-CI evidence, not closure of any finding, not a claim that a reused or shared database is safe, and not production readiness or regulatory approval. Nothing here changes `OPEN_FINDINGS.md`.

- **Final decision:** **ACCEPTED — L1 IMPLEMENTATION SCOPE ONLY**, including the owner-approved template-flagged database remediation.
- **Accepted implementation commit (`task.json.resultingCommit` and `acceptance.acceptedCommit`):** `2e15878815a064f837596716d37896477f33409d` (`fix(ci): harden disposable PostgreSQL database inspection`, parent and approved baseline `f57084d7e2789062edd8e1d740066ffc0b123c91`).
- **Accepted content identifier (diff digest):** SHA-256 `49858ce856a8e0960de93dc1e40fb298b8c1d5cd7aa6d3b4533f0ef2a78b404d` of `git diff f57084d7e2789062edd8e1d740066ffc0b123c91` (+334 / −23, two files). VERIFIED by the recording session twice: on the uncommitted working tree before the commit, and as `git diff f57084d… 2e15878…` after it. Both returned the same digest.
- **Accepted files (exactly two):** `platform/ci/assert-disposable-database.mjs` (+126 / −20) and `platform/ci/assert-disposable-database.selftest.mjs` (+208 / −3).
- **Accepted by (human):** Aiman, project owner, 2026-11-28 (Asia/Kuching). The decision was given as an owner instruction to the Claude Code session ("OWNER ACCEPTANCE AND LOCAL COMMIT") and is **SESSION-RELAYED**: no GitHub comment, review object or other durable external record exists. `acceptedAt` is the record-writing time (`2026-11-28T08:40:03Z`), an upper bound; the instruction's own timestamp is not preserved.
- **Reviewer / model / effort:** see "Review independence and limitations". `task.json.acceptance.reviewExecutionId` is `null`: no conductor review execution exists.

## What changed (summary of the accepted diff)

- The guard inspects **three** databases, each over its own connection: the `TEST_DATABASE_URL` database, `postgres` and `template1`. Each connection must report the expected `current_database()` and the same cluster `system_identifier`. A connection, query or result anomaly **fails closed** and is never read as "zero relations". `template0` is never connected to.
- Owner-approved narrow expansion (template-flagged inventory gap): the database inventory query was `SELECT datname FROM pg_database WHERE NOT datistemplate`, so an extra database flagged `datistemplate` was invisible. It now lists **all** databases and permits only `postgres`, `template0`, `template1` and the database named by `TEST_DATABASE_URL`. The success message names exactly what was checked. One regression test was added.
- That template-flagged gap is an additional LOW finding. **No finding identifier was supplied for it and none is invented here.** It is **remediated** at the accepted commit (evidence below). It is not registered in `OPEN_FINDINGS.md` and nothing here registers or closes it.

## Review and test record

Labels: **OBSERVED** = run or read by a session in this conversation; **RELAYED** = stated in the owner's instruction or an implementer report and not independently reproduced by a session in this conversation.

| Item | Result | Provenance |
|---|---|---|
| Original independent review of the L1 implementation | **ACCEPT** | RELAYED. The review text is not preserved in the repository and was not available to the recording session. |
| Original independent mutation tests | **13/13** | RELAYED. Not repeated; the final delta review declined to repeat them without material reason. |
| Owner-approved scope expansion (template-flagged inventory), two existing files only | Approved | RELAYED (owner instruction). |
| Final independent delta review (Claude Opus 5.5) | **ACCEPT** | OBSERVED (chat report only; not on GitHub). |
| Final diff digest vs bound value `49858ce8…404d` | Match; +334 / −23; exactly two files | OBSERVED. |
| Previously reviewed state `ebeab663d6ff6d6c22e326785010736be845542c840c694c3a01bafa168f99e9` | Reconstructed from a retained snapshot and hashed (match). Incremental change **+29 / −8** against the final state, exact comparison. | OBSERVED. |
| Database guard self-tests (`node --test`) | **23 / 23** passed, 0 failed, 0 skipped | OBSERVED. |
| Combined CI self-tests (verifier + guard) | **37 / 37** passed, 0 failed, 0 skipped | OBSERVED. |
| `node --check` (both files), `git diff --check` | clean | OBSERVED (re-run `git diff --check` by the recording session: clean). |
| Regression detection (mutants in a scratch clone) | Restoring `WHERE NOT datistemplate` — alone or with the original `{postgres, dbName}` allowlist — fails the new test. Dropping `template0`/`template1` from the allowlist fails 6 tests including the clean-cluster test (a seventh failure in the scratch clone was only a missing `pg` package, present on unmutated code too). | OBSERVED. |
| Live PostgreSQL 16.15 fixture (new isolated instance, loopback only, synthetic data, SCRAM, connection logging) | Clean: **pass**. Empty template-flagged extra database: **fail**. Populated template-flagged extra database: **fail**. Ordinary extra database: **fail**. Contamination in `template1` and in the URL database: **fail**. Clean again: **pass**. The previously reviewed guard **passed** both template-flagged cases, which reproduces the gap. 0 connections to `template0` and none to the extra databases by the guard; one connection each to the URL database, `postgres` and `template1`; no password in any output. | OBSERVED. |
| Migration-072 regression | **5/5** passed, 0 failed, 0 skipped | RELAYED by the implementer. The final reviewer **inspected** the JSON report (5 total, 5 passed, 0 failed, 0 pending, `success: true`) but **did not rerun it**. The recording session did not rerun it. |
| Hosted CI | **NOT_RUN** | No push, pull request or workflow run exists for this commit. |
| Conductor task-manifest validator (`validateTaskManifest`, conductor commit `f6a6571974a6f230882602ade0176ac018a23407`) on this task's `task.json` | `ok: true` | OBSERVED by the recording session. |

## Review independence and limitations

- **Models:** the final delta review was run by **Claude Opus 5.5** (effort Low was requested; the effort setting is not observable to that session, so it is **not independently verified**). This record was written by **Claude Sonnet 5.5 in the same conversation after a model switch**, so the recording session is **not independent of the final delta check**. The recording session verified the digest, committed the reviewed files unchanged and ran the validator. It does not approve, accept or certify this work; acceptance is the owner's. The implementing session's model and effort are not recorded here.
- **Reuse of PostgreSQL binaries:** the live fixture reused a PostgreSQL 16.15 toolchain left in another session's scratch area; it was not freshly provisioned by the final reviewer's own session. It is the same major version as the CI service (`postgres:16`, floating tag), but the hosted image has not been exercised.
- **Evidence retention:** the fixture outputs, the retained pre-remediation snapshot and the mutants live in session scratch directories, not in the repository or the evidence archive, and may be cleared. This record does not claim they are durably preserved.
- **Informational observations carried forward (no remediation, per owner instruction):**
  - **INFO-A:** the allowlist also accepts `template0` or `template1` if `TEST_DATABASE_URL` names one of them. `template0` refuses connections, so that fails closed; naming `template1` would pass the inventory check. The earlier reviewed guard behaves the same way and CI hard-codes `aix_ci`.
  - **INFO-B:** the fake catalogue in the self-test reacts to the literal `NOT datistemplate` filter. A differently written filter would not be caught by that unit test; the live fixture does cover it.
  - The informational observations of the **original** independent review are not available to the recording session and are not re-listed here; they are retained by reference to the owner's instruction.
- **Remaining guard limitations (from the guard's own header):** the guard is a pre-flight check for a freshly provisioned ephemeral service. It does not prove a server is a CI container or is safe for reused or shared use, and says nothing about extensions, event triggers, non-relation objects, `template0` or data outside the three inspected databases.
- **Success-message wording** was reviewed as accurate and non-overclaiming.

## Findings position

- **CI-FIND-001** (`OPEN_FINDINGS.md`, alias `AIX-CI-001-L-1`, LOW): technically remediated for the fresh hosted disposable CI pilot by this commit (the guard now inspects `postgres` and `template1`), but it **remains canonically OPEN** pending hosted CI and a separately authorised closure. Its register row says "harden before any general or reused database use"; this change does not establish reused-database safety.
- **CI-FIND-002, CI-FIND-003, GOV-FIND-001** and every other finding: unchanged and unaffected.
- `OPEN_FINDINGS.md`, `CURRENT_STATE.md`, `DECISION_LOG.md`, `DOCUMENT_REGISTER.md` and `MODULE_STATUS.md` are **not modified** by this record.

## Not accepted, authorised or implied

Publication, push, pull request or merge; hosted-CI success; closure of any finding; `AIX-CI-HARD-001` L2, L3 or any other slice; UI V2; general reused-database safety; production readiness; regulatory approval. Navigation text elsewhere (for example `CURRENT_STATE.md` §5, which still lists `AIX-CI-HARD-001` L-1 as planned and not started) is **not reconciled by this record**; that needs a separate controlled checkpoint.

---

## Post-merge verification and canonical closure addendum (2026-11-28)

> **Prepared documentation record; not yet canonical.** This addendum is part of a documentation-only closure change prepared on branch `docs/AIX-CI-HARD-001-L1-closure` from baseline `fc2985cb31007bc06417722801b2d015e2d2e6e1`. It becomes canonical only when the separately authorised closure PR merges into protected `main`. Everything above this line is the original acceptance record and is preserved unchanged; where this addendum conflicts with a historical statement above, this addendum supersedes it **for that statement only**, and only from the merge of the closure PR.

### Provenance labels

- **VERIFIED (LOCAL GIT)**: read or computed from the local Git object database by the preparing session (Claude Sonnet 5.5, effort Low) on 2026-11-28.
- **RELAYED FROM CONNECTED INTEGRATION**: stated in the owner's closure instruction as independently verified through a connected GitHub integration. The preparing session did **not** read it from GitHub and does not claim independent verification of it.
- **IMPLEMENTER-REPORTED**: stated by the implementing session in a report to the owner. It is not independently reproduced, and local Git state does not record it.
- **SESSION-RELAYED**: an owner instruction given to a Claude Code session; no GitHub comment or other durable external record exists.

### Superseded historical statements

| Historical statement (above) | Superseded by |
|---|---|
| Hosted CI **NOT_RUN**; "No push, pull request or workflow run exists for this commit." | Hosted CI run `46127452734` passed all five jobs on publication head `f40fd55…` (below). |
| "Not accepted, authorised or implied: publication, push, pull request or merge; hosted-CI success; closure of any finding" | The implementation was published and merged through PR #24, and hosted CI succeeded (below). Closure of `CI-FIND-001` only is owner-authorised for preparation (below). Nothing else in that list is changed. |
| "`CI-FIND-001` … **remains canonically OPEN** pending hosted CI and a separately authorised closure" | Hosted CI has passed and closure is authorised for preparation; the row is `CLOSED` in the prepared register change, canonical only when the closure PR merges. |
| "`OPEN_FINDINGS.md`, `CURRENT_STATE.md` … are **not modified** by this record" and "`CURRENT_STATE.md` §5 … is **not reconciled by this record**" | The closure change modifies `OPEN_FINDINGS.md` (the `CI-FIND-001` row only), `CURRENT_STATE.md` §5, §6 and §8, and `task.json`. |

The original accepted implementation commit (`2e15878815a064f837596716d37896477f33409d`), `acceptedAt` (`2026-11-28T08:40:03Z`) and acceptance provenance are **unchanged**.

### Owner approval to retain HIGH risk

The owner approved retaining the **HIGH** risk classification for this task (SESSION-RELAYED, stated in the closure instruction; the instruction's own timestamp is not preserved). `task.json.risk` remains `HIGH`.

### Publication and merge evidence

| Item | Value | Provenance |
|---|---|---|
| Original baseline | `f57084d7e2789062edd8e1d740066ffc0b123c91` | VERIFIED (LOCAL GIT): present; first parent of the merge |
| Accepted implementation commit | `2e15878815a064f837596716d37896477f33409d` | VERIFIED (LOCAL GIT): ancestor of the publication head; parent `f57084d…` |
| Implementation diff SHA-256 | `49858ce856a8e0960de93dc1e40fb298b8c1d5cd7aa6d3b4533f0ef2a78b404d` (`git diff f57084d… 2e15878…`; +334 / −23; two files) | VERIFIED (LOCAL GIT): re-computed, equals the accepted digest |
| Publication head | `f40fd55a32d1f1452a9337a429254ce10cc3bd4d` (the implementation commit plus the acceptance-record commit `docs(governance): record AIX-CI-HARD-001 L1 acceptance`) | VERIFIED (LOCAL GIT); equals `origin/task/AIX-CI-HARD-001-L1` as fetched locally |
| PR #24 | `https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/pull/24` | RELAYED FROM CONNECTED INTEGRATION (the merge commit subject "Merge pull request #24 from bangomasjoli/task/AIX-CI-HARD-001-L1" is VERIFIED locally) |
| Merge commit | `fc2985cb31007bc06417722801b2d015e2d2e6e1` | VERIFIED (LOCAL GIT): the commit exists locally and equals the local `origin/main` ref. Separately, **IMPLEMENTER-REPORTED**: credential helpers and authentication prompts were disabled during the narrow fetch of `main` that updated that ref. The local reflog records the fetch but not its configuration overrides, so this is not independently verified. |
| Merge parents | `f57084d7e2789062edd8e1d740066ffc0b123c91` (first) and `f40fd55a32d1f1452a9337a429254ce10cc3bd4d` (second) | VERIFIED (LOCAL GIT) |
| Merge-tree check | Merge tree `445fb28a417950f4d26dca4b79aa9a35aa8f0cce` equals the publication head tree `445fb28a417950f4d26dca4b79aa9a35aa8f0cce` | VERIFIED (LOCAL GIT) |
| Merge timestamp | `2026-11-28T08:58:14Z` | RELAYED FROM CONNECTED INTEGRATION. The local merge-commit committer time is `2026-11-28T16:58:13+08:00` (= `08:58:13Z`), one second earlier; the difference is not investigated and does not affect any conclusion. |
| Changed paths, baseline to merge | Exactly the two CI files (modified) and the two task-record files (added) | VERIFIED (LOCAL GIT) |
| Source branch preserved | The branch is preserved at `f40fd55…` | RELAYED FROM CONNECTED INTEGRATION. Locally, only the remote-tracking ref `origin/task/AIX-CI-HARD-001-L1` was read (it points at `f40fd55…`); it was not refreshed by the narrow `main` fetch, so it does not independently prove the current remote state. |
| Hosted CI run | `https://github.com/bangomasjoli/Money-Broking-Platform-MB-PSO-Exchange-/actions/runs/46127452734`, completed `2026-11-28T08:49:28Z` | RELAYED FROM CONNECTED INTEGRATION |
| Hosted CI jobs on the publication head | All five passed: (1) static and frontend checks; (2) unit tests; (3) PostgreSQL 16 regression; (4) CI verifier self-test; (5) PR verification result | RELAYED FROM CONNECTED INTEGRATION |

The hosted run exercised the floating `postgres:16` service image; digest pinning remains `CI-FIND-002`.

### Procedural disclosure: additional `ls-remote` (owner-accepted deviation)

- **Operation (IMPLEMENTER-REPORTED, disclosed by the implementer):** during closure preparation, one additional **read-only** `git ls-remote` operation was run outside the narrowly authorised synchronisation scope (the fetch of `main`).
- **Credential helpers (IMPLEMENTER-REPORTED):** they were **not** disabled for that operation. Credential access by the helper was therefore **possible but is not established**.
- **Credential retrieval or use:** **none confirmed.** No credential was retrieved, inspected or used by the closure review, and no secret store was read.
- **Repository mutation:** none attributable to that operation. `ls-remote` writes no local refs or objects, and the independent closure review's read-only inspection of the local reflogs found no ref update that it explains. The local ref updates in the preparation window are the authorised branch creation, the narrow `main` fetch and the earlier task-branch push.
- **Owner disposition (SESSION-RELAYED, 2026-11-28; the instruction's own timestamp is not preserved):** the owner accepted this disclosed read-only scope deviation **without waiving or relaxing any existing control**, including the owner credential restriction recorded at `PAR-N29`. The operation is **not** described as authorised in advance or retrospectively authorised.
- **Register:** no finding identifier is assigned and none is invented here. Any registration needs a separate owner decision.

### Owner-authorised `CI-FIND-001` closure scope

The owner authorised preparation of the canonical closure of `CI-FIND-001` only (SESSION-RELAYED, 2026-11-28; the instruction's own timestamp is not preserved). The authorisation permits preparing the documentation diff, not committing, publishing or merging it.

- **Closed (prepared):** the verified L1 defect (the guard did not inspect `postgres` or `template1`) and its owner-approved inventory correction (template-flagged databases were invisible to the database inventory). The additional template-flagged gap has no register identifier; none is registered or invented.
- **Not closed, not waived, not changed:** `CI-FIND-002`, `CI-FIND-003` (the L2 and L3 slices, planned and not started), `GOV-FIND-001` and every other finding row.
- **Not established:** that the guard makes any general, reused or shared database safe. The register row keeps the requirement for a separate safety evaluation before broader database use.
- **Effective only on merge:** the `CLOSED` state is canonical only when the separately authorised closure PR merges into protected `main`. Until then `main` records `CI-FIND-001` as OPEN.

### Retained observations and limitations (unchanged by this addendum)

- **INFO-A and INFO-B** (above) are retained with no remediation.
- **Scratch evidence:** the fixture outputs, the pre-remediation snapshot and the mutants remain in session scratch directories and are not claimed to be durably preserved.
- **Review provenance:** the original independent review text is not preserved in the repository; the final delta review is a chat-only report; this record and the closure preparation were written by Claude Sonnet 5.5 and are **not independent** of the earlier checks. The recording of review outcomes here does not certify them. No review execution identifier exists (`task.json.acceptance.reviewExecutionId` stays `null`) and none is invented.
- **Migration-072 regression (5/5)** remains RELAYED from the implementer, as stated above; hosted CI's PostgreSQL 16 regression job result is RELAYED FROM CONNECTED INTEGRATION.
- **Still not accepted or implied:** L2, L3, the wider `AIX-CI-HARD-001` programme, general reused-database safety, production readiness, regulatory approval. A focused independent documentation review of this closure change is still required before any commit, push or merge, and mandatory hosted CI applies after publication.
