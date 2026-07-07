# Documentation Plan — 03-docs-plan.md

**Repository:** `mi-digitaltwin-management-service`
**Date:** 2026-07-07
**License:** Apache 2.0 (user-specified)
**CI/CD:** GitHub Actions (existing) + GitLab CI (new)
**Security contact:** developer@montimage.eu

---

## File-by-File Plan

| #   | File                                        | Action     | Rationale                                                                                                                                                                                                                                                                                                                                                           | Effort |
| --- | ------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `LICENSE`                                   | **create** | Apache 2.0 per user request. Copy standard Apache 2.0 template, set year 2026, holder "Montimage".                                                                                                                                                                                                                                                                  | low    |
| 2   | `CONTRIBUTING.md`                           | **create** | Missing; essential for OSS. Cover PR workflow, branch strategy (`main`/`develop`), commit conventions (conventional commits observed in git history), coding standards (ESLint, Prettier, TypeScript), testing (Vitest), and review process.                                                                                                                        | medium |
| 3   | `CODE_OF_CONDUCT.md`                        | **create** | Missing. Copy from oss-ready asset (`/home/montimage/.config/opencode/skills/oss-ready/assets/CODE_OF_CONDUCT.md`), fill in contact method as `developer@montimage.eu`.                                                                                                                                                                                             | low    |
| 4   | `SECURITY.md`                               | **create** | Missing. Copy from oss-ready asset (`/home/montimage/.config/opencode/skills/oss-ready/assets/SECURITY.md`), replace `[INSERT SECURITY EMAIL]` with `developer@montimage.eu`.                                                                                                                                                                                       | low    |
| 5   | `.github/ISSUE_TEMPLATE/bug_report.md`      | **create** | Missing. Create from oss-ready assets with standard bug report template (steps to reproduce, expected/actual behavior, environment).                                                                                                                                                                                                                                | low    |
| 6   | `.github/ISSUE_TEMPLATE/feature_request.md` | **create** | Missing. Create from oss-ready assets with problem statement, proposed solution, alternatives considered.                                                                                                                                                                                                                                                           | low    |
| 7   | `.github/PULL_REQUEST_TEMPLATE.md`          | **create** | Missing. Create with checklist (tests passed, linted, docs updated, no secrets).                                                                                                                                                                                                                                                                                    | low    |
| 8   | `.gitlab-ci.yml`                            | **create** | User request: GitLab CI alongside GitHub Actions. Port the 5 jobs from `.github/workflows/ci.yml` (quality, typecheck, test with MongoDB service, build, security audit). Use GitLab's `services:` for MongoDB instead of GH `services:`. No docs-specific workflows needed in GitLab CI.                                                                           | medium |
| 9   | `CHANGELOG.md`                              | **create** | Missing. Keep-a-changelog format. Infer initial release `0.1.0` from `package.json` version. Categorize existing git history (72 commits) into Added/Changed/Fixed sections based on commit messages.                                                                                                                                                               | medium |
| 10  | `package.json` (root)                       | **update** | Change `"license"` from `"UNLICENSED"` to `"Apache-2.0"`. README license section will be updated in Step 4 (README overhaul) to match.                                                                                                                                                                                                                              | low    |
| 11  | `README.md`                                 | **update** | Multiple changes needed (handled fully in Step 4): (a) replace `"Proprietary - Montimage"` with Apache 2.0 badge/link, (b) add CI status badge from GitHub Actions, (c) add GitLab CI badge, (d) resolve `MOCKUP - TO BE COMPLETED` on line 129 (either remove or rephrase as planned feature), (e) add CHANGELOG and CONTRIBUTING links, (f) add SECURITY.md link. | medium |
| 12  | `docs/WORKFLOWS.md`                         | **update** | Document is GitHub-specific. Add a GitLab CI section or add a note referencing `.gitlab-ci.yml` at root. Remove or resolve the TODO/FIXME references (lines 159, 326 — they mention TODO/FIXME markers generically, keep the descriptive text but clarify no markers remain).                                                                                       | low    |
| 13  | `docs/playbooks/kubernetes-deployment.md`   | **update** | Clean up the single `# TODO: replace with your built/pushed image` comment on line 86. This is a legitimate instruction placeholder, rephrase as `REQUIRED: replace with your built/pushed image`.                                                                                                                                                                  | low    |
| 14  | `docs/DEPLOYMENT.md`                        | **keep**   | Comprehensive production deployment guide (464 lines). No changes needed.                                                                                                                                                                                                                                                                                           | none   |
| 15  | `docs/DEVELOPMENT.md`                       | **keep**   | Development workflow guide. No changes needed.                                                                                                                                                                                                                                                                                                                      | none   |
| 16  | `docs/API.md`                               | **keep**   | REST API reference. No changes needed.                                                                                                                                                                                                                                                                                                                              | none   |
| 17  | `docs/COMPONENTS.md`                        | **keep**   | React component reference. No changes needed.                                                                                                                                                                                                                                                                                                                       | none   |
| 18  | `docs/architecture/overview.md`             | **keep**   | System design doc. No changes needed.                                                                                                                                                                                                                                                                                                                               | none   |
| 19  | `docs/architecture/backend.md`              | **keep**   | Backend architecture. No changes needed.                                                                                                                                                                                                                                                                                                                            | none   |
| 20  | `docs/architecture/frontend.md`             | **keep**   | Frontend architecture. No changes needed.                                                                                                                                                                                                                                                                                                                           | none   |
| 21  | `docs/architecture/data-flow.md`            | **keep**   | Data flow doc. No changes needed.                                                                                                                                                                                                                                                                                                                                   | none   |
| 22  | `docs/database/schema.md`                   | **keep**   | MongoDB schema reference. No changes needed.                                                                                                                                                                                                                                                                                                                        | none   |
| 23  | `docs/database/relationships.md`            | **keep**   | Collection relationships. No changes needed.                                                                                                                                                                                                                                                                                                                        | none   |
| 24  | `docs/design/styling.md`                    | **keep**   | Code style guide. No changes needed.                                                                                                                                                                                                                                                                                                                                | none   |
| 25  | `docs/design/ui-patterns.md`                | **keep**   | UI patterns doc. No changes needed.                                                                                                                                                                                                                                                                                                                                 | none   |
| 26  | `docs/installation/prerequisites.md`        | **keep**   | System requirements. No changes needed.                                                                                                                                                                                                                                                                                                                             | none   |
| 27  | `docs/installation/configuration.md`        | **keep**   | Environment config. No changes needed.                                                                                                                                                                                                                                                                                                                              | none   |
| 28  | `docs/playbooks/deployment.md`              | **keep**   | Docker Compose deployment playbook. No changes needed.                                                                                                                                                                                                                                                                                                              | none   |
| 29  | `docs/playbooks/development.md`             | **keep**   | Development playbook. No changes needed.                                                                                                                                                                                                                                                                                                                            | none   |
| 30  | `docs/integration/external-services.md`     | **keep**   | External services doc. No changes needed.                                                                                                                                                                                                                                                                                                                           | none   |
| 31  | `docs/integration/kubernetes-execution.md`  | **keep**   | K8s execution doc. No changes needed.                                                                                                                                                                                                                                                                                                                               | none   |
| 32  | `docs/troubleshooting/common-issues.md`     | **keep**   | FAQ/troubleshooting. No changes needed.                                                                                                                                                                                                                                                                                                                             | none   |
| 33  | `docs/troubleshooting/debugging.md`         | **keep**   | Debugging guide. No changes needed.                                                                                                                                                                                                                                                                                                                                 | none   |
| 34  | `docs/README.md`                            | **keep**   | Documentation index. No changes needed (already links to all docs).                                                                                                                                                                                                                                                                                                 | none   |
| 35  | `DEPLOYMENT.md` (root)                      | **keep**   | Redirect stub to docs/playbooks/. No changes needed.                                                                                                                                                                                                                                                                                                                | none   |
| 36  | `k8s/README.md`                             | **keep**   | Kustomize layout quick reference. No changes needed.                                                                                                                                                                                                                                                                                                                | none   |
| 37  | `.github/WORKFLOWS_README.md`               | **keep**   | Internal workflows reference. No changes needed.                                                                                                                                                                                                                                                                                                                    | none   |
| 38  | `server/package.json`                       | **keep**   | Sub-package license field is not set (no `"license"` key). Stays consistent as Apache 2.0 implicitly via root. No explicit change needed.                                                                                                                                                                                                                           | none   |
| 39  | `client/package.json`                       | **keep**   | Same as server. No explicit `"license"` key. No change needed.                                                                                                                                                                                                                                                                                                      | none   |

