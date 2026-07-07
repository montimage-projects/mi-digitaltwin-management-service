# Task for reviewer

Review PR #22 in repo /home/montimage/workspace/secsim. Branch: feat/18-replace-maestro-execution-with-k8s, base: main. PR title: feat(scenario): deploy scenarios directly to kubernetes (#18). PR body: Closes #18, replaces the MAESTRO mock execution engine with real Kubernetes deployment. Get the diff by running: cd /home/montimage/workspace/secsim && gh pr diff 22. Also read key files for context — kubernetesDeploy.ts, scenarios.routes.ts, ExecutionConsole.tsx, api.ts. Focus on: correctness (logic, race conditions, off-by-one), security (injection, hardcoded secrets, auth bypass), edge cases (null handling, error paths, empty states), test coverage (are new code paths tested meaningfully), and code quality (dead code, duplication, complexity). Do NOT report style/lint/format issues. Return the JSON output as specified in the code-reviewer format with result, issues_found, fixable_count, issues[], and summary.

## Acceptance Contract

Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:

- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```
