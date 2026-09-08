# AML-01 Sanctions / PEP / Adverse Media / Travel Rule Screening
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| Screening case | Restricted / Compliance Sensitive | Access controlled |
| Screening result | Restricted / Compliance Sensitive | Audit retained |
| Match candidate | Restricted / Compliance Sensitive | Analyst/Compliance only |
| Match decision | Restricted / Security Critical | Approval/audit |
| AML outcome | Restricted / Compliance Sensitive | Outcome publication |
| List/provider version | Restricted / Integrity Evidence | Version controlled |
| Vendor payload hash | Security Critical | Integrity evidence |
| Travel Rule screening | Restricted / Compliance Sensitive | Transfer-related control |
| STR/suspicion case | Highly Restricted / AML Sensitive | MLRO/Compliance only |
| Tipping-off restriction | Security Critical | Client-hidden |
| Sensitive access log | Security Critical | SEC-01 logged |
| Evidence export | Restricted / Security Critical | Approval/logging |

---

## 2. Prohibited Data Exposure

AML-01 should not expose:

1. STR/suspicion indicators to client-facing users.
2. Tipping-off reasons to clients.
3. Raw vendor reports to unauthorised users.
4. Raw adverse media details to non-compliance roles.
5. Watchlist details beyond role-scoped need.
6. Full Travel Rule personal data beyond permitted scope.
7. Secrets/API keys.
8. Raw documents owned by KYC/evidence store.

---

## 3. Access Principles

1. Least privilege.
2. IAM-02 permission guard.
3. Step-up for sensitive export.
4. SEC-01 audit for sensitive read/export.
5. STR case access restricted to Compliance/MLRO/approved roles.
6. Client-facing roles receive only safe operational status.
7. Role-based redaction required.
8. Vendor service account scoped and source-authenticated.
9. Export packages expire.

---

## 4. Retention

| Data | Retention |
|---|---|
| Screening case | AML/CFT regulatory retention |
| Screening result | AML/CFT regulatory retention |
| Match decision | AML/CFT regulatory retention |
| AML outcome | AML/CFT regulatory retention |
| STR/suspicion case | AML/CFT/STR retention |
| Travel Rule screening | Travel Rule/AML retention |
| Sensitive access log | Security/audit retention |
| Evidence export | Export/evidence retention |

## v1.1 Data Classification Additions

Additional protected data:

| Data | Classification | Protection |
|---|---|---|
| Pre-transaction screening decision | Restricted / Security Critical | Short-lived, action-scoped |
| List update event / freshness proof | Security Critical | Integrity/audit |
| Ownership-based sanctions result | Restricted / Compliance Sensitive | KYC/AML scoped |
| Screening input quality record | Restricted / Compliance Sensitive | Input-quality audit |
| STR statutory clock/deadline | Highly Restricted / AML Sensitive | MLRO/Compliance only |
| False-positive attestation | Restricted / Security Critical | Dual review / expiry |
| Outcome hash/revocation | Security Critical | CLT verification |
| PEP/RCA details | Restricted / Compliance Sensitive | Role-redacted |
| High-risk jurisdiction screening | Restricted / Compliance Sensitive | AML scoped |
| De-listing review | Restricted / Compliance Sensitive | Approval/audit |
| Travel Rule policy/threshold/sunrise | Restricted / Compliance Sensitive | Transfer-related control |

Rules:

1. STR clock and suspicion data are never client-visible.
2. Pre-transaction decision is short-lived and action-scoped.
3. Outcome hash/revocation is integrity-critical.
4. False-positive attestation evidence is restricted.
5. Travel Rule personal data is minimised and scoped.
