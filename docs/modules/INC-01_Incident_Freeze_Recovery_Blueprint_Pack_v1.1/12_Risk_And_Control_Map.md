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

## v1.1 Additional Risk Controls

| Risk ID | Risk | Control | Tests |
|---|---|---|---|
| INC1-RISK-011 | Ack-only/partial freeze false containment | Atomic verified freeze | INC1-TC-037-042 |
| INC1-RISK-012 | Freeze/resume abuse | Maker-checker/SoD | INC1-TC-043-045 |
| INC1-RISK-013 | Incident suppression/downgrade | Anti-suppression monitor | INC1-TC-046 |
| INC1-RISK-014 | INC evidence tampering | Hash-chain/external anchor | INC1-TC-047-048 |
| INC1-RISK-015 | SEC/IAM/CFG dependency incident | Degraded mode | INC1-TC-049-053 |
| INC1-RISK-016 | Resume before money corrected | Closed-loop recovery | INC1-TC-054-060 |
| INC1-RISK-017 | Client access denial unmanaged | Freeze collateral tracker | INC1-TC-061-065 |
| INC1-RISK-018 | Overlapping freeze release error | Reference-counted freeze holds | INC1-TC-066-067 |
| INC1-RISK-019 | Containment delayed | Auto-freeze | INC1-TC-068-069 |
| INC1-RISK-020 | Conflicting recovery mechanisms | E2E compensation binding | INC1-TC-070-071 |
| INC1-RISK-021 | Notification/comms breach | Clock/comms approval | INC1-TC-072-076 |
