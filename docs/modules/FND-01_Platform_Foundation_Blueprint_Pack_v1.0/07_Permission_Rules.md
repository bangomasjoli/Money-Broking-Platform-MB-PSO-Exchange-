# FND-01 Platform Foundation  
## 07 Permission Rules

## 1. Permission Scope

FND-01 permissions are limited to foundation visibility and operational checks.

They do not allow:

1. Direct ledger edit.
2. Direct balance edit.
3. Audit delete/modify.
4. Feature flag override.
5. Licence-lock override.
6. Business workflow approval.
7. Client-money action.
8. Exchange module activation.

---

## 2. Roles

| Role | FND-01 Access |
|---|---|
| TECH_ADMIN | Full foundation operational access |
| SECURITY_ADMIN | Security-related foundation status and alerts |
| ADMIN | Limited foundation status view |
| SUPER_ADMIN | Administrative view subject to no-bypass restrictions |
| AUDITOR | Read-only foundation evidence |
| MANAGEMENT | Read-only deployment/readiness dashboard |
| SYSTEM_JOB | Internal scheduled jobs |
| INTEGRATION_SERVICE | Internal service access where approved |

---

## 3. Permissions

| Permission | Description | Default Roles |
|---|---|---|
| `foundation.health.read` | Read health status | TECH_ADMIN, SECURITY_ADMIN, SYSTEM_JOB |
| `foundation.readiness.read` | Read readiness | TECH_ADMIN, SECURITY_ADMIN, SYSTEM_JOB |
| `foundation.version.read` | Read version/build metadata | TECH_ADMIN, AUDITOR, MANAGEMENT |
| `foundation.module_registry.read` | Read module registry | TECH_ADMIN, ADMIN, AUDITOR |
| `foundation.module_registry.manage` | Manage non-licence module metadata | TECH_ADMIN |
| `foundation.smoke.run` | Run smoke test | TECH_ADMIN, SYSTEM_JOB |
| `foundation.smoke.read` | Read smoke test evidence | TECH_ADMIN, AUDITOR, MANAGEMENT |
| `foundation.config_baseline.read` | Read config baseline metadata | TECH_ADMIN, SECURITY_ADMIN, AUDITOR |
| `foundation.config_drift.run` | Run config drift check | TECH_ADMIN, SECURITY_ADMIN, SYSTEM_JOB |
| `foundation.config_drift.read` | Read config drift report | TECH_ADMIN, SECURITY_ADMIN, AUDITOR |
| `foundation.outbox.read` | Read foundation outbox status | TECH_ADMIN, SECURITY_ADMIN |
| `foundation.idempotency.read` | Read foundation idempotency status | TECH_ADMIN, AUDITOR where approved |

---

## 4. Prohibited Permissions

The following must not exist:

```txt
foundation.bypass_permission_guard
foundation.bypass_feature_flag
foundation.bypass_licence_lock
foundation.disable_audit
foundation.delete_audit
foundation.edit_ledger
foundation.edit_balance
foundation.enable_exchange_module
foundation.enable_matching_engine
foundation.view_plaintext_secret
```

---

## 5. Maker-Checker Requirements

Maker-checker is required for:

1. Production module activation.
2. Foundation config baseline change.
3. Critical drift risk acceptance.
4. Production smoke-test risk acceptance.
5. Deployment readiness override.
6. Any foundation action affecting production safety.

---

## 6. SoD Rules

1. Maker cannot approve same foundation config change.
2. Deployment requester cannot solely approve production readiness override.
3. Critical drift resolver cannot approve own closure where high risk.
4. Break-glass grantor cannot be recipient.
5. Super Admin cannot bypass licence-lock restrictions.

---

## 7. Sensitive Read Logging

Sensitive read logging required for:

1. Config baseline where sensitive references exist.
2. Deployment evidence.
3. Drift reports containing environment/config details.
4. Outbox dead-letter evidence.
5. Idempotency records for sensitive actions.

---

## 8. Permission Test Requirements

1. Unauthorized user cannot read readiness details.
2. Auditor can read evidence but cannot run smoke tests.
3. Admin cannot activate future-locked module.
4. Tech Admin cannot bypass licence lock.
5. System job can run scheduled checks but cannot perform human approvals.
6. Sensitive read is audit logged.
