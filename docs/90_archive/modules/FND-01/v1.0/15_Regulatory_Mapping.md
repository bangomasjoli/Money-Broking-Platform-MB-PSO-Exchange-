# FND-01 Platform Foundation  
## 15 Regulatory Mapping

## 1. Purpose

FND-01 is not a direct regulatory business module, but it provides platform controls that support regulated operation under the AIX Money Broking and PSO scope.

---

## 2. Regulatory Control Mapping

| Regulatory / Governance Need | FND-01 Support |
|---|---|
| Licence boundary enforcement | Licence-lock interface and exchange component block |
| No exchange activity before approval | Future-locked module detection and smoke tests |
| Auditability | Audit event envelope and correlation IDs |
| Operational resilience | Health/readiness, config drift, smoke tests |
| Controlled deployment | Release/artifact/version metadata |
| Data protection | Log scrubbing and request-context discipline |
| Security controls | Foundation for auth/RBAC/security modules |
| Client-money safety | Prevents unsafe runtime and supports outbox/idempotency baseline |
| Records/evidence | Smoke/deployment evidence linkage |
| Management oversight | Version, module registry, readiness dashboards |

---

## 3. Licence-Scope Mapping

| Licence Risk | Foundation Control |
|---|---|
| Exchange feature accidentally enabled | Module registry and smoke test detect active exchange components |
| Matching engine accidentally deployed | Prohibited component check |
| Client-to-client matching enabled | Feature/licence lock interface |
| Principal-dealing helper created | Prohibited behaviour list |
| Spread markup helper created | Prohibited behaviour list and module review |
| Retail onboarding default enabled | Licence lock / feature flag integration point |

---

## 4. AML/CFT Support

FND-01 supports AML/CFT indirectly by ensuring:

1. Request traceability.
2. Audit event baseline.
3. Sensitive log scrubbing.
4. Environment/config integrity.
5. Module boundary control.
6. Deployment evidence.

Actual AML/CFT logic belongs to CMP modules.

---

## 5. Records and Evidence

FND-01 evidence includes:

1. Module registry.
2. Release registry.
3. Config baseline.
4. Config drift results.
5. Smoke test records.
6. Audit event references.
7. Deployment evidence references.

---

## 6. Regulatory Open Items

1. Confirm retention period for foundation deployment evidence.
2. Confirm whether foundation smoke-test evidence is included in LFSA/internal audit pack.
3. Confirm management sign-off format for foundation go-live.
