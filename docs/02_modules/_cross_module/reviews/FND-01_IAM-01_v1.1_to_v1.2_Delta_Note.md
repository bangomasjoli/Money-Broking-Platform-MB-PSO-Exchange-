# Base-Version Delta Note — IAM-01 & FND-01, v1.1 → v1.2

## Purpose

Both FND-01 and IAM-01 advanced from their final-verified **v1.1** to accepted **v1.2** rollups. This note records a file-level diff to confirm the v1.2 packs introduce **no substantive control change** and that the cross-pack dependency reference resolves.

| Item | Details |
|---|---|
| Review type | Base-version delta / traceability verification |
| Scope | FND-01 Platform Foundation, IAM-01 Auth/MFA/Session (v1.1 → v1.2) |
| Method | Per-file diff of each pack |
| Verdict | Both are clean accepted rollups — no substantive control change; v1.2 packs also cleared the cosmetic items flagged in their final verifications; IAM-01 v1.2 → FND-01 v1.2 dependency now resolves |

---

## 1. FND-01 v1.1 → v1.2

Changed files: `01`, `05`, `11_Claude_Prompt`, `README` (12 of 16 blueprint files byte-identical).

| Change | Nature |
|---|---|
| `01` — version/status header | Non-substantive |
| `01 §8` — removed duplicate "Job Queue Interface" component row | **Cosmetic fix** (flagged in FND-01 v1.1 review, item 1) |
| `05 §3.7` — idempotency scope clarified (action namespace `module.endpoint.operation`; cross-actor replay = different scope; workflow-ref for cross-actor approval) | **Resolves** FND-01 review correction 7 (idempotency scope) |
| `05 §6` — retention rows added for `scheduled_job`, `job_run`, `job_queue_message`, `rate_limit_decision_log` | **Cosmetic fix** (flagged item 2) |
| `11`, `README` — self-reference/version | Non-substantive |

**No substantive control change.** All scheduler/job-queue/DB-isolation/audit-coupling/async-correlation/traceability content is unchanged from the verified v1.1. FND-01 v1.2 additionally closed all three minor items from the v1.1 final verification. **Accepted.**

---

## 2. IAM-01 v1.1 → v1.2

Changed files: `01`, `10`, `11_Claude_Prompt`, `README` (13 of 17 files byte-identical, including all workflow/API/DB/state/permission/audit/error/risk/recon/go-live/regulatory/data-classification content).

| Change | Nature |
|---|---|
| `01` — version/status header | Non-substantive |
| `01` — FND-01 dependency → `FND-01_Platform_Foundation_Blueprint_Pack_v1.2` | Dependency re-pointed to the now-existing FND-01 v1.2 (see §3) |
| `10 §12` — IAM1-TC-079/080/081 Priority cells filled (Critical/High/Critical) | **Cosmetic fix** (flagged in IAM-01 v1.1 review) |
| `11`, `README` — self-reference/version + v1.2 patch note | Non-substantive |

**No substantive IAM control change.** All five resolved critical gaps (step-up, interim MFA-reset, freeze→revocation, session policy, token-binding/anomaly) and corrections 7–10 carry over unchanged from the verified v1.1. **Accepted.**

---

## 3. Dependency reference reconciliation

The IAM-01 v1.1 final-verification review flagged that IAM-01 cited "FND-01 … v1.2.zip" while FND-01 was only at v1.1, and that reference was corrected to v1.1 in the v1.1 pack.

Since then, the author produced **FND-01 v1.2** (the accepted rollup, §1 above). IAM-01 v1.2 therefore re-points its dependency to `FND-01_Platform_Foundation_Blueprint_Pack_v1.2`, which **now exists on disk and resolves correctly**. The earlier v1.1→v1.1 edit is superseded; v1.2→v1.2 is the correct forward reference. No dangling dependency remains.

Confirmed on disk: `FND-01_Platform_Foundation_Blueprint_Pack_v1.2` exists.

---

## 4. Verdict

Both v1.2 packs are **clean, non-substantive accepted rollups** that additionally cleared the cosmetic/minor items from their v1.1 final verifications. The IAM-01 v1.2 → FND-01 v1.2 dependency resolves. No re-review required; both inherit their v1.1 "fully resolved" verdicts.

**Module baseline:** FND-01 v1.2 accepted · IAM-01 v1.2 accepted. Next: IAM-02 RBAC / Permission Guard / SoD.
