# IAM-01 Authentication / MFA / Session  
## 05 Database Design

## 1. Schema

Recommended schema:

```txt
iam
```

Runtime DB role:

```txt
role_iam_runtime
```

Rules:

1. IAM runtime role owns/accesses `iam` schema only.
2. Other modules must not directly read `iam` tables.
3. Other modules use IAM service interfaces.
4. Migration role is separate from runtime role.
5. Sensitive fields use field-level encryption/tokenisation as required.

---

## 2. Tables

### 2.1 `iam.user_identity`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | varchar | Platform user reference |
| user_type | varchar | client/staff/admin/service |
| identifier_normalised | varchar | Email/username normalised |
| identifier_hash | varchar | Lookup hash where required |
| status | varchar | active/locked/suspended/deactivated |
| mfa_required | boolean | Policy result/cache |
| privileged_mfa_required | boolean | For privileged users |
| user_class | varchar | admin/staff/client/client_approver/service |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

### 2.2 `iam.credential_password`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | varchar | User reference |
| password_hash | varchar | Argon2id/bcrypt hash |
| hash_algorithm | varchar | Algorithm |
| hash_params | jsonb | Safe params |
| password_changed_at_utc | timestamptz | Last change |
| password_history_hashes_ref | varchar | Reference to password history where implemented |
| must_change_password | boolean | Force reset |
| failed_attempt_count | int | Local counter |
| locked_until_utc | timestamptz | Lockout |
| created_at_utc | timestamptz | Created |
| updated_at_utc | timestamptz | Updated |

Rules:

1. No plaintext password.
2. Hash params must not include secret pepper value.
3. Pepper, if used, must be in KMS/vault.

### 2.3 `iam.mfa_factor`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| factor_id | varchar | Unique |
| user_id | varchar | User |
| factor_type | varchar | totp/webauthn/security_key/recovery |
| factor_status | varchar | pending/active/revoked |
| secret_encrypted | bytea/text | Field-level encrypted where applicable |
| public_key | text | For WebAuthn where applicable |
| credential_id_hash | varchar | For WebAuthn |
| phishing_resistant | boolean | True for approved factor |
| enrolled_at_utc | timestamptz | Enrolled |
| revoked_at_utc | timestamptz | Revoked |

### 2.4 `iam.mfa_challenge`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| challenge_id | varchar | Unique |
| user_id | varchar | User |
| factor_id | varchar | MFA factor |
| challenge_type | varchar | totp/webauthn/step_up |
| status | varchar | pending/passed/failed/expired |
| expires_at_utc | timestamptz | Expiry |
| idle_expires_at_utc | timestamptz | Idle expiry |
| attempt_count | int | Attempts |
| correlation_id | varchar | FND correlation |
| created_at_utc | timestamptz | Created |
| completed_at_utc | timestamptz | Completed |

### 2.5 `iam.session`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| session_id | varchar | Unique |
| user_id | varchar | User |
| session_status | varchar | active/expired/revoked |
| issued_at_utc | timestamptz | Issued |
| expires_at_utc | timestamptz | Expiry |
| revoked_at_utc | timestamptz | Revoked |
| revoke_reason | varchar | Reason |
| user_class | varchar | Session policy class |
| auth_level | varchar | password/mfa/webauthn/step_up |
| reauth_required_at_utc | timestamptz | Periodic re-auth time |
| bound_device_id | varchar | Token binding device ref |
| risk_status | varchar | normal/step_up_required/revoked |
| device_id | varchar | Device ref |
| source_ip_hash | varchar | Hashed IP |
| user_agent_hash | varchar | Hashed UA |
| last_seen_at_utc | timestamptz | Last seen |
| correlation_id | varchar | Login correlation |

### 2.6 `iam.refresh_token`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| token_id | varchar | Token reference |
| token_hash | varchar | Hash only |
| token_family_id | varchar | Rotation family |
| session_id | varchar | Session |
| user_id | varchar | User |
| status | varchar | active/used/revoked/reused/expired |
| issued_at_utc | timestamptz | Issued |
| expires_at_utc | timestamptz | Expiry |
| used_at_utc | timestamptz | Used |
| replaced_by_token_id | varchar | Rotation link |

