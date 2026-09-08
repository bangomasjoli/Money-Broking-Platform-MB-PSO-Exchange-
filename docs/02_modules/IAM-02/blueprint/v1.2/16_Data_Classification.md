# IAM-02 RBAC / Permission Guard / SoD  
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Role catalogue | Confidential | Access controlled |
| Permission catalogue | Confidential / Restricted | Access controlled |
| Role-permission assignment | Restricted | Audit required |
| User-role assignment | Restricted | Audit required |
| Permission override | Restricted / Security Critical | Approval and audit |
| Approval policy | Restricted | Maker-checker |
| Approval request | Restricted | Audit and access control |
| Approval decision | Restricted | Audit and evidence |
| SoD rule | Restricted / Security Critical | Controlled changes |
| SoD check result | Restricted | Evidence retention |
| Delegation | Restricted | Expiry and audit |
| Temporary permission | Security Critical | Expiry and audit |
| Break-glass request | Security Critical | Approval, alert, post-review |
| Permission decision log | Restricted / Security Critical | Retention and access control |
| Permission decision token | Security Critical | Hash/reference only |
| Approval payload hash | Restricted / Security Critical | Integrity evidence |
| Protected-action registry | Restricted | Change controlled |
| SoD risk acceptance | Security Critical | Approval/evidence required |
| SoD matrix version/hash | Security Critical | Integrity evidence |
| Break-glass whitelist | Security Critical | Change controlled |
| Config-sealed licence-lock list | Security Critical | Integrity protected |
| Permission cache version | Internal / Confidential | Integrity control |
| Sensitive read log | Restricted | Audit evidence |
| Step-up assertion reference | Security Critical | Reference only |

---

## 2. Prohibited Storage

IAM-02 must not store:

1. IAM-01 session tokens.
2. IAM-01 refresh tokens.
3. IAM-01 MFA codes.
4. Plaintext secrets.
5. Full sensitive business payloads where `payload_ref` is sufficient.
6. Production credentials.
7. Private keys.
8. Unmasked STR/suspicious report content.
9. Raw decision token.
10. Full sensitive approval payload where hash/ref is enough.

---

## 3. Access Controls

1. Users may not read full permission evidence unless authorised.
2. Sensitive permission reads are audit logged.
3. Break-glass records are Security Critical.
4. Permission exports require approval.
5. SoD matrix changes require approval.
6. Role/permission changes require audit.
7. Service accounts receive least-privilege scoped access only.

---

## 4. Retention

| Data | Retention |
|---|---|
| Role/permission catalogue | Life of platform + records policy |
| Assignment history | Records/audit retention |
| Approval evidence | Audit/regulatory retention |
| SoD checks | Audit/regulatory retention |
| Delegation/temporary grants | Active + post-expiry audit retention |
| Break-glass evidence | Security/audit retention |
| Permission decision logs | Security/audit retention |
| Sensitive read logs | Security/audit retention |
| Reconciliation results | Operational/security retention |
| Protected-action registry changes | Security/audit retention |
| Decision token records | Short retention + audit/security retention |
| SoD risk acceptance | Audit/regulatory retention |
| SoD matrix versions | Life of platform + audit retention |
| Break-glass whitelist | Life of whitelist + audit retention |
