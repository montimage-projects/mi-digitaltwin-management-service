# GitHub Workflows for Documentation Updates

This directory contains automated workflows that validate, check, and maintain documentation quality for the MI Digital Twin Management Service.

## Workflows Overview

### Workflow Files

| Workflow                         | File                | Purpose                                 | Trigger                       |
| -------------------------------- | ------------------- | --------------------------------------- | ----------------------------- |
| **Documentation Validation**     | `docs-validate.yml` | Validate markdown, links, structure     | Push/PR with doc changes      |
| **Documentation Required Check** | `docs-required.yml` | Remind to update docs with code changes | All PRs                       |
| **Documentation Build & Deploy** | `docs-build.yml`    | Build and package documentation         | Push to main with doc changes |
| **Documentation Quality Check**  | `docs-quality.yml`  | Continuous quality monitoring           | Daily @ 9 AM UTC or manual    |
| **Code Quality**                 | `ci.yml`            | Lint, type check, build                 | Push/PR                       |

### Configuration Files

| File                      | Purpose                              |
| ------------------------- | ------------------------------------ |
| `.markdownlintrc`         | Markdown linting rules               |
| `mlc_config.json`         | Markdown link checker configuration  |
| `spelling-dictionary.txt` | Project-specific spelling dictionary |

## Quick Start

### Understanding the Workflows

**1. Documentation Validation** (`docs-validate.yml`)

- Runs automatically when documentation changes
- Checks:
- Markdown syntax and formatting
- Link validity (internal and external)
- YAML syntax
- Spelling
- Documentation structure
- Mermaid diagram syntax
- Status: Found in PR checks

**2. Documentation Required Check** (`docs-required.yml`)

- Runs on all PRs
- Reminds developers to update docs when code changes
- Adds helpful PR comments with documentation links
- Checks:
- If API routes changed → need to update `docs/API.md`
- If components changed → need to update `docs/COMPONENTS.md`
- If setup changed → need to update `docs/DEVELOPMENT.md`

**3. Documentation Build & Deploy** (`docs-build.yml`)

- Runs on push to `main` with documentation changes
- Builds and packages documentation
- Creates artifacts for deployment
- Generates build summary

**4. Documentation Quality Check** (`docs-quality.yml`)

- Runs daily at 9 AM UTC
- Analyzes documentation metrics
- Checks freshness (last update date)
- Finds TODO/FIXME markers
- Creates issues for problems found

## Viewing Workflow Results

### In GitHub UI

1. Go to your repository
2. Click "Actions" tab
3. Select workflow from left sidebar
4. View recent runs
5. Click run to see details and logs

### For Documentation Validation

Look for one of these in PR checks:

