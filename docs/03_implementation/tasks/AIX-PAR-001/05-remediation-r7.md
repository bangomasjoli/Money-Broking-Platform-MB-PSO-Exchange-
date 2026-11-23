# 05 Remediation — AIX-PAR-001 (round 7)

- **Findings remediated:** PAR-N18, PAR-N19, PAR-N20, PAR-N21 and the acceptance-head binding gap, from [04-review-r7.md](04-review-r7.md); INFO-a, INFO-b and INFO-g resolved by the same text.
- **Approved scope:** relayed in session (not on GitHub): the owner authorised a local commit of the tested edit, **retaining the pinned-fetch extension** (`--no-replace-objects -c core.commitGraph=false` on the operator fetch); a separate written authorisation for the single fast-forward push `10f63bba..2eb8e14f`. Source: the implementer's N18 to N21 draft, Addenda A and B (SECONDARY). Nothing was authorised beyond that: no comment, Ready-for-Review, merge, acceptance or activation.
- **Implementing agent:** Claude Sonnet 5.5 (commit trailer).
- **Result:** commit `2eb8e14ffcaeed76cf37835399346375ee38ea26` (`+5/−4`; one file); pushed 2026-11-23; CI run `45151125787` success (five jobs, VERIFIED). The draft records 46 of 46 text-driven scratch checks before commit.
- **Independent verification:** [04-review-r8.md](04-review-r8.md) (ACCEPT recommendation; new LOW and INFO items `PAR-N22` to `PAR-N27`, `PAR-INFO-3`).
- **Still open after this round:** see `PAR-N13`, `PAR-N22` to `PAR-N28` and `PAR-INFO-c`, `-d`, `-e`, `-f`, `-3` in [OPEN_FINDINGS.md](../../../OPEN_FINDINGS.md).