---

## Summary Table

```
File                                         Action    Rationale
────                                         ──────    ────────
LICENSE                                      create    Apache 2.0 per user request
CONTRIBUTING.md                              create    Missing, essential for OSS
CODE_OF_CONDUCT.md                           create    Missing, standard for public repos
SECURITY.md                                  create    Missing, vulnerability reporting
.github/ISSUE_TEMPLATE/bug_report.md         create    Missing contributor UX
.github/ISSUE_TEMPLATE/feature_request.md    create    Missing contributor UX
.github/PULL_REQUEST_TEMPLATE.md             create    Missing contributor UX
.gitlab-ci.yml                               create    User-requested GitLab CI pipeline
CHANGELOG.md                                 create    Missing, keep-a-changelog format
package.json (root)                          update   "UNLICENSED" → "Apache-2.0"
README.md                                    update   License badge, CI badges, MOCKUP fix, new doc links
docs/WORKFLOWS.md                            update   Add GitLab CI section
docs/playbooks/kubernetes-deployment.md      update   Rephrase TODO comment as REQUIRED
docs/DEPLOYMENT.md                           keep     No changes needed
docs/DEVELOPMENT.md                          keep     No changes needed
docs/API.md                                  keep     No changes needed
docs/COMPONENTS.md                           keep     No changes needed
docs/README.md                               keep     No changes needed
docs/architecture/*                          keep     No changes needed (4 files)
docs/database/*                              keep     No changes needed (2 files)
docs/design/*                                keep     No changes needed (2 files)
docs/installation/*                          keep     No changes needed (2 files)
docs/playbooks/deployment.md                 keep     No changes needed
docs/playbooks/development.md                keep     No changes needed
docs/integration/*                           keep     No changes needed (2 files)
docs/troubleshooting/*                       keep     No changes needed (2 files)
DEPLOYMENT.md (root)                         keep     Redirect stub only
k8s/README.md                                keep     Layout reference
.github/WORKFLOWS_README.md                  keep     Internal doc
server/package.json                          keep     No explicit license field; implicit via root
client/package.json                          keep     No explicit license field; implicit via root
```

