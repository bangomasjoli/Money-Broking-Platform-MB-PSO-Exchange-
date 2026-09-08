# CFG-01 Feature Flag / Licence Lock  
## 12 Risk And Control Map

| Risk ID | Risk | Impact | Control | Test |
|---|---|---|---|---|
| CFG1-RISK-001 | Exchange feature enabled while pending | Licence breach | Prohibited/Exchange lock | CFG1-TC-005, 011-013 |
| CFG1-RISK-002 | Principal dealing/market making enabled | Licence breach | Prohibited registry | CFG1-TC-014/015 |
| CFG1-RISK-003 | AIX spread markup enabled | Model breach | Prohibited registry | CFG1-TC-016 |
| CFG1-RISK-004 | Retail onboarding default enabled | Scope breach | Client-class constraint | CFG1-TC-006 |
| CFG1-RISK-005 | IAM permission overrides licence lock | Licence breach | Licence-lock precedence | CFG1-TC-031/059 |
| CFG1-RISK-006 | Break-glass enables locked feature | Control bypass | Break-glass cannot enable | CFG1-TC-060 |
| CFG1-RISK-007 | Stale feature cache allows disabled feature | Control bypass | Positive version check | CFG1-TC-035-037 |
| CFG1-RISK-008 | Deployment activates unregistered/locked feature | Production breach | Deployment gate | CFG1-TC-044/045 |
| CFG1-RISK-009 | Feature change without approval/audit | Governance failure | IAM-02 + SEC-01 | CFG1-TC-019-024 |
| CFG1-RISK-010 | Kill-switch disables safety controls | Security failure | Kill-switch ceiling | CFG1-TC-040 |
| CFG1-RISK-011 | Interim handoff mismatch | Source-of-truth drift | Handoff reconciliation | CFG1-TC-049-054 |
| CFG1-RISK-012 | Feature drift in runtime/deployment | Uncontrolled behaviour | Drift reconciliation | CFG1-TC-053 |
| CFG1-RISK-013 | Licence profile changed without evidence | False approval state | Evidence + approvals | CFG1-TC-026 |
| CFG1-RISK-014 | Prohibited feature as ordinary flag | Easy bypass | Separate hard-block registry | CFG1-TC-025 |
| CFG1-RISK-015 | SEC-01 unavailable during sensitive decision | Missing evidence or DoS | Asymmetric outbox-coupled mode | CFG1-TC-078-082 |
| CFG1-RISK-016 | Licence/prohibited config tampered directly | Licence breach | Signed/sealed config integrity | CFG1-TC-061-065 |
| CFG1-RISK-017 | Exchange unlocked through ordinary table edit | Licence breach | Exchange activation ceremony | CFG1-TC-066-073 |
| CFG1-RISK-018 | Feature-gated action never calls CFG-01 | Lock bypass | IAM-02 token binding + coverage recon | CFG1-TC-074-077 |
| CFG1-RISK-019 | Non-prod locked config leaks to prod | Licence breach | All-env lock + deployment hard block | CFG1-TC-083-085 |
| CFG1-RISK-020 | Kill-switch leaves stale tokens alive | Control bypass | Immediate version bump/token revocation | CFG1-TC-086 |
| CFG1-RISK-021 | Suspended licence leaves tokens alive | Licence breach | Immediate token revocation | CFG1-TC-087 |
| CFG1-RISK-022 | Token survives prohibited registry change | Licence breach | Token binds registry version/hash | CFG1-TC-088 |

## Critical Controls

1. Licence-lock source of truth.
2. Prohibited feature hard block.
3. Runtime feature evaluation.
4. Positive version check.
5. Decision token binding.
6. Deployment gate.
7. IAM-02 maker-checker.
8. SEC-01 audit.
9. Kill-switch ceiling.
10. Handoff reconciliation.
11. Drift detection.
12. Client-class/environment constraints.
13. Config integrity seal.
14. Decision-time integrity verification.
15. Hardened Exchange activation ceremony.
16. IAM-02 feature-gate binding.
17. Asymmetric audit outage mode.
18. All-environment prohibited lock.
19. Kill-switch/licence token revocation.
