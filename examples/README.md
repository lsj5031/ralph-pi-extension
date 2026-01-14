# Ralph PRD Examples

This directory contains example PRDs in Ralph's JSON format to help you get started.

## Examples

### simple-prd.json

A simple task status feature with 4 user stories:
- Add status field to database
- Display status badge on UI
- Add status toggle functionality
- Filter tasks by status

**Good for:**
- First-time Ralph users
- Learning the PRD format
- Understanding story sizing

## How to Use

1. **Copy the example:**
```bash
cp examples/simple-prd.json prd.json
```

2. **Customize for your project:**
```bash
nano prd.json
# Update project name, branch name, and stories
```

3. **Run Ralph:**
```bash
/ralph 10
```

## Example Structure

Each example includes:
- Properly formatted JSON
- Right-sized stories (completable in one iteration)
- Correct story ordering (dependencies first)
- Verifiable acceptance criteria
- Required quality gates (typecheck, browser verification)

## Creating Your Own PRD

When creating your own PRD from scratch:

1. **Use the ralph-prd skill:**
```
Load ralph-prd skill and convert [your PRD markdown] to prd.json
```

2. **Follow the format:**
See [PRD Format Guide](../docs/PRD_FORMAT.md)

3. **Size stories correctly:**
See [Story Sizing Guidelines](../docs/STORY_SIZING.md)

4. **Validate JSON:**
```bash
cat prd.json | jq .
```

## Example Story Breakdown

### Original Feature (Too Big)
```
Add user notification system with bell, dropdown, preferences
```

### Broken Down (Right-Sized)
1. Add notifications table to database
2. Create notification service
3. Add notification bell icon to header
4. Create notification dropdown panel
5. Add mark-as-read functionality
6. Add notification preferences page

Each story is:
- Focused on one thing
- Completable in one iteration
- Independently verifiable
- Ordered by dependencies

## Tips for Learning

1. **Start with simple-prd.json**
2. **Run Ralph and watch it work**
3. **Check progress.txt after each story**
4. **Examine the git commits**
5. **Review the code changes**
6. **Try modifying the PRD**
7. **Create your own from scratch**

## Common Mistakes to Avoid

❌ **Don't:**
- Create stories that are too big
- Put UI before database schema
- Use vague acceptance criteria
- Forget "Typecheck passes" criterion

✅ **Do:**
- Split big features into small stories
- Order by dependencies
- Use specific, verifiable criteria
- Always include quality gates

## Next Steps

- [Main README](../README.md)
- [PRD Format Guide](../docs/PRD_FORMAT.md)
- [Story Sizing Guidelines](../docs/STORY_SIZING.md)
- [Troubleshooting](../docs/TROUBLESHOOTING.md)
