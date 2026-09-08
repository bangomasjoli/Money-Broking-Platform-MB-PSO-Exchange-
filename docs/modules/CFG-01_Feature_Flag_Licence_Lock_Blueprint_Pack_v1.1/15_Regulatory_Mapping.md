# CFG-01 Feature Flag / Licence Lock  
## 15 Regulatory Mapping

## 1. Control Mapping

| CFG-01 Control | Master Control / Rule Area | Tests |
|---|---|---|
| Licence-lock source of truth | LIC-RULE-001, CFG-RULE-001 | CFG1-TC-001-005, 026-031 |
| Exchange-pending lock | LIC-RULE-001, EXC-RULE-001 | CFG1-TC-005, 011-013, 029 |
| Prohibited feature registry | LIC-RULE-001, SEC-RULE-003 | CFG1-TC-011-018, 025 |
| Runtime feature evaluation | SYS-RULE-001, CFG-RULE-001 | CFG1-TC-001-010 |
| Feature change approval | GOV-RULE-001, IAM-RULE-001 | CFG1-TC-019-024 |
| Kill-switch | SEC-RULE-003, OPS-RULE-001 | CFG1-TC-038-042 |
| Decision token/version | SYS-RULE-001, SEC-RULE-003 | CFG1-TC-032-037 |
| Deployment gate | DEP-RULE-001, CFG-RULE-001 | CFG1-TC-043-048 |
| Interim handoff | CFG-RULE-001, SEC-RULE-001 | CFG1-TC-049-054 |
| Evidence export | SEC-RULE-001, GOV-RULE-001 | CFG1-TC-055-057 |
| Licence-lock bypass prevention | LIC-RULE-001, SOD-RULE-001 | CFG1-TC-031, 059-060 |
| Config integrity | LIC-RULE-001, SEC-RULE-002, CFG-RULE-001 | CFG1-TC-061-065 |
| Exchange activation ceremony | LIC-RULE-001, GOV-RULE-001, SOD-RULE-001 | CFG1-TC-066-073 |
| Feature gate coverage | CFG-RULE-001, IAM-RULE-001 | CFG1-TC-074-077 |
| Asymmetric audit outage | SEC-RULE-001, OPS-RULE-001 | CFG1-TC-078-082 |
| All-environment prohibited lock | LIC-RULE-001, DEP-RULE-001 | CFG1-TC-083-085 |
| Token revocation / registry binding | SEC-RULE-003, CFG-RULE-001 | CFG1-TC-086-088 |

---

## 2. Workflow Mapping

| Workflow | Tests |
|---|---|
| WF-CFG01-01 Runtime Feature Evaluation | CFG1-TC-001-010 |
| WF-CFG01-02 Feature Change Request | CFG1-TC-019-025 |
| WF-CFG01-03 Licence Profile Change | CFG1-TC-026-031 |
| WF-CFG01-04 Kill-Switch | CFG1-TC-038-042 |
| WF-CFG01-05 Deployment Gate | CFG1-TC-043-048 |
| WF-CFG01-06 Interim Handoff Reconciliation | CFG1-TC-049-054 |
| WF-CFG01-07 Stale Cache / Version Check | CFG1-TC-032-037 |
| WF-CFG01-08 Evidence Export | CFG1-TC-055-057 |
| WF-CFG01-09 Exchange Activation Ceremony | CFG1-TC-066-073 |
| WF-CFG01-10 Feature Gate Coverage Reconciliation | CFG1-TC-074-077 |
| WF-CFG01-11 Config Integrity Verification | CFG1-TC-061-065 |
| WF-CFG01-12 Audit Outage Mode | CFG1-TC-078-082 |

---

## 3. Regulatory Support

CFG-01 supports:

1. Licence-scope enforcement.
2. Evidence that Exchange features are locked pending approval.
3. Evidence that prohibited features cannot be enabled.
4. Approved Money Broking and PSO feature boundary.
5. Governance over feature changes.
6. Deployment control and release evidence.
7. Audit trail for licence/feature decisions.
8. Operational kill-switch control.
9. Client-class restrictions.
10. Regulatory and audit evidence exports.
11. Tamper-evident licence/prohibited configuration.
12. Hardened Exchange activation governance.
13. Runtime proof that CFG-01 gate was invoked.
14. Availability-safe audit coupling.
15. Environment-safe deployment governance.
