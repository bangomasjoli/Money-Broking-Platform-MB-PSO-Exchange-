# IAM-02 — Opus Short Re-Review (v0.2): F1/F2 Closure Only

| Item | Detail |
|---|---|
| Scope | ONLY the closure of F1 and F2 from `IAM-02_Security_Review_Opus_v0.1.md`. No re-review of the rest of the module. |
| Reviewer | Opus — independent post-patch re-verification |
| Method | Full read of all four patched paths + fresh disposable Postgres (`tsc -b`, migrations 001→007, 3 grant files, full suite) + confirmation the in-suite F1/F2 tests reproduce the *exact* original attacks through the real app path. |
| Verification run | `npx tsc -b` exit 0; fresh `aix_iam2_opus_rereview` DB; **211/211 tests, 0 failures**; DB dropped, no stray DBs. |

---

## Verdict: F1 and F2 are CLOSED. Conditions from v0.1 are cleared.

Both must-fix defects from v0.1 are correctly and completely fixed. IAM-02 (Phases 0–5) is now an **ACCEPTED baseline**. The two lower-severity carry-forwards (L1–L3) remain open and tracked as before — none is blocking.

---

## F1 — decision-token binding — CLOSED

The binding comparison now lives inside `verifyAndConsumeDecisionToken` itself (`lib/decision-token.ts`), so **every** caller — the generic `execute-verify` endpoint AND IAM-02's in-process `routes/roles.ts` — gets it. Confirmed by reading the code:

- Binding check (actor/action/resource/entity/client) runs right after existence/status/expiry and **before** the payload-hash check — correct ordering (`decision-token.ts:229-234`).
- Null-safe: `entityId`/`clientId` bound to `null` only match a presented `null`/absent value, never a wildcard (`:227-228`). Matches the `null == null` convention already used for payload hash.
- On mismatch the token is **revoked** (not merely rejected once) and a **distinct Critical** `iam2.decision_token_binding_mismatch` audit event fires, separate from the payload-hash-mismatch event (`:235-253`).
- `execute-verify` handler now passes all presented binding fields through (`routes/internal.ts:146-156`), and the response `verified_payload_hash/verified_session/verified_cache_version` flags now reflect what was *actually* checked instead of hardcoded `true` (`:170-172`, `decision-token.ts:305-307`).
- Approval side: a null-payload approval mints **no** `decision_token` at all (`routes/approvals.ts:382`) — the unbound-bearer-token path from v0.1 is gone.

Reproduction is now a permanent regression test that walks the exact v0.1 attack through the real app: **F1 test 12** (`iam2-db.test.ts:1039`) mints a bound token, redeems it with a *different entity* + matching payload hash → `IAM2_DECISION_TOKEN_INVALID`, asserts the token is `revoked`, the Critical audit event fired, and a **retry with the originally-correct bindings still fails**. Companion tests cover mismatch on action / actor / resource / null-safe client_id, the all-fields-match success case, and the no-token-for-null-payload rule (`:831-1086`, `:951`).

## F2 — SoD RLS-scope race — CLOSED

Both `checkApprovalSodConflict` and `checkRoleAssignmentSodConflict` (`lib/sod.ts`) now run **sequential `await`s**, never `Promise.all`, on the shared `PoolClient`. Confirmed by reading the code; the file also carries an accurate root-cause explanation of the deterministic submission-order interleaving that caused the original fail-open. `checkRoleAssignmentSodConflict` was serialized too (it was only "safe by luck" — one of its three parallel calls touched `aix.user_id`), which is the right call.

Reproduction is a permanent regression test through the real app path (`iam2-db.test.ts:1493`): maker holds `iam2.role.assign_user` and approver holds `iam2.sod.manage` — both via **real `role_permission` grants**, not role-code shortcuts, so effective-permission resolution is genuinely exercised. `approve` now returns `IAM2_SOD_CONFLICT`, `sod_check.result='block'` matching `sod_meta_sod_manage_vs_role_assign_user`, and the approval row goes to `status='blocked'`. The test explicitly documents that this is the exact outcome that was silently bypassed (returned `200 approved`) before the fix.

## Scope / regression check

- No out-of-scope work: Phases 6–7 not implemented; no other module touched; `packages/foundation`, `services/iam`, `services/fnd` unchanged.
- FND-01 (44 tests) and IAM-01 (123 tests) both unregressed in the 211/211 run.

## Carry-forward (unchanged from v0.1, non-blocking)

- **L1** — `execute-verify` does not re-check account/session freeze or auth-level; needs an IAM-01 session/freeze status endpoint (IAM-01's to add). Track it.
- **L2** — step-up assertions are reusable within their freshness window (matches IAM-01's model).
- **L3** — interim trust model rests on one shared internal-service-token + caller-supplied `*_user_id`; the service-identity replacement should not slip.

*No code was written in this re-review. Verification DB was disposable and torn down.*
