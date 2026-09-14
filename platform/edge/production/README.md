# IMP-02 — Production Edge Configuration

**NO PRODUCTION PRE-AUTH NUMERIC POLICY IS APPROVED.**

This directory intentionally contains no `.cfg` file. It exists only to document why one is
absent and what must happen before one may be added.

## Why nothing is here

`platform/edge/uat/haproxy.limits.cfg` carries a set of explicitly **PROVISIONAL — UAT ONLY —
NOT APPROVED FOR PRODUCTION** numeric thresholds, authorized solely to permit DEC-010 Turn 2
engineering and abuse-test exercise (`docs/03_implementation/IMP-02/README.md`). Those values
are not derived from measurement and must never be treated as, copied into, or defaulted to a
production configuration.

Production approval requires **all** of, per `docs/03_implementation/IMP-02/README.md`'s
production numeric approval process:

1. The M1-M8 capacity-calibration evidence pack (negative-introspection service time; deployed
   IAM pool concurrency; legitimate-traffic latency under attack; authenticated WLT latency under
   attack; pool saturation behaviour; `iam.auth_event` write amplification; edge throughput
   ceiling; NAT/CGNAT shared-egress population).
2. Explicit, written, signed selection of the risk-policy terms `U` (headroom fraction conceded
   to unauthenticated traffic) and `N` (tolerated simultaneous abusive source buckets).
3. The full A1-A10 abuse-test matrix passed at production shape.
4. An independent acceptance review at a named commit.
5. A `docs/DECISION_LOG.md` entry recording the approved production numbers as the authority of
   record.
6. OPS-05 maker-checker sign-off (maker ≠ checker).

## Automated enforcement

`platform/tests/unit/imp02-edge-config.test.ts` fails if any `*.cfg` file is ever found under
this directory. That test is the enforcement mechanism for this rule — do not weaken or remove
it to land a production config; land the governance record first.

## When a production config is approved

A future controlled implementation turn creates `platform/edge/production/haproxy.limits.cfg`
(or equivalent), containing only the numbers approved per the process above, cited against the
`DECISION_LOG.md` entry that approved them. It must remain structurally separate from
`platform/edge/uat/` — no shared default file may allow a UAT threshold to silently become a
production default.
