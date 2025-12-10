# Fix GitHub Actions CI Failures

## Summary

Fix the three failing CI jobs in GitHub Actions:

1. **Code Quality** - Prettier formatting check fails on minified build assets
2. **Type Check** - Missing `monaco-editor` type declarations
3. **Security Scan** - `bun pm scan` requires unconfigured security scanner + CodeQL lacks permissions

## Motivation

All recent commits to `main` have failed CI, blocking reliable deployment and preventing quality gates from being effective. The failures are configuration issues rather than code quality problems.

## Proposed Changes

### 1. Fix Prettier Formatting Check

Add `server/public/assets/` to `.prettierignore` since these are minified/bundled build outputs that should not be formatted.

### 2. Fix TypeScript Type Check

Add `monaco-editor` as a devDependency in `client/package.json` to provide type declarations for the `YamlEditor` component.

### 3. Fix Security Scan Job

- Remove `bun pm scan` step (requires external scanner configuration not available)
- Update CodeQL permissions in workflow to fix "Resource not accessible by integration" errors
- Consider using `npm audit` as an alternative or remove security scanning entirely

## Impact

- **Risk**: Low - configuration changes only
- **Scope**: CI/CD pipeline only, no application code changes
- **Backwards Compatibility**: N/A

## Alternatives Considered

1. **Configure bun pm scan** - Requires setting up an external security scanner package; too complex for the immediate fix needed
2. **Format all build assets** - Would break minified code and increase bundle size significantly
3. **Remove security job entirely** - Loses security scanning capability; prefer fixing CodeQL

## Decision

Proceed with minimal fixes:

1. Update `.prettierignore`
2. Add `monaco-editor` devDependency
3. Fix CI workflow security job configuration
