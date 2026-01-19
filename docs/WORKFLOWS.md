# GitHub Workflows Guide

This document describes the automated workflows for documentation maintenance and quality assurance.

## Overview

The MI Digital Twin Management Service includes several GitHub Actions workflows that automatically validate, check, and maintain documentation quality. These workflows ensure consistency and completeness across all documentation.

## Workflows

### 1. Documentation Validation (`docs-validate.yml`)

**Trigger:** Pushes and PRs that modify documentation

**Purpose:** Validate documentation quality and structure

**Steps:**

1. **Markdown Linting** - Checks markdown syntax and formatting

- Uses `markdownlint` for style consistency
- Configuration: `.markdownlintrc`

2. **Link Validation** - Checks all internal and external links

- Validates relative paths exist
- Tests external URLs (with localhost/example.com excluded)
- Configuration: `.github/workflows/mlc_config.json`

3. **YAML Validation** - Checks YAML syntax in documentation

- Validates any embedded YAML
- Catches syntax errors early

4. **Spell Check** - Detects misspellings

- Uses project-specific dictionary
- Configuration: `.github/workflows/spelling-dictionary.txt`
- Can be customized for project terminology

5. **Documentation Structure** - Verifies required files exist

- Checks for all required documentation files
- Checks for all required directory structure
- Reports missing documentation

6. **Mermaid Validation** - Validates diagram syntax

- Checks Mermaid diagram blocks
- Ensures valid syntax

**When It Runs:**

- On push to `main` or `develop` branches when docs change
- On pull requests to `main` or `develop` with doc changes

**View Results:**

- Check GitHub Actions tab in repository
- Look for "Documentation Validation" workflow

### 2. Documentation Required Check (`docs-required.yml`)

**Trigger:** All pull requests to `main` or `develop`

**Purpose:** Remind developers to update documentation when code changes

**Checks:**

1. **Code Change Detection**

- Detects changes to routes, components, hooks, and models
- Checks if documentation was updated

2. **API Documentation**

- Warns if API routes changed without updating `docs/API.md`
- Provides checklist of what should be documented

3. **Component Documentation**

- Warns if components changed without updating `docs/COMPONENTS.md`
- Lists required documentation items

4. **PR Comment**

- Adds helpful comment with links to documentation
- Guides new contributors to relevant docs

**When It Runs:**

- On every pull request to `main` or `develop`
- When PR is opened or synchronized

**View Results:**

- Check PR comments for documentation reminders
- Review "Documentation Required Check" job results

### 3. Documentation Build & Deploy (`docs-build.yml`)

**Trigger:** Pushes to `main` when documentation changes

**Purpose:** Build and package documentation for deployment

**Steps:**

1. **Generate Index** - Creates documentation statistics
2. **Validate Files** - Checks for broken links
3. **Check Completeness** - Verifies all required sections exist
4. **Create Artifact** - Packages documentation as `.tar.gz`
5. **Publish Status** - Reports build results
6. **Verify Artifact** - Confirms package integrity

**Artifacts Created:**

- `documentation.tar.gz` - Complete documentation package
- `docs-summary.txt` - Build summary with statistics

**When It Runs:**

- Automatically on push to `main` with doc changes
- Can be triggered manually via workflow dispatch

**View Results:**

- Download artifacts from workflow run
- Check build summary in logs

### 4. Documentation Quality Check (`docs-quality.yml`)

**Trigger:** Daily at 9 AM UTC (scheduled) or manual dispatch

**Purpose:** Continuous monitoring of documentation quality

**Analyzes:**

1. **Metrics**

- Total documentation files
- Total lines of documentation
- Code examples count
- Mermaid diagrams count
- Internal links count

2. **Coverage**

- Verifies all required documentation files exist
- Checks file completeness

3. **Freshness**

- Reports when documentation was last updated
- Warns if not updated in 30+ days
- Suggests updates if needed

4. **Completeness**

- Finds TODO/FIXME markers in docs
- Reports incomplete sections

5. **Structure**

- Validates markdown heading hierarchy
- Checks for proper structure

**Issues Created:**

- Automatically creates GitHub Issue if problems found
- Labels: `documentation`, `quality`
- Only creates one issue per run

**When It Runs:**

- Daily at 9 AM UTC
- Can be triggered manually via workflow dispatch

**View Results:**

- Check workflow run logs for detailed report
- Look for GitHub Issues with `documentation` label

## Configuration Files

### `.markdownlintrc`

Markdown linting configuration with rules for:

- Heading style consistency
- List indentation (2 spaces)
- Line length (120 characters)
- Special cases for code blocks

### `.github/workflows/mlc_config.json`

Markdown link checker configuration:

- Ignores localhost and example.com links
- Configures retry behavior
- Sets timeout (10 seconds)
- Maps relative paths to GitHub URLs

### `.github/workflows/spelling-dictionary.txt`

Project-specific spelling dictionary includes:

- Project names (INTACT, MAESTRO, UBITECH)
- Technology terms (Bun, Vite, Tailwind, etc.)
- Architecture terms (microservices, monorepo, API)
- Common abbreviations (CLI, SDK, IDE, etc.)

## Usage Examples

### Running Workflows Manually

**Trigger Documentation Build:**

```bash
# Go to GitHub Actions
# Select "Documentation Build & Deploy"
# Click "Run workflow"
# Choose branch (main)
```