### 2.7 `iam.password_reset_token`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| reset_id | varchar | Unique |
| user_id | varchar | Nullable until resolved |
| token_hash | varchar | Hash only |
| status | varchar | active/used/expired/revoked |
| expires_at_utc | timestamptz | Expiry |
| requested_at_utc | timestamptz | Requested |
| used_at_utc | timestamptz | Used |
| request_context_ref | varchar | Correlation/request reference |

### 2.8 `iam.device_registry`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| device_id | varchar | Device reference |
| user_id | varchar | User |
| device_fingerprint_hash | varchar | Hash only |
| device_label | varchar | Safe display |
| first_seen_at_utc | timestamptz | First seen |
| last_seen_at_utc | timestamptz | Last seen |
| trusted_status | varchar | unknown/trusted/revoked |
| risk_status | varchar | normal/suspicious |

### 2.9 `iam.account_lockout`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| scope_hash | varchar | user/ip/device/action hash |
| user_id | varchar | nullable |
| action | varchar | login/mfa/reset/refresh |
| failed_count | int | Count |
| locked_until_utc | timestamptz | Lock expiry |
| progressive_delay_until_utc | timestamptz | Delay |
| last_failure_at_utc | timestamptz | Last failure |

### 2.10 `iam.service_account`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| service_account_id | varchar | Unique |
| service_name | varchar | Service |
| status | varchar | active/disabled/rotating |
| credential_ref | varchar | KMS/vault reference |
| scope | jsonb | Allowed scopes |
| last_rotated_at_utc | timestamptz | Rotation |
| expires_at_utc | timestamptz | Expiry |

### 2.11 `iam.step_up_assertion`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| assertion_id | varchar | Unique |
| assertion_hash | varchar | Hash/reference |
| user_id | varchar | User |
| session_id | varchar | Bound session |
| device_id | varchar | Bound device |
| purpose | varchar | Sensitive action purpose |
| action_scope | varchar | Optional scoped action reference |
| auth_level | varchar | password/mfa/webauthn |
| issued_at_utc | timestamptz | Issued |
| expires_at_utc | timestamptz | Short expiry |
| status | varchar | active/used/revoked/expired |
| correlation_id | varchar | Trace |

### 2.12 `iam.session_policy`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_class | varchar | admin/staff/client/client_approver/service |
| access_token_ttl_seconds | int | Access token TTL |
| refresh_token_ttl_seconds | int | Refresh TTL |
| idle_timeout_seconds | int | Idle timeout |
| max_session_lifetime_seconds | int | Max lifetime |
| reauth_interval_seconds | int | Periodic re-auth |
| max_concurrent_sessions | int | Max active sessions |
| token_binding_level | varchar | strict/medium/low |
| status | varchar | active/inactive |
| approved_ref | varchar | Approval evidence |

### 2.13 `iam.session_anomaly`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| anomaly_id | varchar | Unique |
| session_id | varchar | Session |
| user_id | varchar | User |
| anomaly_type | varchar | ip_change/ua_change/device_change/risk_signal |
| severity | varchar | low/medium/high |
| action_taken | varchar | allow/step_up/revoke |
| detected_at_utc | timestamptz | Detected |
| correlation_id | varchar | Trace |

### 2.14 `iam.mfa_reset_request`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| reset_request_id | varchar | Unique |
| user_id | varchar | Target user |
| requested_by | varchar | Requester |
| request_type | varchar | self_service/admin_initiated |
| status | varchar | pending/approved/rejected/completed/disabled_until_iam02 |
| approval_mode | varchar | iam01_dual_security_admin/iam02_maker_checker/manual_approved/disabled |
| approval_ref | varchar | Approval evidence |
| requested_at_utc | timestamptz | Requested |
| completed_at_utc | timestamptz | Completed |

### 2.15 `iam.password_history`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | varchar | User |
| password_hash_fingerprint | varchar | Non-reversible fingerprint/hash reference |
| algorithm | varchar | Algorithm |
| created_at_utc | timestamptz | Created |

