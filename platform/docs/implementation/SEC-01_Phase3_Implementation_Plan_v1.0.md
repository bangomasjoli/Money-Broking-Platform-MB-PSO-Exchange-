# SEC-01 Audit Log / Security Monitoring — Phase 3 Implementation Plan (v1.0)

Module: **SEC-01 Audit Log / Security Monitoring**
Blueprint: `aix-platform-docs/modules/SEC-01_Audit_Log_Security_Monitoring_Blueprint_Pack_v1.2/`
Status: **Planning only — no code, no migrations written this pass.**
Depends on (accepted baseline): SEC-01 Phases 0-2, Opus-reviewed (`docs/SEC-01_Security_Review_Opus_v0.1.md`, ACCEPT WITH MINOR CONDITIONS), F1 closed (`docs/implementation/SEC-01_IMPLEMENTATION_NOTES.md` §17), 278/278 tests passing.

MODEL USAGE: this plan was authored by Sonnet, planning only. Opus is reserved for the post-implementation security/compliance review once Phase 3 is built.

---

## 1. Scope read

Read before planning: `PROJECT_HANDOVER.md`, `MODULE_STATUS.md`, `SESSION_START_PROMPT.md`, `docs/implementation/SEC-01_IMPLEMENTATION_NOTES.md` (full, including §16-19 covering the Opus review and F1 closure), `docs/SEC-01_Security_Review_Opus_v0.1.md`, `services/sec1/src/lib/{ingest,stream,canonical,schema-registry,redaction,integrity,errors}.ts`, `services/sec1/src/{config,server}.ts`, `services/sec1/src/plugins/{request-context,source-identity}.ts`, `services/sec1/src/routes/internal.ts`, `infra/migrations/008_sec1_core.cjs`, `infra/grants/sec1_runtime_grants.sql`, `tests/integration/sec1-db.test.ts`, and the SEC-01 v1.2 blueprint pack (`01_Module_Blueprint`, `04_API_Specification`, `05_Database_Design`, `07_Permission_Rules`, `08_Audit_Log_Events`, `09_Error_Handling`, `10_Test_Cases`, `14_Go_Live_Checklist`).

As part of this planning pass, every optional field's hash-vs-stored-column resolution in `lib/ingest.ts` was re-audited to confirm `event_category` (F1) was the *only* divergence of its kind — see §8.

---

## 2. Proposed Phase 3 implementation plan

