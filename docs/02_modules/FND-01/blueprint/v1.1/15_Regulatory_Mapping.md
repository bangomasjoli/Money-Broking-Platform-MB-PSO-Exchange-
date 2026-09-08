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


---

## 7. Rule-ID Traceability Mapping

| FND Control | Rule IDs / Master Controls | FND Tests |
|---|---|---|
| Licence-lock / Exchange component block | LIC-RULE-001, LIC-RULE-002, LIC-RULE-003, LIC-RULE-004, CFG-RULE-001, CFG-RULE-002, CFG-RULE-003 | FND-TC-006, FND-TC-028, FND-TC-052, FND-TC-059 |
| Default deny / fail closed | SYS-RULE-001, GOV-RULE-001 | FND-TC-002, FND-TC-006, FND-TC-021 |
| Input validation / rate limiting | SYS-RULE-005 | FND-TC-015 to FND-TC-019, FND-TC-082 to FND-TC-085 |
| Security / encryption / log scrubbing | SEC-RULE-003, DATA-RULE-001 | FND-TC-045 to FND-TC-047 |
| Audit logging | SEC-RULE-001, SEC-RULE-002 | FND-TC-037 to FND-TC-041, FND-TC-077 to FND-TC-081 |
| Break-glass / privileged controls | IAM-RULE-001, IAM-RULE-002 | FND-TC-056 to FND-TC-060 |
| Module boundary enforcement | SYS-RULE-001, GOV-RULE-001 | FND-TC-030 to FND-TC-032 |
| Per-client isolation baseline | DATA-RULE-001, CLT-RULE-002 | FND-TC-012, FND-TC-013, FND-TC-074, FND-TC-075 |
| Scheduler / reliability | REL-RULE-001, SAFE-RULE-001, SET-RULE-002 | FND-TC-061 to FND-TC-069 |
| Idempotency / outbox | LED-RULE-004, SEC-RULE-001 | FND-TC-039 to FND-TC-043, FND-TC-077 to FND-TC-081 |
| Deployment / go-live evidence | GOV-RULE-001, REL-RULE-001 | FND-TC-050 to FND-TC-055, FND-TC-086 to FND-TC-088 |
| Data residency / evidence | DATA-RULE-002, REC-RULE-001 | FND-TC-054, FND-TC-086 |

---

## 8. Workflow Traceability Mapping

| Workflow | Purpose | Tests |
|---|---|---|
| WF-FND-01 | Application startup | FND-TC-001 to FND-TC-008 |
| WF-FND-02 | Request lifecycle | FND-TC-009 to FND-TC-019 |
| WF-FND-03 | Module registration | FND-TC-026 to FND-TC-032 |
| WF-FND-04 | Health check | FND-TC-020 to FND-TC-025 |
| WF-FND-05 | Deployment smoke hook | FND-TC-050 to FND-TC-055 |
| WF-FND-06 | Config drift detection | FND-TC-008, FND-TC-053 |
| WF-FND-07 | Foundation incident detection | FND-TC-041, FND-TC-052, FND-TC-063 |
| WF-FND-08 | Scheduler registration / missed-run | FND-TC-061 to FND-TC-065 |
| WF-FND-09 | Background job queue | FND-TC-066 to FND-TC-070 |
| WF-FND-10 | Rate-limit decision | FND-TC-082 to FND-TC-085 |

---

## 9. Data-Flow Traceability Mapping

| Data Flow / Data-Control Area | FND Control | Tests |
|---|---|---|
| DF-23 Auth/Session/MFA support context | Request context / correlation | FND-TC-009 to FND-TC-014 |
| DF-24 Backup/Replication/DR support evidence | Release/smoke evidence | FND-TC-024, FND-TC-054 |
| DF-26 App/Security Log and PII Scrubbing | Structured log + scrubbing | FND-TC-044 to FND-TC-047 |
| Scheduler/job async flow | Job queue and scheduler tables | FND-TC-061 to FND-TC-070 |
| Audit/outbox flow | Audit envelope and outbox | FND-TC-037 to FND-TC-043, FND-TC-077 to FND-TC-081 |
| Config drift flow | Config baseline/result | FND-TC-008, FND-TC-053 |
| Module registry flow | Module registry | FND-TC-026 to FND-TC-029 |
| DB isolation flow | Runtime grants/RLS baseline | FND-TC-071 to FND-TC-076 |

---

## 10. Traceability Parameters

```txt
module_traceability_to_rule_ids = required
module_traceability_to_workflows = required
module_traceability_to_data_flows = required
orphan_test_check = required
critical_control_coverage = 100_percent
```
