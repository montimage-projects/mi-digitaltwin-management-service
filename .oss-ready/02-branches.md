# Branch Inventory Report

Generated: 2026-07-07

## All Branches

| Branch                                              | Type   | Last Commit               | Author         | Ahead/Behind main                                           | Merged into main        | PR Status      |
| --------------------------------------------------- | ------ | ------------------------- | -------------- | ----------------------------------------------------------- | ----------------------- | -------------- |
| `main`                                              | local  | 2026-07-06 23:52:33 +0200 | Luong NGUYEN   | 0 ahead, 2 behind origin/main                               | N/A                     | N/A            |
| `feat/18-replace-maestro-execution-with-k8s`        | local  | 2026-07-07 07:58:21 +0200 | developer      | 0 ahead, 29 behind local main                               | Merged via #22 (squash) | #22 MERGED     |
| `origin/main`                                       | remote | 2026-07-07 07:58:31 +0200 | Luong NGUYEN   | 0 ahead, 2 ahead of local main                              | N/A                     | N/A            |
| `origin/feat/18-replace-maestro-execution-with-k8s` | remote | 2026-07-07 07:58:21 +0200 | developer      | 1 ahead, 28 behind origin/main                              | Merged via #22 (squash) | #22 MERGED     |
| `origin/viet-thesis-ideas`                          | remote | 2026-04-16 14:36:08 +0200 | Quoc Viet Pham | 11 ahead, 5 behind origin/main                              | No                      | No PR          |
| `gitlab/main`                                       | remote | 2026-07-07 01:33:51 +0200 | Luong NGUYEN   | 1 ahead, 0 behind origin/main                               | N/A                     | N/A            |
| `gitlab/set-sast-config-1`                          | remote | 2026-07-07 07:29:42 +0200 | Luong Nguyen   | 0 ahead, 1 behind gitlab/main (1 commit not in gitlab/main) | No                      | No PR (GitLab) |

> `origin/HEAD` (symbolic ref → `origin/main`) omitted.

## Classification Summary

| Category                 | Count | Branches                                                                                          | Action                                                          |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `protected-do-not-touch` | 3     | `main`, `origin/main`, `gitlab/main`                                                              | Keep; never delete                                              |
| `merged-safe-to-delete`  | 2     | `feat/18-replace-maestro-execution-with-k8s`, `origin/feat/18-replace-maestro-execution-with-k8s` | Delete local branch; remote branch can be pruned after PR merge |
| `unmerged-needs-review`  | 2     | `origin/viet-thesis-ideas`, `gitlab/set-sast-config-1`                                            | Review and decide: merge or abandon                             |
| `stale-no-activity-90d`  | 0     | —                                                                                                 | —                                                               |
| `active-recent`          | 0     | —                                                                                                 | —                                                               |

### Notes

- **feat/18-replace-maestro-execution-with-k8s**: PR #22 was squash-merged (`MERGED` state). Git does not detect squash-merges via `branch --merged`, but the changes are deployed to `origin/main`. Safe to delete local branch.
- **origin/viet-thesis-ideas**: 82 days old (under 90-day threshold) but has 11 commits ahead of main. Needs review for possible merge or closure.
- **gitlab/set-sast-config-1**: Remote-only branch on GitLab. Has 1 commit not in `gitlab/main`. Needs review.

## Actions Taken

| Branch                                              | Action        | Result                               |
| --------------------------------------------------- | ------------- | ------------------------------------ |
| `feat/18-replace-maestro-execution-with-k8s`        | Delete local  | ✅ Done (`git branch -d`)            |
| `origin/feat/18-replace-maestro-execution-with-k8s` | Delete remote | ✅ Done (`git push origin --delete`) |
| `origin/viet-thesis-ideas`                          | Keep          | ✅ User confirmed keep               |
| `gitlab/set-sast-config-1`                          | Keep          | ✅ User confirmed keep               |

## Totals

```
Total branches: 4 (1 local, 3 remote)
Merged safe to delete: 2 (deleted: 2)
Unmerged needs review: 2 (kept: 2)
Stale (90d): 0
Active: 0
Protected: 3 (kept: 3)
```
