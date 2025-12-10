# Design: Fix GitHub Actions CI

## Problem Analysis

### Failure 1: Code Quality Job - Prettier Formatting

**Error**: `format:check` exits with code 1

**Root Cause**: The `server/public/assets/` directory contains minified JavaScript and CSS files built by Vite. These files:

- Are not meant to be human-readable
- Should not be reformatted (breaks minification)
- Are regenerated on each build

**Solution**: Add `server/public/` to `.prettierignore`

### Failure 2: Type Check Job - Missing Types

**Error**: `TS2307: Cannot find module 'monaco-editor' or its corresponding type declarations`

**Root Cause**: `client/src/components/topology/YamlEditor.tsx` imports types from `monaco-editor`:

```typescript
import type { editor } from 'monaco-editor';
```

The `@monaco-editor/react` package is installed but it doesn't include the full `monaco-editor` types. The types need to be available for TypeScript compilation.

**Solution**: Add `monaco-editor` as a devDependency. The `@monaco-editor/react` package loads monaco-editor dynamically at runtime, but we need the types for TypeScript compilation.

### Failure 3: Security Scan Job - Configuration Issues

**Error 1**: `error: no security scanner configured`

The `bun pm scan` command requires a security scanner to be configured in `bunfig.toml`:

```toml
[install.security]
scanner = "package_name"
```

No such scanner is configured, and this is an advanced Bun feature.

**Error 2**: `Resource not accessible by integration`

CodeQL requires specific permissions to upload SARIF results. The workflow lacks the necessary permissions block.

**Solution Options**:

1. **Remove bun pm scan**: The command isn't useful without configuration
2. **Add workflow permissions**: CodeQL needs `security-events: write`
3. **Replace with npm audit**: Use standard `npm audit` which works out of the box

## Recommended Changes

### .prettierignore

```diff
+ # Build outputs
+ server/public/
```

### client/package.json

```diff
  "devDependencies": {
+   "monaco-editor": "^0.50.0",
    "@eslint/js": "^9.39.1",
    ...
  }
```

### .github/workflows/ci.yml

```diff
  security:
    name: Security Scan
    runs-on: ubuntu-latest
+   permissions:
+     actions: read
+     contents: read
+     security-events: write

    steps:
      ...
-     - name: Scan dependencies for vulnerabilities
-       run: bun pm scan
-       continue-on-error: true
+     - name: Audit dependencies
+       run: npm audit --audit-level=moderate
+       continue-on-error: true
```

## Impact Assessment

| Change                   | Risk | Impact                                   |
| ------------------------ | ---- | ---------------------------------------- |
| `.prettierignore` update | None | Excludes build artifacts from formatting |
| `monaco-editor` devDep   | None | Provides types for TypeScript            |
| CI workflow update       | Low  | Fixes security job permissions           |

## Testing Strategy

1. Run `bun run format:check` locally
2. Run `bun run typecheck:client` locally
3. Run `bun run lint` locally
4. Push changes and verify CI passes