- Documentation Validation (all checks passed)
- Documentation Validation (warnings but didn't block)
- Documentation Validation (failed - needs fixing)

### For Quality Reports

Run quality check manually:

1. Go to "Actions" → "Documentation Quality Check"
2. Click "Run workflow"
3. Check logs for detailed report
4. Look for any created GitHub Issues

## Common Scenarios

### Scenario 1: I'm updating an API endpoint

**Steps:**

1. Update `server/src/routes/services.ts` (or relevant route)
2. Update `docs/API.md` with new/changed endpoint
3. Include:

- HTTP method and path
- Request parameters
- Response format
- Error codes
- Example curl command

4. Push changes
5. Create PR
6. **Validation runs automatically:**

- PR comment reminds you to check docs
- Links validation runs
- Build completes if successful

### Scenario 2: I'm adding a new React component

**Steps:**

1. Create component in `client/src/components/`
2. Update `docs/COMPONENTS.md` with:

- Component name and description
- Props interface
- Usage examples
- Related components

3. Push changes
4. Create PR
5. **Validation runs automatically:**

- Checks markdown formatting
- Validates links in component docs
- PR comment provides documentation guidelines
- Marks as complete once docs updated

### Scenario 3: Documentation has outdated information

**Steps:**

1. Make a PR to update the documentation
2. Workflows validate your changes:

- Markdown syntax
- Link validity
- Spelling
- Structure

3. Fix any reported issues
4. Push again
5. Workflows re-run automatically
6. Merge when all checks pass

## Workflow Details

### Documentation Validation Job Details

**Markdown Lint:**

- Checks files: `docs/**/*.md`, `README.md`, module READMEs
- Rules configured in `.markdownlintrc`
- Validates formatting consistency

**Link Check:**

- Validates internal links point to existing files
- Tests external URLs
- Ignores localhost and example.com URLs
- Configured in `mlc_config.json`

**Spell Check:**

- Uses `.github/workflows/spelling-dictionary.txt`
- Project-specific terms already added
- Non-blocking (doesn't fail PR)

**Structure Check:**

- Verifies all required documentation files exist:
- `README.md`
- `docs/README.md`
- `docs/API.md`
- `docs/COMPONENTS.md`
- `docs/DEVELOPMENT.md`
- `docs/DEPLOYMENT.md`
- `client/README.md`
- `server/README.md`
- Verifies directory structure

**Mermaid Validation:**

- Checks for valid Mermaid syntax
- Validates diagram structure

### Documentation Required Check Details

**API Route Changes:**

- Detects changes in `server/src/routes/`
- Checks if `docs/API.md` was updated
- Provides checklist for documenting:
- Endpoint details
- Parameters
- Responses
- Error codes
- Examples

**Component Changes:**

- Detects changes in `client/src/components/`
- Checks if `docs/COMPONENTS.md` was updated
- Reminds to document:
- Component props
- Usage examples
- Behavior changes

**PR Comment:**

- Added automatically on PR open
- Links to relevant documentation
- Guides new contributors

### Documentation Build & Deploy Details

**Metrics Calculated:**

- Total documentation files
- Total lines of documentation
- Code examples count
- Mermaid diagrams count
- Internal links count

**Artifacts Generated:**

- `documentation.tar.gz` - Complete docs package
- `docs-summary.txt` - Build summary

**Deployment Checklist:**

1. Download artifacts from workflow run
2. Extract `documentation.tar.gz`
3. Upload to documentation server
4. Update portal links if needed

### Documentation Quality Check Details

**Metrics Analyzed:**

- File count and line count
- Code example coverage
- Diagram coverage
- Link density
- Average documentation per file

**Coverage Checks:**

- All required files present
- All required sections in README
- API.md completeness
- Component coverage

**Freshness Checks:**

- Last update date
- Days since last update
- Alerts if > 30 days without update

**Completeness Checks:**

- Finds TODO/FIXME markers
- Reports incomplete sections
- Lists areas needing attention

**Structure Validation:**

- Heading hierarchy
- Section organization
- Document organization

## Configuration Customization

### Adding Project Terms to Dictionary

Edit `.github/workflows/spelling-dictionary.txt`:

```txt
# Add your term here
YourProjectTerm
YourAcronym
SpecialToolName
```

Then commit and re-run spell check workflow.

### Adjusting Markdown Rules

Edit `.markdownlintrc`:

```json
{
  "MD013": {
    "line_length": 120
  }
}
```

Common adjustments:

- `MD013`: Line length limits
- `MD033`: HTML in markdown
- `MD034`: Bare URLs

### Configuring Link Checker

Edit `.github/workflows/mlc_config.json`:

```json
{
  "ignorePatterns": [
    {
      "pattern": "^http(s)?://yoursite"
    }
  ]
}
```

Add patterns to ignore specific URLs.

## Troubleshooting

### Workflow Not Running

**Problem:** Workflow doesn't execute when expected

**Solution:**

1. Check branch is `main` or `develop`
2. Verify files modified match path filter
3. Confirm workflow file is in `.github/workflows/`
4. Check workflow is enabled (not disabled)

### Validation Failures

**Problem:** Validation workflow fails for documentation

**Solution:**

1. Check PR for validation error message
2. Review failing check details
3. Look up solution in specific workflow documentation
4. Fix issues and push again
5. Workflow re-runs automatically

**Common fixes:**

- Fix markdown formatting: `markdownlint --fix docs/API.md`
- Add broken link to dictionary if legitimate: edit `spelling-dictionary.txt`
- Ensure file exists if link broken: check path accuracy
- Add project term to spelling dictionary if correct

### Artifacts Not Available

**Problem:** Can't download documentation artifacts

**Solution:**

1. Check "Documentation Build & Deploy" workflow completed
2. Look for "Artifacts" section in workflow run
3. Artifacts kept for 30 days
4. Can manually trigger build: Actions → "Documentation Build & Deploy" → "Run workflow"

## Advanced Usage

### Running Workflows Manually

```bash
# Via GitHub UI:
# 1. Go to Actions
# 2. Select workflow
# 3. Click "Run workflow"
# 4. Choose branch
# 5. Click green "Run workflow" button
```

### Monitoring Documentation Health

**Check documentation status:**

1. Go to Actions tab
2. Look at recent workflow runs
3. Check for:

- Recent successful builds
- No red failures
- Issues created for problems

**Manual quality check:**

```bash
# Locally run checks
markdownlint docs/**/*.md
# (Plus additional checks as needed)
```

### Integrating with IDE

**VS Code:**

- Install "markdownlint" extension
- Install "Spell Checker" extension
- Get real-time validation while editing

**WebStorm:**

- Built-in markdown support
- Spell checking included
- Real-time validation

## Related Documentation

- [Workflows Guide](../../docs/WORKFLOWS.md) - Detailed workflow documentation
- [Development Guide](../../docs/DEVELOPMENT.md) - Development workflow
- [Documentation Standards](../../docs/README.md) - Documentation conventions
- [Contributing Guide](../../CLAUDE.md) - Contribution guidelines

## Quick Links

- **Documentation Index:** [docs/README.md](../../docs/README.md)
- **Workflow Status:** GitHub Actions tab
- **Documentation Portal:** [docs/](../../docs/)
- **Contributing:** See CLAUDE.md

## Support

For issues or questions:

1. Check the logs in GitHub Actions
2. Review [Workflows Guide](../../docs/WORKFLOWS.md)
3. Check similar issues in repository
4. Contact documentation team

---

**Last Updated:** January 12, 2026
**Workflow Version:** 1.0
