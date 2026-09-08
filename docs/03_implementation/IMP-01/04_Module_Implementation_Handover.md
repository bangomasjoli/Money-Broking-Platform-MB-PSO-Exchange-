# IMP-01 AIX Master Implementation Handover
## 04 Module Implementation Handover

## 1. Standard Module Implementation Checklist

For each module:

```txt
read:
- README.md
- 01_Module_Blueprint.md
- 02_Workflow.md
- 04_API_Specification.md
- 05_Database_Design.md
- 06_State_Machine.md
- 07_Permission_Rules.md
- 08_Audit_Log_Events.md
- 09_Error_Handling.md
- 10_Test_Cases.md
- 14_Go_Live_Checklist.md
```

Then:

1. search repo for existing patterns.
2. propose implementation plan.
3. implement minimum source changes.
4. add migrations.
5. add API handlers.
6. add service logic.
7. add permission checks.
8. add audit events.
9. add tests.
10. update module implementation notes.

## 2. Module Completion Definition

A module is implementation-complete when:

1. all owned APIs implemented.
2. all owned tables/migrations implemented.
3. all state transitions enforced.
4. all permissions enforced.
5. all audit events emitted.
6. all error codes mapped.
7. all critical tests passed.
8. all prohibited behaviours tested.
9. all deployment checklist items met.
10. no out-of-scope features implemented.

## 3. Implementation Handover Template

```txt
Module:
Version:
Branch:
PR:
Migrations:
APIs:
Services:
Permissions:
Audit events:
Tests:
Known gaps:
Deployment notes:
Rollback notes:
Evidence location:
```

## 4. Module-Specific Warnings

### Ledger / Money Modules

Modules: LED, DEP, WDR, TRD.

Rules:

1. never absorb client value into AIX operational/principal account.
2. no spread markup.
3. no direct balance editing.
4. all postings through LED.
5. value conservation tests mandatory.

### Compliance Modules

Modules: CLT, KYC, AML, WLT.

Rules:

1. no client-facing tipping-off.
2. decisions must be auditable.
3. revocations must propagate.
4. Travel Rule controls must be tested.

### Portal Module

Module: PRT.

Rules:

1. browser untrusted.
2. backend revalidation mandatory.
3. object-level authorization mandatory.
4. display non-regression mandatory.
5. export egress hardening mandatory.

### Incident Module

Module: INC.

Rules:

1. freeze must be verified-effective.
2. ack-only freeze is false containment.
3. resume requires corrected money position.
4. degraded-mode cannot resume.
