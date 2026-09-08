# SEC-01 Audit Log / Security Monitoring  
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Audit event | Restricted / Security Critical | Immutable, access controlled |
| Event metadata | Confidential / Restricted | Redacted |
| Hash chain | Security Critical | Integrity protected |
| Batch seal | Security Critical | Integrity protected |
| External seal anchor | Security Critical | WORM/object-lock/trusted timestamp |
| Trusted timestamp reference | Security Critical | Integrity protected |
| Event schema | Restricted | Change controlled |
| Security alert | Restricted / Security Critical | Access controlled |
| Triage notes | Restricted | Safe notes only |
| Evidence export | Restricted / Security Critical | Approved, watermarked, logged |
| Sensitive read log | Restricted | Immutable |
| Integrity verification result | Security Critical | Audit retained |
| Interim audit handoff | Security Critical | Reconciled |
| Retention/legal hold | Restricted / Legal | Controlled |
| Audit correction | Security Critical | Append-only |
| Source emission sequence | Security Critical | Completeness evidence |
| Source identity binding | Security Critical | Ingestion authenticity |
| Expected event reconciliation | Security Critical | Missing event evidence |
| Recovery integrity result | Security Critical | Restore authority evidence |
| Incident break-glass read log | Security Critical | Emergency read evidence |

---

## 2. Prohibited Data in SEC-01 Metadata

Never store:

1. Passwords.
2. MFA codes.
3. Refresh/access tokens.
4. Private keys.
5. API secrets.
6. Full bank/card sensitive data.
7. Unmasked suspicious transaction report contents.
8. Full client confidential documents where reference is enough.
9. Plaintext production credentials.
10. Wallet private keys.
11. Raw unnecessary PII where reference/pseudonym is enough.

---

## 3. Redaction Rules

1. Store references instead of full secrets.
2. Store hashes where evidence is enough.
3. Store masked values where operationally needed.
4. Redact metadata for lower-privilege readers.
5. Sensitive export may include fuller metadata only when approved.
6. STR/suspicious report content should use case reference, not raw content, unless explicitly authorised in a compliance evidence package.
7. PII should be reference-based or pseudonymised where possible.
8. Immutable audit evidence may be retained despite erasure requests where legal/regulatory basis applies.
9. Storage jurisdiction for PSO/payment audit data must be approved before production.

---

## 4. Retention Classes

| Class | Example |
|---|---|
| Security Critical | Hash mismatch, break-glass, permission escalation |
| Regulated Activity | KYC/AML/trade/ledger/settlement events |
| Authentication | Login/MFA/session events |
| Operational | Jobs/deployment/config changes |
| Evidence Export | Export packages/manifests |
| Sensitive Read | Audit searches/downloads |
| Legal Hold | Events under hold |

Final retention period, legal/regulatory basis, and storage jurisdiction to be approved by Compliance/Legal/Board.

---

## 5. Access Principles

1. Least privilege.
2. IAM-02 permission guard required.
3. Step-up for sensitive read/export.
4. Approval for sensitive export.
5. Sensitive read logged.
6. Service account scoped by source/module.
7. No direct DB read for ordinary users.
8. Audit admin cannot hide own access.
