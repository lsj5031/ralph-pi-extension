# Troubleshooting Ralph

Common issues and solutions when using Ralph with pi code agent.

## Table of Contents

- [General Issues](#general-issues)
- [PRD Issues](#prd-issues)
- [Execution Issues](#execution-issues)
- [Quality Check Issues](#quality-check-issues)
- [Git Issues](#git-issues)
- [Getting Help](#getting-help)

## General Issues

### Ralph doesn't start

**Symptoms:**
- `/ralph` command not recognized
- "Command not found" error

**Solutions:**

1. **Check extension is installed:**
```bash
ls ~/.pi/agent/extensions/ralph.ts
```

If missing, copy it:
```bash
cp ralph.ts ~/.pi/agent/extensions/
```

2. **Restart pi:**
```bash
# Exit and restart pi
exit
pi
```

3. **Check pi version:**
```bash
pi --version
```

Ensure you have the latest version from [pi-mono](https://github.com/badlogic/pi-mono).

### prd.json not found

**Symptoms:**
- Error: "prd.json not found in current directory"

**Solutions:**

1. **Check you're in project root:**
```bash
pwd
ls prd.json
```

2. **Create prd.json:**
Use the ralph-prd skill to convert your PRD:
```
Load ralph-prd skill and convert [your PRD] to prd.json
```

3. **Use correct path:**
Ralph looks for `prd.json` in current working directory.

## PRD Issues

### Invalid prd.json format

**Symptoms:**
- Error parsing prd.json
- Stories not being recognized

**Solutions:**

1. **Validate JSON:**
```bash
cat prd.json | jq .
```

If you get an error, the JSON is malformed.

2. **Check required fields:**
```json
{
  "project": "required",
  "branchName": "required",
  "description": "required",
  "userStories": [
    {
      "id": "US-001",
      "title": "required",
      "description": "required",
      "acceptanceCriteria": ["required"],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

3. **Use the ralph-prd skill:**
This ensures correct format automatically.

### Story too big

**Symptoms:**
- Ralph runs out of context
- Incomplete implementation
- Broken code
- Story marked as complete but doesn't work

**Solutions:**

1. **Check story size:**
- Can it be described in 1-2 sentences?
- Does it have 3-5 acceptance criteria?
- Does it change 1-3 files?

If no to any, the story is too big.

2. **Split the story:**
```bash
# Edit prd.json
nano prd.json

# Split US-003 into US-003a and US-003b
# Update priorities and IDs
```

3. **See Story Sizing Guidelines:**
[STORY_SIZING.md](STORY_SIZING.md)

### Stories in wrong order

**Symptoms:**
- Later story fails because it depends on earlier one
- "Table not found" errors
- "Function not defined" errors

**Solutions:**

1. **Check dependencies:**
- UI components shouldn't come before database schema
- Backend logic shouldn't come before data models

2. **Reorder priorities:**
```json
{
  "userStories": [
    {
      "id": "US-001",
      "title": "Add database schema",
      "priority": 1  // First
    },
    {
      "id": "US-002",
      "title": "Create API endpoint",
      "priority": 2  // Second (depends on schema)
    },
    {
      "id": "US-003",
      "title": "Add UI component",
      "priority": 3  // Third (depends on API)
    }
  ]
}
```

3. **Fix in prd.json:**
Reorder stories so dependencies come first.

## Execution Issues

### Ralph stops early

**Symptoms:**
- Ralph stops before all stories complete
- "Max iterations reached"
- No errors but stories remain

**Solutions:**

1. **Check iteration count:**
```bash
/ralph-status
```

See how many stories are pending.

2. **Continue Ralph:**
```bash
/ralph-continue 10
```

3. **Increase max iterations:**
```bash
/ralph 20
```

### Ralph gets stuck

**Symptoms:**
- No progress for long time
- Same story repeats
- No commits being made

**Solutions:**

1. **Check progress.txt:**
```bash
cat progress.txt
```

Look for errors or repeated issues.

2. **Check git status:**
```bash
git status
git log --oneline -5
```

3. **Manually complete the story:**
- Fix any issues
- Run quality checks
- Mark story as complete manually

4. **Restart Ralph:**
```bash
/ralph-continue 10
```

### No commits being made

**Symptoms:**
- Ralph runs but no git commits
- Stories marked as passed but no commits

**Solutions:**

1. **Check git is initialized:**
```bash
git status
```

If not a git repo:
```bash
git init
git add .
git commit -m "Initial commit"
```

2. **Check branch exists:**
Ralph creates branch from `branchName` in prd.json.

```bash
git branch -a
```

3. **Check git config:**
```bash
git config user.name
git config user.email
```

Set if missing:
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## Quality Check Issues

### Typecheck fails

**Symptoms:**
- Story marked as incomplete
- "Typecheck failed" error

**Solutions:**

1. **Run typecheck manually:**
```bash
npm run typecheck
# or
tsc --noEmit
```

2. **Fix errors:**
Fix TypeScript errors and try again.

3. **Update typecheck command:**
If your project uses different command:
```bash
/ralph-quality-check ["custom-typecheck-command"]
```

4. **Remove typecheck criterion:**
Only if story doesn't involve TypeScript (rare).

### Tests fail

**Symptoms:**
- Story marked as incomplete
- "Tests failed" error

**Solutions:**

1. **Run tests manually:**
```bash
npm test
```

2. **Fix failing tests:**
Fix test errors and try again.

3. **Update test command:**
If your project uses different command:
```bash
/ralph-quality-check ["npm run test:custom"]
```

4. **Remove tests criterion:**
Only if story has no testable logic.

### Lint fails

**Symptoms:**
- Story marked as incomplete
- "Lint failed" error

**Solutions:**

1. **Run linter manually:**
```bash
npm run lint
# or
eslint .
```

2. **Fix lint errors:**
Fix lint issues and try again.

3. **Disable linter:**
Remove from quality checks if not needed:
```bash
/ralph-quality-check ["npm run typecheck", "npm test"]
```

## Git Issues

### Wrong branch checked out

**Symptoms:**
- Ralph working on wrong branch
- Commits going to wrong place

**Solutions:**

1. **Check branchName in prd.json:**
```bash
cat prd.json | grep branchName
```

2. **Update branchName:**
```bash
nano prd.json
# Change branchName to correct branch
```

3. **Checkout correct branch manually:**
```bash
git checkout ralph/your-feature
```

### Merge conflicts

**Symptoms:**
- Git merge conflicts
- Can't commit changes

**Solutions:**

1. **Resolve conflicts:**
```bash
git status
# Resolve conflicted files
git add .
git commit
```

2. **Rebase on main:**
```bash
git checkout ralph/your-feature
git rebase main
```

3. **Start fresh:**
If too many conflicts:
```bash
git checkout main
git branch -D ralph/your-feature
/ralph 10  # Will create new branch
```

### Branch already exists

**Symptoms:**
- "Branch already exists" error
- Ralph won't start

**Solutions:**

1. **Use existing branch:**
```bash
git checkout ralph/your-feature
/ralph-continue 10
```

2. **Delete existing branch:**
```bash
git branch -D ralph/your-feature
/ralph 10  # Will create new branch
```

3. **Update branchName in prd.json:**
Use a different branch name:
```json
{
  "branchName": "ralph/your-feature-v2"
}
```

## Getting Help

### Check Progress Log

Always check progress.txt first:
```bash
cat progress.txt
```

Look for:
- Error messages
- Patterns discovered
- Learnings from previous iterations
- Codebase-specific notes

### Check PRD Status

```bash
/ralph-status
```

Shows:
- Which stories are complete
- Which stories are pending
- Priority order

### Manual Intervention

Sometimes you need to fix things manually:
1. Fix broken code
2. Run quality checks
3. Commit changes
4. Update prd.json to mark story complete
5. Continue with `/ralph-continue`

### Start Fresh

If things are really broken:
```bash
# Backup current work
cp prd.json prd.json.backup
cp progress.txt progress.txt.backup

# Delete Ralph branch
git checkout main
git branch -D ralph/your-feature

# Restore prd.json
cp prd.json.backup prd.json

# Start fresh
/ralph 10
```

### Get Community Help

- [GitHub Issues](https://github.com/lsj5031/ralph-pi-extension/issues)
- [GitHub Discussions](https://github.com/lsj5031/ralph-pi-extension/discussions)
- [pi-mono Repository](https://github.com/badlogic/pi-mono)

When asking for help, include:
- Error messages
- prd.json (sanitized)
- progress.txt
- What you've tried
- pi version

## Prevention Tips

### Before Starting Ralph

1. **Validate prd.json:**
```bash
cat prd.json | jq .
```

2. **Check git status:**
```bash
git status  # Should be clean
```

3. **Test quality checks:**
```bash
npm run typecheck
npm run lint
npm test
```

4. **Start with small PRD:**
First time? Start with 3-5 small stories.

### During Ralph Runs

1. **Monitor progress:**
```bash
watch -n 10 'tail -20 progress.txt'
```

2. **Check commits:**
```bash
watch -n 10 'git log --oneline -5'
```

3. **Don't interrupt:**
Let Ralph complete the iteration.

### After Each Story

1. **Verify it works:**
- Run the app
- Test the feature
- Check for errors

2. **Review commit:**
```bash
git show HEAD
```

3. **Update if needed:**
If something is wrong, fix it before continuing.

## Common Error Messages

### "prd.json not found"
- [See solution](#prdjson-not-found)

### "Invalid prd.json format"
- [See solution](#invalid-prdjson-format)

### "Story too big"
- [See solution](#story-too-big)

### "Max iterations reached"
- [See solution](#ralph-stops-early)

### "Typecheck failed"
- [See solution](#typecheck-fails)

### "Branch already exists"
- [See solution](#branch-already-exists)

## Related Documentation

- [PRD Format Guide](PRD_FORMAT.md)
- [Story Sizing Guidelines](STORY_SIZING.md)
- [Main README](../README.md)
- [Contributing](../CONTRIBUTING.md)

---

Still having issues? [Open an issue](https://github.com/lsj5031/ralph-pi-extension/issues) on GitHub!
