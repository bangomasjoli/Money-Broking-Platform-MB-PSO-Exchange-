# Base-Version Delta Note — IAM-02, v1.1 → v1.2

## Purpose

IAM-02 advanced from its final-verified **v1.1** to accepted **v1.2**. This note records a file-level diff confirming v1.2 is a **cosmetic-only rollup** that clears the three non-blocking nits flagged in the v1.1 final verification, with **no substantive control change**.

| Item | Details |
|---|---|
| Review type | Base-version delta / traceability verification |
| Scope | IAM-02 RBAC / Permission Guard / SoD (v1.1 → v1.2) |
| Method | Per-file line diff |
| Verdict | Clean accepted rollup — no substantive control change; all 3 v1.1 cosmetic nits cleared |

---

## Changed files (7 of 16 blueprint files; 9 byte-identical)

| File | Change | Nature |
|---|---|---|
| `01` | version header v1.1 → v1.2; status note "cosmetic final rollup only, no substantive control change" | Non-substantive |
| `02` | list renumbering — WF-IAM02-01 (`11→12`), WF-IAM02-02 (`7→6`), WF-IAM02-06 (`10–12→11–13`); stray blank lines removed | **Cosmetic nit 1 fixed** |
| `04` | §5 heading "SoD APIs" → "Protected-Action / SoD APIs" | **Cosmetic nit 3 fixed** |
| `05` | §2.3 duplicate "2." constraint renumbered to "3." | Cosmetic renumber |
| `07` | §7 precedence typo `CFC-01` → `CFG-01` | **Cosmetic nit 2 fixed** |
| `11`, `README` | self-reference / version | Non-substantive |

---

## No substantive change

All five resolved critical gaps (approval-execution binding, protected-action registry, SoD risk-acceptance/meta-SoD, break-glass ceiling, CFG-01/SEC-01 interim contracts) and all seven corrections carry over unchanged from the verified v1.1. Schema (18 tables + cache-version), APIs, workflows (WF-01…13), FR-001–030, prohibited behaviours #1–29, error codes, and the 94-test suite are identical.

## Verdict

IAM-02 v1.2 is a **clean, non-substantive accepted rollup** that additionally cleared all three cosmetic items from the v1.1 final verification. It inherits the v1.1 "fully resolved" verdict. No re-review required.

**Module baseline:** FND-01 v1.2 · IAM-01 v1.2 · **IAM-02 v1.2 accepted.** Next: SEC-01 Audit Log / Security Monitoring.
