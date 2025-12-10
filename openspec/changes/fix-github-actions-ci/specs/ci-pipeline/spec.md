# CI Pipeline Spec Delta

## ADDED Requirements

### Requirement: CI-001 - Prettier must ignore build artifacts

The CI pipeline's formatting check MUST exclude minified and bundled build outputs from Prettier validation.

#### Scenario: Format check ignores server/public/assets

Given the codebase contains minified JavaScript files in `server/public/assets/`
When the CI runs `bun run format:check`
Then the minified files are ignored
And the check passes if source files are properly formatted

### Requirement: CI-002 - TypeScript compilation must have all required type declarations

The client TypeScript build MUST have access to all required type declarations for third-party libraries.

#### Scenario: Monaco editor types are available

Given `YamlEditor.tsx` imports types from `monaco-editor`
When the CI runs `bun run typecheck:client`
Then TypeScript can resolve all type imports
And the type check passes

### Requirement: CI-003 - Security scan job must have proper configuration

The security scan CI job MUST be properly configured with correct permissions and working commands.

#### Scenario: CodeQL analysis has proper permissions

Given the CI workflow has a security scan job
When GitHub Actions runs the CodeQL analysis
Then the job has `security-events: write` permission
And CodeQL can upload analysis results

#### Scenario: Dependency audit runs without external scanner

Given the CI workflow has a dependency audit step
When the audit runs
Then it uses a built-in audit command (npm audit)
And does not require external scanner configuration