| Slice | Scope |
|---|---|
| **3a** | `sec1.integrity_verification_run` table (blueprint §2.11) + a DB-backed wrapper around the existing pure `verifyChainSegment` that reads a stream's stored rows, reconstructs canonical fields, runs the check, and persists gap/mismatch counts + findings |
| **3b** | Internal seal **verification**: recompute `batch_hash` from the stored `event_hash` values over the seal's `[from_sequence_no, to_sequence_no]` range, compare to the stored value, flip `verification_status` to `valid`/`failed` — extending the existing seal-creation-only `lib/seal.ts` |
| **3c** | Routes to trigger both of the above (internal-guarded, not IAM-02-gated yet — consistent with Phase 0-2's posture) |
| **3d** | External-anchor **stub interface only** — a documented TypeScript contract with zero implementation and zero call sites, so a later infra-dependent phase has a clear seam |
| **3e** | L1/L2 carry-forward decisions (§8, §9) |

---

## 3. Minimum files likely to change

- **New**: `infra/migrations/009_sec1_integrity_verification.cjs`, `services/sec1/src/lib/external-anchor.ts` (interface only), `tests/unit/sec1-integrity-run.test.ts`.
- **Extended**: `services/sec1/src/lib/seal.ts` (add `verifySealBatch`), `services/sec1/src/lib/integrity.ts` (add a DB-backed wrapper around the existing pure `verifyChainSegment`), `services/sec1/src/routes/internal.ts` (new endpoints — or split into `routes/seals.ts`/`routes/integrity.ts` given the growing surface, matching how IAM-02 split routes by concern once it outgrew one file), `infra/grants/sec1_runtime_grants.sql`, `tests/integration/sec1-db.test.ts`.
- **If L1 is approved**: `services/sec1/src/lib/canonical.ts` (allow-list + a format-version field), `services/sec1/src/lib/ingest.ts` (thread the version through).

---

## 4. Migration requirements

`009_sec1_integrity_verification.cjs`:
- `sec1.integrity_verification_run` — exact blueprint §2.11 columns (`verification_id`, `stream_id`, `from_sequence_no`, `to_sequence_no`, `result`, `gap_count`, `mismatch_count`, `findings jsonb`, `run_at_utc`).
- Grant additions: `role_sec1_runtime` gets `SELECT, INSERT` on the new table, and — new this phase — **`UPDATE` on `sec1.audit_seal_batch`** (Phase 0-2 only granted `SELECT, INSERT` there; verification flipping `verification_status` needs `UPDATE`). A small, deliberate widening, not a blanket one — worth calling out explicitly since every prior grant change in this codebase has been reviewed individually.
- If L1 is approved: a `canonical_format_version` column on `sec1.audit_event` (see §8) — a real migration-shape decision, not a formality.

---

## 5. Internal seal batch model

Keep `lib/seal.ts`'s existing `sealBatch` (creation) unchanged. Add `verifySealBatch(client, sealBatchId)`: reads the seal row's `stream_id`/`from_sequence_no`/`to_sequence_no`, re-reads the actual `event_hash` values for that range from `sec1.audit_event`, recomputes the batch hash with the same concatenation function `sealBatch` already uses, compares, and `UPDATE`s only `verification_status` (`valid`/`failed`). **Structurally cannot touch `seal_method`, `external_anchor_ref`, or `trusted_timestamp_ref`** — those columns simply aren't in the verification code path's write set, so there's no way for an internal verification to accidentally "promote" a seal to look externally anchored.

---

## 6. Integrity verification run model

A DB-backed wrapper: `SELECT ... FROM sec1.audit_event WHERE stream_id = $1 AND sequence_no BETWEEN $2 AND $3 ORDER BY sequence_no`, reconstruct `CanonicalEventFields` per row (same reconstruction shape the F1 tests already use), call the existing pure `verifyChainSegment`, then `INSERT` one `integrity_verification_run` row with `gap_count = gapAt.length`, `mismatch_count = hashMismatchAt.length`, `findings = {gapAt, brokenLinkAt, hashMismatchAt}`, `result = pass ? 'pass' : 'fail'`. This is genuinely low-risk — it's wiring an already-tested pure function to persistence, not new verification logic.

---

## 7. Batch hash / stream range model

Explicit range input only this phase (caller supplies `stream_id` + `from_sequence_no`/`to_sequence_no`) — no "auto-detect what's unsealed since last batch" convenience yet, to keep the surface minimal and testable. Both the seal-creation and integrity-verification-run operations share the same range-selection shape, so a future convenience layer can wrap both uniformly later.

---

## 8. External WORM/TSA stub design

A TypeScript interface only, in `lib/external-anchor.ts`:
```ts
export interface ExternalSealAnchorProvider {
  anchorBatch(input: { sealBatchId: string; batchHash: string }): Promise<{
    externalAnchorRef: string;
    trustedTimestampRef: string;
    trustedTimestampUtc: string;
  }>;
}
```
**No implementation, no `NullAnchorProvider`, no call site anywhere.** Deliberately no no-op stub either — a stub that "succeeds" with placeholder values risks accidentally being wired in and producing a fake anchor, exactly what the brief says not to do. The interface exists purely as documentation of the seam for whoever builds the real WORM/TSA integration later. A static test can assert the interface is never imported by any route/seal/verification code path (mirroring this codebase's existing import-boundary-style tests).

---

## 9. L1 — classification/retention_class hash-binding decision

**Recommend: bind them, but this requires a format-version decision first, not just a code change.**

Re-audited every optional field's hash-vs-column resolution in `ingest.ts` to confirm `event_category` was the *only* F1-shaped divergence (all others — `actor_user_id`, `session_id`, `client_id`, `entity_type`, `entity_id`, `reason_code`, `source_emission_sequence`, `source_emission_stream` — resolve identically via `?? null` in both the hash and the INSERT). `classification`/`retention_class` are different in kind: they're **never caller-supplied at all** — both the hash (currently excluded entirely) and the column are always `schema.classification`/`schema.retention_class`. So binding them is safe *going forward*.

**The real risk:** adding fields to the canonical allow-list changes the hash **formula**. Any event already ingested under the old formula would, if reconstructed and recomputed under the new formula, produce a different hash — reproducing F1's exact failure mode (false mismatch on an untampered event) through a different mechanism (a formula version change instead of a caller-omitted field). Since there's no real production data yet, this is currently low-consequence, but building an integrity-verification job on an unversioned formula is exactly the kind of thing that bites later.

**Recommendation:** add a `canonical_format_version` column (small int, default bumped for new rows), thread it through `CanonicalEventFields`/`computeEventHash`, and have verification select the correct historical formula by version. A small addition now versus a painful migration later — matches this codebase's general bias (see `event_schema.version`'s existing precedent).

---

## 10. L2 — metadata redaction decision

**Recommend: no change this phase.** Value-level scanning (entropy detection, JWT/card-number-shaped pattern matching) is expensive, and both over-fires (redacting legitimate business data) and under-fires (missing creatively-encoded secrets) — not a good trade for this phase's scope, and not called for in the blueprint's own Go-Live gates. Keep the source-side "no secrets in metadata" discipline as the primary control (already documented in `audit.ts`'s header) with the existing key-name blocklist as the safety net. Revisit only if/when a platform-wide data-classification/DLP model is decided — a cross-module decision, not SEC-01-specific.

---

## 11. Tests likely needed

- Seal verification: clean range → `valid`; tampered range (out-of-band edit within the sealed range) → `failed`; **a structural/negative test proving verification never writes `seal_method`/`external_anchor_ref`/`trusted_timestamp_ref` under any code path.**
- Integrity-verification-run: persists `pass` for a clean range; persists `gap_count > 0` for a deleted row; persists `mismatch_count > 0` for a tampered row; `findings` captures the exact sequence numbers.
- Grant tests: `role_sec1_runtime` can now `UPDATE` `sec1.audit_seal_batch` but still cannot `UPDATE`/`DELETE` `sec1.audit_event`; can `SELECT, INSERT` `integrity_verification_run`.
- External-anchor stub: static test confirming zero call sites.
- If L1 approved: a version-aware reconstruction test, and an extended tamper test proving a `classification`/`retention_class` change is now detected.
- Full regression: 278 baseline must stay green.

---

## 12. Risks / questions before coding

1. **[Blocking — needs a decision] L1's format-version approach** — confirm before the migration is written, since it shapes the column/interface design.
2. **Wording risk**: seal/verification API responses must never let `verification_status: 'valid'` read as "externally attested." Recommend an explicit `production_authoritative: false` field whenever `seal_method='internal'` — small addition, worth confirming.
3. **No scheduler wiring this phase** (consistent with FND-01's own still-undelivered outbox-worker precedent) — sealing/verification are callable via internal route only, not automatically periodic. This is a real, open gap for go-live (checklist gate #10 says "integrity verification **job**," implying scheduled), not just a Phase 3 deferral — worth flagging explicitly rather than letting it quietly slide.
4. **[Blocking — needs a decision] Confirm the dual-concept design**: seal-verification (attached to a specific sealed batch) and integrity-verification-run (ad-hoc over any range, sealed or not) as two related-but-distinct mechanisms, matching the blueprint's own two separate tables.

---

## 13. Go/no-go recommendation

**Conditional GO** — ready to code once (1) L1's format-version approach is confirmed, and (2) the dual seal-verify/integrity-run design in Risk #4 is confirmed. Everything else (batch hash model, external-anchor stub, L2 disposition, no-scheduler-this-phase) is confident enough to proceed on as specified above without further check-in.

---

## 14. Out-of-scope confirmation

Nothing was implemented this pass (planning only). Confirmed not touched/not to be built this phase: real WORM/object-lock, real trusted timestamp authority, real SIEM/PagerDuty/Slack/email notification, search/export, monitoring alert lifecycle, expected-event reconciliation, incident break-glass audit-read, protected-action registry dependency, audit correction workflow, retention/legal hold, recovery integrity verification, CFG-01, business modules, Exchange runtime, order book, matching engine, market making, principal dealing, AIX spread markup.

## 15. Aside (non-blocking, flagged for tracking)

`aix-platform-docs/MODULE_STATUS.md` and `PROJECT_HANDOVER.md` still describe SEC-01 as "not yet Opus-reviewed" — they were never updated after the Opus review and F1 closure. Not touched this pass (planning-only, as instructed), but should be updated whenever a docs-sync pass happens so they don't drift further from the sibling `aix-platform/docs/implementation/SEC-01_IMPLEMENTATION_NOTES.md`, which is current.
