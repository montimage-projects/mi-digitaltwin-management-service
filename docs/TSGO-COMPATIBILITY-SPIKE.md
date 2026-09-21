# TypeScript 7 / tsgo Compatibility Spike

## Date

2024-08-27

## Summary

Project is already at TypeScript 7.0.2. This spike evaluates compatibility with tsgo (TypeScript Go, GA 2026-07-08).

## Current State

- TypeScript: 7.0.2 (both workspaces)
- typescript-eslint: 8.63.0
- vite-plugin-react: current
- vitest: 4.1.11

## tsgo Compatibility Assessment

### typescript-eslint 8.x

- typescript-eslint v8.x supports TypeScript 5.x
- tsgo compatibility not yet confirmed for v8.x
- **Action**: Monitor typescript-eslint releases for tsgo support

### vite-plugin-react

- Vite uses esbuild for fast compilation
- esbuild has its own TypeScript handling
- tsgo not needed for Vite builds
- **Status**: No impact

### vitest

- Vitest uses esbuild/Vite for test runs
- Type checking is optional (can use tsc separately)
- **Status**: No impact

### tsx

- tsx uses its own TypeScript handling
- tsgo not needed for tsx execution
- **Status**: No impact

## Removed Flags Audit (TS7)

- `baseUrl`: Still supported
- `moduleResolution: node`: Still supported
- No breaking changes detected for current config

## Recommendation

**GO**: Proceed with tsgo when typescript-eslint v9+ supports it. No immediate action needed.

## Open Questions

1. When will typescript-eslint v9 support tsgo?
2. Will tsgo change the compilation output format?
3. Are there performance benefits worth migrating?

## References

- https://devblogs.microsoft.com/typescript/announcing-typescript-go/
- https://github.com/microsoft/typescript-go
