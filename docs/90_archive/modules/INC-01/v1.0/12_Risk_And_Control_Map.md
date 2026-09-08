# INC-01 Incident / Freeze / Recovery
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| INC1-RISK-001 | Incident not classified correctly | Under-response | Severity engine | INC1-TC-004-005 |
| INC1-RISK-002 | Freeze not propagated | Unsafe money movement | Freeze orchestrator | INC1-TC-006-010 |
| INC1-RISK-003 | In-flight item uncontrolled | Client asset risk | Quiescence manager | INC1-TC-011-017 |
| INC1-RISK-004 | Irreversible leg mishandled | False recovery | PONR classifier | INC1-TC-014/016 |
| INC1-RISK-005 | Evidence missing/tampered | Audit/regulatory weakness | Evidence preservation | INC1-TC-018-019 |
| INC1-RISK-006 | Notification missed | Regulatory risk | Notification tracker | INC1-TC-020-022 |
| INC1-RISK-007 | Resume unsafe | Repeated incident/loss | Resume gate | INC1-TC-023-027 |
| INC1-RISK-008 | Closure without root cause/evidence | Weak remediation | Closure/PIR controls | INC1-TC-028-030 |
| INC1-RISK-009 | INC mutates source/ledger | Control breach | No source mutation | INC1-TC-031-033 |
| INC1-RISK-010 | False client status | Misleading clients | Status truth | INC1-TC-034-035 |
