# CFG-01 Feature Flag / Licence Lock  
## 04 API Specification

## 1. API Principles

All CFG-01 APIs use FND envelope, request ID, correlation ID, idempotency, and standard error format.

Sensitive read/write APIs require IAM-02 permission guard.

Sensitive actions emit SEC-01 audit events.

---

## 2. Runtime Decision APIs

### 2.1 POST `/internal/cfg1/features/evaluate`

Purpose: evaluate feature/licence availability.

Request:

```json
{
  "feature_code": "exchange.matching_engine",
  "action": "execute",
  "resource": "trade",
  "environment": "production",
  "client_id": "client_...",
  "client_class": "institutional",
  "module": "PRD-...",
  "context": {
    "amount": "10000.00",
    "currency": "USD"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "decision": "deny",
    "reason_code": "exchange_pending_locked",
    "feature_config_version": 10,
    "licence_profile_version": 3,
    "prohibited_registry_version": 7,
    "prohibited_registry_hash": "sha256:...",
    "integrity_status": "verified",
    "decision_token": null,
    "expires_at_utc": null
  }
}
```

Decision values:

```txt
allow
deny
locked
prohibited
unknown_fail_closed
stale_revalidate
```

### 2.2 POST `/internal/cfg1/features/verify-decision`

Verify feature decision token/reference before execution.

Rules:

1. Token must match feature/action/resource/client/environment.
2. Token must not be expired.
3. Token must match current feature and licence profile version.
4. Token must match current prohibited-registry version and hash.
5. Stale token fails closed.

---

## 3. Feature Registry APIs

### 3.1 GET `/cfg1/features`

List feature registry.

### 3.2 GET `/cfg1/features/{feature_code}`

Read feature.

### 3.3 POST `/cfg1/features`

Create feature registry entry.

Requires IAM-02 approval.

### 3.4 PATCH `/cfg1/features/{feature_code}`

Update feature metadata.

Requires IAM-02 approval.

---

## 4. Feature State APIs

### 4.1 POST `/cfg1/features/{feature_code}/change-request`

Request feature state change.

### 4.2 POST `/cfg1/features/{feature_code}/enable`

Enable feature after approved workflow.

Rules:

1. Not allowed for prohibited feature.
2. Not allowed when licence profile locked.
3. Requires approval.
4. Requires SEC-01 audit.

### 4.3 POST `/cfg1/features/{feature_code}/disable`

Disable feature.

### 4.4 POST `/cfg1/features/{feature_code}/kill-switch`

Emergency disable feature.

---

## 5. Licence Profile APIs

### 5.1 GET `/cfg1/licence-profiles`

Read licence profiles.

### 5.2 POST `/cfg1/licence-profiles/change-request`

Request licence profile change.

### 5.3 POST `/cfg1/licence-profiles/{profile_id}/activate`

Activate approved licence profile version.

Requires Compliance and Management/Board approval where high risk.

### 5.4 POST `/cfg1/exchange-activation-ceremonies`

Create Exchange activation ceremony.

### 5.5 POST `/cfg1/exchange-activation-ceremonies/{ceremony_id}/verify-evidence`

Verify LFSA licence evidence authenticity.

### 5.6 POST `/cfg1/exchange-activation-ceremonies/{ceremony_id}/complete-step`

Complete ceremony step.

### 5.7 POST `/cfg1/exchange-activation-ceremonies/{ceremony_id}/activate-feature`

Activate an Exchange feature only after full ceremony and deployment gate.


Activate approved licence profile version.

Requires Compliance and Management/Board approval where high risk.

---

## 6. Prohibited Feature APIs

### 6.1 GET `/cfg1/prohibited-features`

Read prohibited features.

### 6.2 POST `/cfg1/prohibited-features`

Create/update prohibited feature.

Requires Compliance + Security + Management approval.

Prohibited features cannot be enabled as ordinary flags.

---

## 7. Deployment Gate APIs

### 7.1 POST `/internal/cfg1/deployment-gate/check`

Deployment pipeline gate check.

Request:

