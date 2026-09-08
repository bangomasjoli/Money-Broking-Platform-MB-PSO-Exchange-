# INC-01 Incident / Freeze / Recovery
## 15 Regulatory Mapping

## 1. Control Mapping

| INC-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| Incident command/severity | Operational resilience | INC1-TC-001-005 |
| Freeze propagation | CFG/IAM/LED/DEP/WDR/TRD | INC1-TC-006-010 |
| Money-flow quiescence | E2E-01 freeze model | INC1-TC-011-017 |
| Evidence preservation | SEC-01 | INC1-TC-018-019 |
| Notification tracking | Compliance/regulatory | INC1-TC-020-022 |
| Recovery/resume gate | E2E-01 recovery model | INC1-TC-023-027 |
| PIR/action tracking | Operational resilience | INC1-TC-028-030 |
| No source mutation | All source modules | INC1-TC-031-033 |
| Status truthfulness | Client protection / WDR/TRD/DEP | INC1-TC-034-035 |
| Exchange lock | CFG-01 | INC1-TC-036 |

## 2. Regulatory Support

INC-01 supports:

1. operational resilience.
2. incident audit trail.
3. AML/sanctions incident response.
4. client asset safeguarding incident handling.
5. vendor outage response.
6. regulator/management notification evidence.
7. controlled recovery and resume governance.

## v1.1 Additional Mapping

| INC-01 Control | Master / Module Control Area | Tests |
|---|---|---|
| Atomic verified freeze | E2E-01 freeze / CFG / LED / WDR / TRD / DEP | INC1-TC-037-042 |
| Freeze/resume authority | IAM-02 maker-checker/SoD | INC1-TC-043-045 |
| Anti-suppression/downgrade | SEC-01 monitoring | INC1-TC-046 |
| INC record integrity | SEC-01 evidence integrity | INC1-TC-047-048 |
| Degraded mode | Operational resilience | INC1-TC-049-053 |
| Closed-loop money recovery | LED/WDR/DEP/TRD/REC/E2E | INC1-TC-054-060 |
| Freeze collateral | Client money/client protection | INC1-TC-061-065 |
| Overlapping freeze | CFG/IAM freeze control | INC1-TC-066-067 |
| Auto-freeze | Operational resilience / safeguarding / AML | INC1-TC-068-069 |
| E2E compensation binding | E2E-01 saga compensation | INC1-TC-070-071 |
| Notification/comms approval | AML tipping-off / regulatory reporting | INC1-TC-072-076 |
