# TRD-01 Quote / Trade / LP Execution
## 13 Reconciliation Design

## 1. Purpose

TRD-01 reconciliation proves every client quote/fill maps to an LP quote/fill, every LP execution has LED hold, every settlement handoff has execution evidence, and no Exchange/principal/spread behaviour exists.

---

## 2. Reconciliation Types

| Reconciliation | Source A | Source B | Purpose |
|---|---|---|---|
| Client quote vs LP quote | client_quote | lp_quote | No quote without LP quote |
| Quote acceptance vs hold | trade | LED hold | Hold before execution |
| LP order vs trade | lp_order | trade | Execution mapping |
| LP fill vs client fill | lp_fill | client_fill | No unsupported client fill |
| Client fill vs settlement | client_fill | settlement_handoff/LED | Settlement completeness |
| Fee | client_quote/trade | fee disclosure | Fee disclosure |
| Slippage | lp_fill | quote tolerance | Tolerance compliance |
| Residual | settlement_handoff | LED residual policy | No AIX absorption |
| Exchange lock | config/permissions | prohibited registry | No order book/matching |
| Timeout | lp_order | reconciliation case | No blind retry |

---

## 3. Scheduled Jobs

1. Client quote without LP quote scan.
2. Accepted quote without LED hold scan.
3. LP execution without hold scan.
4. LP fill without client fill scan.
5. Client fill without LP fill scan.
6. Duplicate LP fill scan.
7. Settlement handoff without LED acknowledgement scan.
8. Slippage breach scan.
9. Fee disclosure missing scan.
10. Residual without LED policy reference scan.
11. Prohibited Exchange feature/config scan.
12. LP timeout unresolved scan.

---

## 4. Critical Findings

| Finding | Severity |
|---|---|
| Client fill without LP fill | Critical |
| LP execution without LED hold | Critical |
| Hidden spread/markup | Critical |
| AIX inventory/residual absorption | Critical |
| Exchange feature enabled | Critical |
| Duplicate LP fill settlement | Critical |
| LP timeout blind retry | Critical |
| Settlement without evidence | Critical |

---

## 5. Output

Each reconciliation run produces:

1. run ID.
2. checked counts.
3. findings.
4. severity.
5. affected quote/trade/LP/settlement refs.
6. SEC-01 audit refs.
7. recommended action.
8. freeze/escalation recommendation.
