# E2E-01 Cross-Module End-to-End Fund-Flow Review
## 15 Value Conservation And Freeze Recovery Model

## 1. Purpose

This file defines chainwide value conservation, cross-module freeze propagation and orchestrated recovery.

## 2. Per-Correlation Value Conservation

For every trade/conversion/payout/deposit correlation:

```txt
value_in = value_out + disclosed_fee + bounded_residual
aix_net_position = 0
```

Evidence inputs:

1. TRD quote and fill conservation.
2. LP external fill.
3. LED DvP settlement legs.
4. LED fee journals.
5. LED residual account movement.
6. safeguarding position.
7. external bank/custodian/chain evidence.

## 3. TRD / LED Residual Seam

The seam between TRD conversion legs and LED residual posting must reconcile explicitly.

Rules:

1. TRD residual_details must equal LED residual journal.
2. Residual account must be bounded.
3. Residual disposition must follow approved policy.
4. Residual cannot become AIX principal profit.
5. Any unexplained residual is Critical.

## 4. Daily Global Conservation Roll-Up

Daily roll-up must check:

1. all correlations conserved.
2. all residual accounts within bounds.
3. AIX net asset position zero.
4. client liabilities fully backed.
5. no unexplained suspense/operational balances.
6. all critical recon breaks open/escalated.

## 5. Freeze Propagation

Freeze signal includes:

1. freeze ID.
2. scope: client/asset/rail/module/global.
3. source: AML/CLT/CFG/LED/SEC/manual.
4. effective time.
5. allowed actions.
6. blocked actions.
7. in-flight disposition rule.
8. resume condition.

Propagation order:

1. Block new entry points.
2. Notify active saga orchestrator.
3. Freeze affected WLT decisions.
4. Freeze LED holds/reservations/settlement where applicable.
5. Freeze TRD execution/settlement handoff.
6. Notify rail/LP boundary if relevant.
7. Start orphaned-state sweeper.

## 6. In-Flight Quiescence

For every active saga in freeze scope:

1. identify current step.
2. stop next forward action.
3. determine whether external action is reversible.
4. hold, compensate or quarantine.
5. emit SEC event.
6. create reconciliation case.

## 7. Recovery Resume Gate

Platform can resume affected scope only when:

1. freeze release approved through IAM-02.
2. SEC expected-vs-emitted events complete.
3. LED journal hash-chain verified.
4. safeguarding invariant passes.
5. orphaned intermediate-state sweeper clear.
6. critical reconciliation breaks resolved or formally accepted.
7. decision tokens refreshed.
8. CFG/IAM/AML/WLT gates revalidated.
9. management/Compliance/Finance signoff where required.