**Trigger Quality Check:**

```bash
# Go to GitHub Actions
# Select "Documentation Quality Check"
# Click "Run workflow"
# Results in logs and optional GitHub Issue
```

### Interpreting Results

**Green checkmark ():**

- All validation passed
- Documentation is in good shape
- No action required

**Yellow warning ():**

- Non-blocking issues found
- Should review and address
- Doesn't prevent merge

**Red error ():**

- Blocking issues found
- Must be fixed before merge
- Review error messages for details

### Fixing Common Issues

**Broken Links:**

```bash
# Find broken link in output
# Update relative path in documentation
# Ensure file exists at specified path
# Re-run validation
```

**Markdown Formatting:**

```bash
# Install markdownlint locally
npm install -g markdownlint-cli

# Check file
markdownlint docs/API.md

# Fix issues
markdownlint --fix docs/API.md
```

**Spelling Errors:**

```bash
# Review flagged word in context
# If legitimate project term:
# - Add to .github/workflows/spelling-dictionary.txt
# - Commit change
# - Re-run workflow
```

## Best Practices

### When Modifying Documentation

1. **Run locally before pushing:**

```bash
# Check markdown
markdownlint docs/**/*.md

# Check links manually
# Spell check (use IDE extension or local tool)
```

2. **Verify structure:**

- Check headings are properly hierarchical
- Ensure required sections exist
- Validate relative links

3. **Update when code changes:**

- Changes to API routes → Update `docs/API.md`
- Changes to components → Update `docs/COMPONENTS.md`
- Setup/architecture changes → Update relevant guide

### Maintaining Documentation Quality

1. **Respond to workflow warnings:**

- Fix reported issues promptly
- Don't ignore link validation warnings
- Keep documentation current

2. **Regular reviews:**

- Check daily quality reports
- Update dated examples
- Remove TODO/FIXME markers

3. **Test documentation:**

- Verify code examples work
- Test all step-by-step guides
- Validate all links quarterly

## Workflow Status Dashboard

### Check Current Status

Visit GitHub Actions to see:

- Last run of each workflow
- Overall pass/fail status
- Recent failures or warnings
- Artifact availability

### Monitor Documentation Health

**High-level checks:**

- Are recent pushes passing validation?
- Have quality issues been reported?
- Is documentation being updated regularly?

**Specific checks:**

- Last documentation update: `docs-quality.yml` logs
- Link validity: `docs-validate.yml` results
- Code examples accuracy: Manual verification needed

## Troubleshooting

### Workflow Not Triggering

**Problem:** Workflow doesn't run when docs change

**Solution:**

1. Check branch is `main` or `develop`
2. Verify files changed match workflow path filters
3. Check workflow file is in `.github/workflows/`

### False Positive Warnings

**Problem:** Link marked as broken but exists

**Solution:**

1. Check file path is correct
2. Verify file is committed to git (not ignored)
3. Check for case sensitivity issues
4. Add to ignore patterns if false positive

**Problem:** Word flagged as misspelling but correct

**Solution:**

1. Add term to `.github/workflows/spelling-dictionary.txt`
2. Commit change
3. Re-run workflow

### Artifacts Not Available

**Problem:** Documentation artifacts not available after build

**Solution:**

1. Check "Documentation Build & Deploy" workflow ran successfully
2. Look for artifacts section in workflow run
3. Artifacts available for 30 days

## Customization

### Adding New Checks

To add new validation:

1. **Edit workflow file** (e.g., `docs-validate.yml`)
2. **Add new job step:**

```yaml
- name: Your check name
run: |
# Your validation script here
```

3. **Test locally:**

```bash
# Install dependencies
# Run validation command
```

4. **Commit and push** to trigger workflow

### Updating Spelling Dictionary

To add project-specific terms:

1. **Edit** `.github/workflows/spelling-dictionary.txt`
2. **Add terms** (one per line with comments)
3. **Commit** with clear message
4. **Re-run** spell check workflow

### Adjusting Markdown Rules

To customize markdown style:

1. **Edit** `.markdownlintrc`
2. **Adjust rules** (see markdownlint docs)
3. **Test locally:**

```bash
markdownlint --config .markdownlintrc docs/
```

4. **Commit** changes

## Integration with Development

### CI/CD Pipeline

Documentation validation runs as part of:

- Pull request checks (automatic)
- Build pipeline (on doc changes)
- Quality gates (daily)

### Pre-commit Hooks

To validate locally before pushing:

```bash
# Check markdown
markdownlint docs/**/*.md

# Check links
# (Use mdl or similar tool)

# Check spelling
# (Use aspell or similar tool)
```

### IDE Integration

**VS Code Extensions:**

- markdownlint - Real-time markdown linting
- Markdown Preview - Preview documentation
- Spell Checker - Spelling validation

## Related Documentation

- [Development Guide](DEVELOPMENT.md) - Development workflow
- [Deployment Guide](DEPLOYMENT.md) - Deployment procedures
- [Documentation Index](README.md) - All documentation
- [Architecture Overview](architecture/overview.md) - System design

## Support

For workflow issues or questions:

1. Check workflow run logs in GitHub Actions
2. Review this guide for solutions
3. Check project issues for similar problems
4. Contact documentation team

---

**Last Updated:** January 12, 2026
**Documentation Version:** 1.0
