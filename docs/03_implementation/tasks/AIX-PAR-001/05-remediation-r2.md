# 05 Remediation — AIX-PAR-001 (round 2)

- **Findings remediated:** PAR-N1 (MEDIUM), PAR-N2 to PAR-N7 (LOW), from [04-review-r2.md](04-review-r2.md).
- **Approved scope:** the owner explicitly authorised a seven-finding docs-only remediation and **chose personally browser-posted, separately in-session-confirmed state decisions** as the future activation authority. No merge, no pilot start, no writers. Sources: PR #19 comment `6599435405`; Issue #18 comment `6599437004` (agent-authored).
- **Implementing agent:** not recorded.
- **Result:** commit `868f18bc163cf9b4622bfe79f8c683f474ab56ca` (`+46/−29`; PR total `+47/−0`); CI run `41607007072` success. Mapping stated as author evidence: fixed first-line `AIX-PAR-001 STATE:` token and fields; `LANE_PAUSED` versus terminal `STOPPED`; base ancestry and re-baseline; NUL-delimited path review; shared-Git-state restrictions; expiry no later than 72 hours; `AGENTS.md` stop rule.
- **Independent verification:** [04-review-r3.md](04-review-r3.md) (N1 to N7 CLOSED in the reviewer's assessment).