```json
{
  "deployment_id": "dep_...",
  "environment": "production",
  "features_to_activate": ["client.onboarding.institutional"],
  "release_version": "..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "gate_result": "pass",
    "blocking_findings": [],
    "evidence_refs": []
  }
}
```

---

## 8. Reconciliation APIs

### 8.1 POST `/internal/cfg1/reconciliation/handoff`

Run IAM-02/SEC-01 interim handoff reconciliation.

### 8.2 POST `/internal/cfg1/reconciliation/drift`

Run runtime/deployment/registry drift reconciliation.

### 8.3 POST `/internal/cfg1/reconciliation/gate-coverage`

Run feature-gate coverage reconciliation against IAM-02 protected-action registry.

### 8.4 POST `/internal/cfg1/reconciliation/config-integrity`

Run config integrity verification against signed Doc 00 baseline.

### 8.5 GET `/cfg1/reconciliation-runs/{run_id}`

Read reconciliation result.

---

## 9. Evidence APIs

### 9.1 POST `/cfg1/evidence-exports`

Request licence/feature evidence export.

### 9.2 GET `/cfg1/evidence-exports/{export_id}`

Read export status.

---

## 10. Error Codes

| Code | Meaning |
|---|---|
| `CFG1_FEATURE_UNKNOWN` | Feature not found |
| `CFG1_FEATURE_DENIED` | Feature denied |
| `CFG1_FEATURE_PROHIBITED` | Feature prohibited |
| `CFG1_LICENCE_LOCKED` | Licence lock blocks feature |
| `CFG1_EXCHANGE_PENDING_LOCKED` | Exchange feature locked pending approval |
| `CFG1_RETAIL_DEFAULT_LOCKED` | Retail default onboarding locked |
| `CFG1_AIX_SPREAD_MARKUP_PROHIBITED` | AIX spread markup prohibited |
| `CFG1_PRINCIPAL_DEALING_PROHIBITED` | Principal dealing prohibited |
| `CFG1_MARKET_MAKING_PROHIBITED` | Market making prohibited |
| `CFG1_APPROVAL_REQUIRED` | IAM-02 approval required |
| `CFG1_STEP_UP_REQUIRED` | IAM-01 step-up required |
| `CFG1_FEATURE_VERSION_STALE` | Feature version stale |
| `CFG1_DECISION_TOKEN_INVALID` | Decision token invalid |
| `CFG1_AUDIT_REQUIRED` | SEC-01 audit required but unavailable |
| `CFG1_DEPLOYMENT_GATE_BLOCKED` | Deployment gate blocked |
| `CFG1_INTERIM_HANDOFF_MISMATCH` | Interim lock list mismatch |
| `CFG1_DRIFT_DETECTED` | Feature/runtime/deployment drift detected |
| `CFG1_KILL_SWITCH_BLOCKED` | Kill-switch attempted prohibited action |
| `CFG1_CONFIG_INTEGRITY_FAILED` | Licence/prohibited config integrity failed |
| `CFG1_OUT_OF_BAND_CONFIG_CHANGE` | Unsigned/out-of-band config change detected |
| `CFG1_EXCHANGE_ACTIVATION_CEREMONY_REQUIRED` | Exchange activation requires ceremony |
| `CFG1_LFSA_EVIDENCE_UNVERIFIED` | Licence evidence authenticity not verified |
| `CFG1_FEATURE_GATE_TOKEN_REQUIRED` | IAM-02-bound CFG decision token required |
| `CFG1_FEATURE_GATE_ORPHAN` | Feature-gated action not invoking CFG-01 |
| `CFG1_AUDIT_OUTBOX_REQUIRED` | FND audit outbox enqueue required |
| `CFG1_NONPROD_LOCKED_FEATURE_PROMOTION` | Locked non-prod feature cannot be promoted |
| `CFG1_SYNTHETIC_ENV_ONLY` | Feature allowed only in synthetic quarantined environment |
| `CFG1_TOKEN_REVOKED_BY_KILL_SWITCH` | Token revoked by kill-switch |
| `CFG1_TOKEN_REVOKED_BY_LICENCE_CHANGE` | Token revoked by licence suspension/revocation |
