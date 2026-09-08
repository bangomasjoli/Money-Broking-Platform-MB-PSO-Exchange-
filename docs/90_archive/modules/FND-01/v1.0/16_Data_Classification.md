# FND-01 Platform Foundation  
## 16 Data Classification

## 1. Data Classification Model

FND-01 uses the master data classification model:

1. Public.
2. Internal.
3. Confidential.
4. Restricted.
5. Highly Restricted.
6. Financial Critical.
7. Security Critical.

---

## 2. FND-01 Data Inventory

| Data | Classification | Notes |
|---|---|---|
| Health status | Internal | Public exposure depends deployment |
| Readiness status | Confidential | May reveal dependency state |
| Version/build metadata | Confidential | Artifact and environment info |
| Module registry | Confidential | Module activation status |
| Release registry | Confidential | Release and deployment metadata |
| Artifact hash | Confidential | Evidence/security metadata |
| Config baseline key names | Confidential / Restricted | May reveal architecture |
| Config baseline values | Must not store plaintext | Store hash/reference only |
| Config drift result | Confidential / Restricted | May reveal unsafe config |
| Smoke test result | Confidential | Deployment evidence |
| Smoke test evidence | Confidential / Restricted | Depends evidence |
| Request ID | Internal | Trace identifier |
| Correlation ID | Internal | Trace identifier |
| Actor ID in foundation logs | Confidential | User/service reference |
| Source IP/device metadata | Restricted | Security metadata |
| Outbox metadata | Confidential / Restricted | Depends event |
| Idempotency metadata | Confidential / Financial Critical where money action | Depends action |
| Error logs | Internal / Confidential | Must be scrubbed |
| Sensitive read logs | Restricted | Audit evidence |

---

## 3. Field-Level Rules

### 3.1 Never Store Plaintext

FND-01 must not store plaintext:

1. Production secrets.
2. API keys.
3. Passwords.
4. OTPs.
5. Session tokens.
6. Full vendor credentials.
7. Full sensitive config values.

### 3.2 Hash or Reference Only

Use hash/reference for:

1. Config baseline values.
2. Artifact identity.
3. Sensitive config comparison.
4. Deployment evidence link.
5. Secret references.

### 3.3 Masking

Mask in logs/UI:

1. Environment secrets.
2. Credential references.
3. Source IP where unnecessary.
4. User identifiers where not needed.
5. Config values.

---

## 4. Access Controls by Classification

| Classification | Control |
|---|---|
| Internal | Staff/system access |
| Confidential | Role-based access |
| Restricted | Role + sensitive read logging |
| Highly Restricted | Special permission + approval where applicable |
| Financial Critical | Strong control, audit, reconciliation |
| Security Critical | Security/admin restricted, audit, KMS/vault where applicable |

---

## 5. Retention

| Data Type | Retention |
|---|---|
| Release registry | Release evidence retention |
| Smoke evidence | Deployment evidence retention |
| Config drift | Operational/security retention |
| Module registry | Platform life + records policy |
| Outbox/idempotency | Action-specific retention |
| Logs | Security/operations retention |
| Audit references | Audit retention policy |

---

## 6. Data Residency

FND-01 deployment and evidence data must follow approved data residency rules.

Rules:

1. Production data residency must be approved before go-live.
2. Evidence repository location must be approved.
3. Logs/monitoring location must be approved.
4. Backup location must be approved.
5. Cross-border tooling must be reviewed.
