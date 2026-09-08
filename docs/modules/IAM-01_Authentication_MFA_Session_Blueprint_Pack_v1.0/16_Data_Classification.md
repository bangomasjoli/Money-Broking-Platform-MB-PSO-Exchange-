# IAM-01 Authentication / MFA / Session  
## 16 Data Classification

## 1. Data Inventory

| Data | Classification | Protection |
|---|---|---|
| User identifier | Confidential / Restricted | Normalised, access controlled |
| Password plaintext | Prohibited | Never stored/logged |
| Password hash | Security Critical | Adaptive hash, restricted |
| Password reset token | Security Critical | Hash only |
| MFA TOTP seed | Security Critical | Field-level encrypted |
| WebAuthn public key | Confidential | Access controlled |
| WebAuthn credential ID | Restricted | Hash/reference |
| Recovery code | Security Critical | Hash/encrypted, show once |
| MFA challenge | Confidential | Short-lived |
| Session token | Security Critical | Returned once, never logged |
| Refresh token | Security Critical | Hash only in DB |
| Session metadata | Confidential / Restricted | Access controlled |
| Source IP | Restricted | Hash/mask where stored |
| Device fingerprint | Restricted | Hash |
| Account lockout record | Confidential / Restricted | Security metadata |
| Service account credential | Security Critical | KMS/vault reference only |
| Auth event metadata | Confidential / Restricted | Audit retention |
| Login notification payload | Confidential | Minimise PII |

---

## 2. Field-Level Encryption

Required for:

1. MFA secrets.
2. Recovery code material where reversible.
3. Service credential references where sensitive metadata exists.
4. Any auth secret that must be retrievable.

Hash-only required for:

1. Passwords.
2. Reset tokens.
3. Refresh tokens.
4. Device fingerprint.
5. WebAuthn credential ID where feasible.
6. Source IP where feasible.

---

## 3. Logging Prohibitions

Never log:

1. Plaintext password.
2. Password hash.
3. Reset token.
4. Session token.
5. Refresh token.
6. MFA code.
7. MFA seed.
8. Recovery code.
9. Full service credential.
10. Full device fingerprint.

---

## 4. Retention

| Data | Retention |
|---|---|
| Password hash | While account active + policy |
| Reset tokens | Short retention after expiry/use |
| MFA factors | Active + post-revocation retention |
| Sessions | Active + security retention |
| Refresh tokens | Token family retention |
| Device registry | Security retention |
| Lockout records | Security retention |
| Auth events | Audit/security retention |
| Service account metadata | Life of account + records retention |

---

## 5. Access Control

1. User may access own session/device metadata only.
2. Staff access requires IAM-02 permission.
3. Sensitive auth metadata read is audit logged.
4. Service credentials not viewable in plaintext.
5. Auth data exports require approval.
