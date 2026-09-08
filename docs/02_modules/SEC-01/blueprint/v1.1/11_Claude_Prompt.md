# SEC-01 Audit Log / Security Monitoring  
## 11 Claude Prompt

## Claude Opus Review Prompt

```txt
Review this SEC-01 Audit Log / Security Monitoring Blueprint Pack v1.1 as a principal fintech platform architect, regulated fintech security architect, audit/evidence architect, tamper-evident logging specialist, and compliance reviewer.

Context:
- AIX has approved Money Broking and PSO licences.
- Exchange application is pending; Exchange features are locked.
- FND-01 Platform Foundation accepted v1.2.
- IAM-01 Authentication / MFA / Session accepted v1.2.
- IAM-02 RBAC / Permission Guard / SoD accepted v1.2.
- SEC-01 becomes the authoritative audit store and security monitoring layer.
- IAM-01 and IAM-02 currently have interim local audit/evidence indexes; SEC-01 must define the authoritative handoff/reconciliation.
- SEC-01 must support regulated fintech evidence, security monitoring, alerting, tamper evidence, sensitive read logging, and export control.
- SEC-01 must not implement authentication, RBAC, feature flags, KYC, AML, ledger, settlement, trading, or Exchange features.

Review for:
1. Missing immutable audit log controls.
2. Missing tamper-evident hash-chain/batch seal controls.
3. Missing audit event schema validation controls.
4. Missing audit failure fail-closed controls.
5. Missing external seal anchoring / WORM immutability / trusted timestamp controls.
6. Missing security monitoring/alerting controls.
7. Missing sensitive audit read logging controls.
8. Missing evidence export controls.
9. Missing IAM-01/IAM-02 interim audit handoff controls.
10. Missing retention/legal hold/archive controls.
11. Missing audit reconciliation controls.
12. Missing audit access-control/SoD controls.
13. Missing service-account restrictions.
14. Missing source emission sequence / expected-event reconciliation / anti-suppression controls.
15. Missing ingestion identity binding / anti-spoofing controls.
16. Missing trusted time / clock-skew controls.
17. Missing IAM-02 circular dependency and emergency audit-read continuity controls.
18. Missing recovery integrity verification.
19. Any pathway to audit deletion, modification, disablement, or bypass.
20. Any inconsistency with FND-01, IAM-01, IAM-02, or master docs 00–11.
21. Any additional parameters required before acceptance.

Do not write code.

Return only:
- Critical gaps.
- Recommended corrections.
- Additional SEC-01 requirements or parameters to add.
```