## Execution Order (Recommended)

1. **LICENSE** — Foundation for all other docs (Apache 2.0 text)
2. **package.json** — Update license field to `"Apache-2.0"`
3. **CODE_OF_CONDUCT.md** — Static template, one-shot copy
4. **SECURITY.md** — Static template, one-shot copy
5. **CONTRIBUTING.md** — Custom content, needs review
6. **.github/ISSUE_TEMPLATE/** + **PULL_REQUEST_TEMPLATE.md** — Static templates
7. **CHANGELOG.md** — Requires git log analysis
8. **.gitlab-ci.yml** — Port from ci.yml, needs testing
9. **README.md** — Comprehensive updates (Step 4 scope)
10. **docs/WORKFLOWS.md** — GitLab CI section addition
11. **docs/playbooks/kubernetes-deployment.md** — Minor text fix

## Notes

- **Templates source:** oss-ready assets at `/home/montimage/.config/opencode/skills/oss-ready/assets/` contain `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `LICENSE-MIT`. For Apache 2.0, use the standard text from https://www.apache.org/licenses/LICENSE-2.0.txt.
- **CODE_OF_CONDUCT.md** template has `[INSERT CONTACT METHOD]` — replace with `developer@montimage.eu`.
- **SECURITY.md** template has `[INSERT SECURITY EMAIL]` — replace with `developer@montimage.eu`.
- **MOCKUP note** in README line 129: either remove or change to `(planned feature)`.
- **TODO comment** in kubernetes-deployment.md line 86: legitimate instruction; rephrase to `REQUIRED:` prefix instead of `TODO:`.
- **GitLab CI** should mirror the 5 jobs from `.github/workflows/ci.yml` but use GitLab-native syntax: `image: node:20`, `services:`, `artifacts:` for caching, `needs:` for job dependencies. Skip the 4 docs-specific workflows (they are GitHub-only).
- **homepage** in root `package.json` (`https://montimage.eu`) is generic but noted as acceptable for now; no change requested.
