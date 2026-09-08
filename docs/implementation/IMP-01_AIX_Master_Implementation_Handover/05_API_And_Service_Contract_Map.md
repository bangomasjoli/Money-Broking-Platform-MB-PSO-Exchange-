# IMP-01 AIX Master Implementation Handover
## 05 API And Service Contract Map

## 1. Contract Principles

All service contracts must include:

1. request ID.
2. correlation ID.
3. actor / subject.
4. end-user entitlement where portal-originated.
5. idempotency key where sensitive/actional.
6. source status version where status is displayed.
7. audit event reference.
8. standard error envelope.

## 2. Core Cross-Cutting Contracts

### 2.1 Permission Guard

Used by:
- all modules.

Must return:
```txt
allow / deny / step_up_required / approval_required / sod_block / licence_locked
```

### 2.2 Audit Event Publisher

Used by:
- all modules.

Must support:
```txt
append_only = true
tamper_evident = true
correlation_id_required = true
actor_required = true
```

### 2.3 Licence Lock Client

Used by:
- CFG consumers.

Must block:
```txt
exchange_runtime
order_book
matching_engine
client_to_client_matching
market_making
principal_dealing
aix_spread_markup
```

### 2.4 Ledger Client

Used by:
- DEP
- WDR
- TRD
- REC
- INC
- PRT read display.

Rules:
1. no direct SQL writes outside LED.
2. no direct balance edit.
3. immutable double-entry posting only.

### 2.5 E2E Saga Client

Used by:
- DEP
- WDR
- TRD
- REC
- INC
- PRT.

Rules:
1. every sensitive action has correlation ID.
2. saga events are append-only.
3. compensation driven by owning modules.

## 3. Service Boundary Rule

A service may call another module only through approved API/contract.

Prohibited:

1. direct DB mutation of another module.
2. bypassing permission guard.
3. bypassing audit publisher.
4. bypassing CFG licence lock.
5. bypassing LED for money posting.
