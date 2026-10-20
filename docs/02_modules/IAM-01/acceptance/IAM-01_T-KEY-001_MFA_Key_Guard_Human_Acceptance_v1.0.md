---
document_id: IAM-01-ACC-004
title: IAM-01 T-KEY-001 MFA Encryption-Key Startup Guard — Human Acceptance Record (v1.0)
version: N/A
document_status: APPROVED
implementation_status: ACCEPTED
module: IAM-01
control: MFA TOTP-secret encryption key (IAM_MFA_SECRET_ENC_KEY) startup guard — D-KEY-01 / CAN-KEY-01 / B2-01
owner: Unassigned
effective_date: 2026-10-21
last_reviewed: 2026-10-21
supersedes: none
baseline_commit: e92c578
---

# IAM-01 T-KEY-001 — MFA Encryption-Key Startup Guard: Human Acceptance Record

This is a **human-led acceptance** of an independently reviewed implementation. It is not a model-generated decision. It does not authorise deployment of any kind.

| Item | Detail |
|---|---|
| Task | T-KEY-001 — IAM-01 MFA Encryption Key Startup Guard (not a conductor-managed task; no `docs/03_implementation/tasks/T-KEY-001/` folder or `task.json` exists or is created by this record) |
| Policy | D-KEY-01, as approved by the project owner. The policy text was not found as a durable repository document; see §6. |
| Baseline SHA | `e92c578ffa08465ae9b98422f41cf82545db4c7b` |
| Implementation commit | `e3666636280b92fa3edeca9db6ef7e338764f706` — `fix(iam): fail closed on unsafe MFA keys in protected environments` |
| Branch | `task/T-KEY-001-iam-mfa-key-guard` (local only; not pushed, not merged) |
| Reviewed files | `platform/services/iam/src/config.ts`, `platform/tests/unit/iam-config.test.ts` (the commit contains exactly these two files, +287 / −12) |
| Independent review verdict | **ACCEPT WITH NON-BLOCKING FINDINGS** (technical recommendation only) |
| Human acceptance decision | **ACCEPTED WITH NON-BLOCKING FINDINGS** |
| Human owner approval date | 21 October 2026 (Malaysia local date) |
| Approver | The project owner, who gave the approval in a ChatGPT conversation and relayed it to this repository's working session |

## 1. Accepted scope

- A startup guard in `loadIamConfig` for `IAM_MFA_SECRET_ENC_KEY`.
- `uat`, `demo`, `staging` and `prod` are protected. The key is required there and the development placeholder is rejected. `staging` follows `PRODUCTION` through `canonicalEnvironment`.
- Required format: base64url (RFC 4648 §5, unpadded) of exactly 32 bytes, 43 characters, canonical spelling only.
- `dev` and `qa` keep the existing development fallback and accept any explicit non-empty key unchanged.
- The existing SHA-256 derivation (`deriveMfaEncryptionKey`) and AES-256-GCM implementation (`mfa-secret-crypto.ts`) are unchanged. The configured, trimmed string is still what is hashed.
- No migrations, no database changes, no production configuration changes.

## 2. Verification evidence

| Check | Result | When |
|---|---|---|
| `npx vitest run tests/unit/iam-config.test.ts` | 80/80 passed | Independent review, and again immediately before the implementation commit, against an identical diff |
| `npx tsc -b services/iam` | exit 0, no errors | Same two occasions |
| `npx vitest run tests/unit` | 136 files, 2684 tests, all passed | Independent review only, on the then-uncommitted working tree; not re-run for the commit |
| `npx vitest run tests/integration/iam-session-introspection.test.ts` | 15 passed, **33 skipped** | Independent review only |

The 33 skipped tests are the database-gated tests, skipped because `TEST_DATABASE_URL` was unavailable. **No database integration test was executed, and none is claimed.** The change does not touch any database-dependent path, but that is a code-reading observation, not a test result.

## 3. Non-blocking findings carried forward

- **NB-01** — `platform/.env.example` (lines 59–61) still carries passphrase guidance and a `CHANGE_ME_…PASSPHRASE` example that protected environments now reject. To be corrected in a separately authorised documentation alignment. This record does not change `.env.example`.
- **NB-02** — Some negative tests (short, malformed and wrong-length keys; empty and whitespace-only keys) assert that exactly one MFA-key issue is reported but not which failure reason. They should assert the specific reason. The owner has ruled that no separate review cycle is required.

## 4. Known limitations

- Format validity does not prove entropy. A canonical but low-entropy key, for example 43 `A` characters, passes the guard.
- Key rotation and KMS/HSM integration remain unimplemented.
- MFA recovery and reset remain unimplemented.
- The crypto library header still uses the word "passphrase", intentionally untouched.

## 5. Legacy-key deployment caveat

The guard fails startup closed. The key is derived by hashing the configured string, so a legacy non-compliant key cannot be re-encoded into a compliant one without changing the derived key and making existing encrypted MFA factors undecryptable. Therefore:

- A fresh protected environment with no enrolled factors needs only a properly generated key supplied by the operator.
- An environment already using a compliant key is unaffected.
- An environment that holds enrolled factors under a legacy non-compliant key needs a **separately authorised, controlled transition** before this change is deployed there. No such transition is designed or authorised by this record.
- The repository holds no evidence of which environments, if any, currently hold enrolled factors. That must be established before any deployment.

## 6. Provenance and limitations of this record

- The independent review was delivered as a conversational report to the owner in this working session. It is **not committed to the repository** and has no durable source file. No reviewer execution ID exists or is invented. The §2 evidence above is restated from that report and, where stated, re-verified immediately before the commit.
- The owner's approval was given outside this repository (ChatGPT, 21 October 2026) and relayed to this session. No transcript of it is held here.
- The D-KEY-01 policy text was not located in the repository during review. Conformity was assessed against the task brief and the implementation's own comments.

## 7. Governance boundary

- **CAN-KEY-02 remains OPEN.**
- **Production deployment is NOT authorised.** Acceptance of this implementation does not mean it is production-ready, and no environment is approved for deployment by this record.
- This record does not push or merge anything, modify `DEC-015`, close any finding, edit `DECISION_LOG.md`, or change the master architecture, licence-scope rules or the conductor.
- This record is not yet listed in `docs/DOCUMENT_REGISTER.md` or the IAM-01 module README index. Whether and how to register it requires a separate governance checkpoint.
