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
