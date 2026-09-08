# IMP-01 AIX Master Implementation Handover
## 03 Repository And Codebase Setup

## 1. Recommended Repository Structure

```txt
aix-platform/
  apps/
    client-portal/
    staff-portal/
    admin-portal/
    api-gateway/
  services/
    fnd/
    iam/
    sec/
    cfg/
    clt/
    kyc/
    aml/
    wlt/
    led/
    dep/
    wdr/
    trd/
    e2e/
    rec/
    inc/
    prt/
  packages/
    shared-types/
    audit-client/
    permission-client/
    config-client/
    idempotency/
    error-envelope/
    test-fixtures/
  infra/
    migrations/
    docker/
    helm/
    terraform/
  docs/
    blueprints/
    implementation/
    evidence/
  tests/
    unit/
    integration/
    e2e/
    security/
    compliance/
```

## 2. Required Shared Libraries

1. request/correlation context.
2. idempotency.
3. standard error envelope.
4. audit event publisher.
5. permission guard client.
6. feature/licence-lock client.
7. source status version/epoch client.
8. masking/export policy client.
9. E2E saga client.
10. test fixture factory.

## 3. Coding Standards

1. backend validation always.
2. frontend guard never trusted.
3. every sensitive action has correlation ID.
4. every sensitive action emits audit event.
5. every money-impacting action is idempotent.
6. every module has explicit ownership boundary.
7. no direct ledger/balance edit path.
8. no Exchange runtime path.

## 4. Branching Recommendation

```txt
main = protected
develop = integration
feature/<module-code>-<short-name> = module work
hotfix/<issue> = urgent fixes
release/<version> = release candidate
```

## 5. Pull Request Requirements

Every PR must include:

1. module code.
2. blueprint files referenced.
3. files changed.
4. tests added.
5. prohibited behaviours tested.
6. evidence screenshots/logs where applicable.
7. migration notes.
8. deployment notes.
9. rollback notes.
