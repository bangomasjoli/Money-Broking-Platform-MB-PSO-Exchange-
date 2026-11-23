# 04 Review — AIX-PAR-001 (round 7)

- **Reviewer:** an independent review of commit `10f63bba`, 2026-11-23, referred to in the implementer's draft as "the 2026-11-23 independent review". The review text, reviewer model and verdict are **NOT PRESERVED**; the findings are known only from the implementer's draft and the commit message of `2eb8e14f`. The draft does not state a verdict or severities. **UNVERIFIED.**
- **Source class:** **SECONDARY / NOT PRESERVED.** Known only from the implementer's evidence draft (N18 to N21 record) and a commit message. The review report is **NOT PRESERVED**.
- **Decision:** UNVERIFIED (the findings were treated as requiring remediation: commit `2eb8e14f` followed)
- **Human approval required:** true
- **Evidence reviewed:** PR #19 head `10f63bba87263245bc230ecb59c559c1ddfa411e`, CI run `45129087716` (success). Source for this record: the N18 to N21 implementer draft (SECONDARY).

## Findings (as the draft and the `2eb8e14f` commit message state them)
| ID | Severity | Category | Description | Evidence | Recommended action |
|---|---|---|---|---|---|
| PAR-N19 | not preserved | Ancestry integrity | A forged commit-graph or a substituted object (loose, packed or alternate) falsifies the trusted-wrapper ancestry check | draft §4 reproductions 2 to 5 | `core.commitGraph=false`; gate (f): no replace refs and a passing `fsck` |
| PAR-N20 | not preserved | History rewrite | A replace ref or forged commit-graph makes the pinned push rewrite a remote branch without a visible non-fast-forward; the pinned fetch is affected the same way | draft §4 reproductions 7 to 9 | `--no-replace-objects -c core.commitGraph=false` on push and fetch; trusted-wrapper ancestor check before push |
| PAR-N21 | not preserved | Hooks and remote list | A pre-push hook runs during `--dry-run` and can create remote references; the heads-and-tags comparison misses other namespaces (for example notes) | draft §4 reproduction 10 | `--no-verify`; compare the complete `ls-remote` list before the dry run, after it and after the push |
| Acceptance-head binding | not preserved | Merge binding | `policy_merge_sha` binds to the PR's merge commit, not the exact head the owner accepted; a later commit could merge unreviewed | N15 to N17 draft §5.3 (implementer-identified), and `2eb8e14f` message | Record `accepted_head_sha`; normal merge commit with second parent equal to it, no third parent, identical policy file |
| PAR-N18 | not preserved | Version gate | The Git 2.32 floor was stated but not enforced | N15 to N17 draft §5.1 (implementer-identified) | Gate (e) rejects below 2.32 and release candidates |

Informational items INFO-a to INFO-g are listed in the implementer's draft (§7); the originating review is not identified:
| ID | Observation | Disposition in the draft |
|---|---|---|
| INFO-a | Porcelain `=` (up to date) not listed | Resolved in `2eb8e14f` text |
| INFO-b | Porcelain `To` and `Done` lines | Resolved in `2eb8e14f` text |
| INFO-c | Transport settings (proxy, `sslVerify`, `extraHeader`) not covered by the identity gate | Residual risk, owner decision (`PAR-INFO-c`) |
| INFO-d | Untracked or ignored paths carry no mode, so symlink rejection needs `lstat` | Deferred (`PAR-INFO-d`) |
| INFO-e | The O6 STOP sentence names only ignored paths | Deferred (`PAR-INFO-e`) |
| INFO-f | A shallow file can only hide ancestry (fails safe) | Residual risk, owner decision (`PAR-INFO-f`) |
| INFO-g | `merge_commit_sha` differs under squash or rebase | Resolved by the normal-merge-commit requirement |

## Escalation decision
none

## Rationale
Remediation: [05-remediation-r7.md](05-remediation-r7.md). Independent verification of the remediation: [04-review-r8.md](04-review-r8.md).