### 2.16 `iam.auth_event`

Optional non-authoritative read model for auth event metadata. The authoritative audit record is the central SEC-01 audit store. `iam.auth_event` must only store references/index metadata and must not become a second source of truth.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| event_type | varchar | Login/reset/session/etc |
| user_id | varchar | User |
| result | varchar | success/failure/blocked |
| correlation_id | varchar | Trace |
| occurred_at_utc | timestamptz | Time |
| audit_event_ref | varchar | Audit store reference |

---

## 3. Indexes

1. `user_identity(identifier_hash)`.
2. `user_identity(user_id)`.
3. `credential_password(user_id)`.
4. `mfa_factor(user_id, factor_status)`.
5. `mfa_challenge(challenge_id, status)`.
6. `session(session_id, session_status)`.
7. `session(user_id, session_status)`.
8. `refresh_token(token_hash)`.
9. `refresh_token(token_family_id)`.
10. `password_reset_token(token_hash, status)`.
11. `device_registry(user_id, device_fingerprint_hash)`.
12. `account_lockout(scope_hash, action)`.
13. `service_account(service_account_id, status)`.
14. `step_up_assertion(assertion_hash, status)`.
15. `session_policy(user_class, status)`.
16. `session_anomaly(session_id, severity)`.
17. `mfa_reset_request(user_id, status)`.
18. `password_history(user_id, created_at_utc)`.

---

## 4. Field-Level Encryption / Hashing

| Field | Protection |
|---|---|
| password | Not stored |
| password_hash | Adaptive hash |
| reset token | Hash only |
| refresh token | Hash only |
| MFA TOTP seed | Field-level encryption |
| Recovery codes | Hash or encrypted one-way display once |
| WebAuthn credential id | Hash/reference |
| Source IP | Hash/mask where stored |
| Device fingerprint | Hash |
| Service credential | KMS/vault reference only |
| Step-up assertion | Hash/reference only |
| Password history | Non-reversible hash/fingerprint |
| Session anomaly metadata | Restricted security metadata |

---

## 5. Retention

| Data | Retention |
|---|---|
| Sessions | Active + security retention |
| Refresh tokens | Token family retention |
| Password reset tokens | Short retention after expiry/use |
| MFA factors | Active + post-revocation retention |
| Device records | Security retention |
| Lockout records | Security retention |
| Auth event metadata | Audit/security retention |
| Service account records | Life of account + records retention |
| Step-up assertions | Short retention after expiry/use |
| Session policies | Policy records retention |
| Session anomalies | Security retention |
| MFA reset requests | Security/audit retention |
| Password history | Active policy retention |

---

## 6. RLS / Tenant Scope

IAM tables are user-owned rather than client-owned in many cases.

Rules:

1. Client portal access to own sessions/devices must be scoped by authenticated user and client association.
2. Staff/admin access to auth metadata must use IAM-02 permission guard.
3. Database RLS or equivalent should protect user-owned/session-owned records where feasible.
4. Cross-user session access must be denied.

---

## 7. Audit / Outbox Atomicity

Sensitive IAM actions must write audit/outbox in the same transaction or guaranteed outbox:

1. Login success/failure.
2. MFA enrolment.
3. MFA reset.
4. Password reset.
5. Session revoke.
6. Refresh token reuse.
7. Account lock/unlock.
8. Service account credential rotation.

If required audit/outbox cannot be persisted, the sensitive action fails closed where applicable.


---

## 8. Auth Event Authority

Rules:

1. SEC-01 central audit store is authoritative for audit records.
2. `iam.auth_event` is optional and non-authoritative.
3. `iam.auth_event` may store only safe index metadata and `audit_event_ref`.
4. Any conflict between `iam.auth_event` and SEC-01 audit is resolved in favour of SEC-01.
5. Missing SEC-01 audit reference for sensitive auth action is a Critical defect.

---

## 9. Password Policy Storage

Password policy must support:

1. Minimum length.
2. Complexity/passphrase rules.
3. Password history count.
4. Breached-password check flag/provider.
5. Privileged-user stricter policy where required.
