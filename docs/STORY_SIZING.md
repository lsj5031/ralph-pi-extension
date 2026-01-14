# Story Sizing Guidelines

Complete guide to sizing user stories for Ralph autonomous execution.

## The Golden Rule

**Each story must be completable in ONE iteration (one context window).**

Ralph spawns a fresh pi instance per iteration with no memory of previous work. If a story is too big, the LLM runs out of context before finishing and produces broken code.

## Why Size Matters

### Too Small
- Wastes iterations
- Unnecessary commits
- Slower overall progress

### Too Big
- Runs out of context
- Produces broken code
- Wastes time debugging
- May need to start over

### Just Right ✅
- Completes in one iteration
- Passes all quality checks
- Creates working code
- Can be verified independently

## Story Size Framework

### Tiny (Avoid - Too Small)
These are too small and should be combined:

- Update one CSS class
- Change button text
- Add console.log statement
- Fix one typo
- Change variable name

**Combine with related changes.**

### Small (Good - Default)
Ideal size for most stories:

- Add one database column and migration
- Add one UI component to existing page
- Update one server action with new logic
- Add one filter dropdown to a list
- Create one API endpoint
- Add form validation to one form
- Implement one utility function
- Add one test file

**This should be your default story size.**

### Medium (Use Carefully)
Larger but still completable:

- Add related database columns (e.g., address fields)
- Create a small multi-component feature (3-4 components)
- Add basic CRUD for one entity
- Implement authentication flow
- Create a simple dashboard

**Only use if you're confident it fits in one context.**

### Large (Avoid - Too Big)
These will fail and must be split:

- "Build entire dashboard"
- "Add authentication system"
- "Refactor the API"
- "Create full CRUD with all features"
- "Build payment flow"
- "Add notification system"

**Split these into smaller stories.**

## Sizing by Layer

### Database Layer (Small)

**Good size:**
- Add one table with related columns
- Add one index
- Create one migration
- Add foreign key constraint

**Too big:**
- Add entire schema redesign
- Create multiple unrelated tables

### Backend Layer (Small-Medium)

**Good size:**
- Create one API endpoint
- Add one server action
- Implement one service method
- Add one middleware
- Create one validation schema

**Too big:**
- "Build entire API"
- "Refactor all services"
- "Add error handling everywhere"

### Frontend Layer (Small-Medium)

**Good size:**
- Add one UI component
- Add one form
- Add one filter/sort feature
- Update one page layout
- Add one button with handler

**Too big:**
- "Build entire dashboard"
- "Redesign all components"
- "Add theming system"

## Splitting Examples

### Example 1: User Dashboard

#### Original (Too Big) ❌
```
Build user dashboard with stats, charts, and filters
```

#### Split Into ✅
1. Add dashboard database queries
2. Create stats summary component
3. Add chart component (one chart type)
4. Add date range filter
5. Add status filter
6. Add export to CSV button
7. Create dashboard layout

Each story is independently completable and verifiable.

### Example 2: Authentication

#### Original (Too Big) ❌
```
Add user authentication with login, logout, and sessions
```

#### Split Into ✅
1. Add users table to database
2. Create password hashing utility
3. Create login API endpoint
4. Create session management
5. Add login form component
6. Add logout functionality
7. Add auth middleware
8. Add protected route wrapper

Each builds on the previous but is small enough to complete.

### Example 3: Task Management

#### Original (Too Big) ❌
```
Add full task CRUD with categories, priorities, and due dates
```

#### Split Into ✅
1. Add tasks table with basic fields
2. Create task creation API
3. Create task listing API
4. Create task update API
5. Create task delete API
6. Add task form component
7. Add task list component
8. Add category dropdown
9. Add priority selector
10. Add due date picker

Each focuses on one specific piece of functionality.

## Decision Framework

Use this checklist to decide if a story is the right size:

### ✅ Story is ready if:
- [ ] Can be described in 1-2 sentences
- [ ] Changes 1-3 files (typically)
- [ ] Has 3-5 acceptance criteria
- [ ] Takes 10-30 minutes to implement manually
- [ ] Can be tested independently
- [ ] Doesn't require learning new major concepts

### ❌ Story needs splitting if:
- [ ] Requires a paragraph to describe
- [ ] Changes 5+ files
- [ ] Has 10+ acceptance criteria
- [ ] Takes 1+ hours to implement manually
- [ ] Includes multiple unrelated features
- [ ] Requires learning new framework/library

## Signs Your Story is Too Big

### During Planning
- Description is vague ("build feature X")
- Acceptance criteria are generic ("works well")
- Can't estimate implementation time
- Story spans multiple layers (DB + API + UI)

### During Execution
- Ralph runs out of context
- Incomplete implementation
- Broken code
- Forgotten parts
- Quality checks fail

### If This Happens
Stop immediately, split the story, and update `prd.json`.

## Signs Your Story is Too Small

### During Planning
- Only changes 1-2 lines
- Trivial fix
- No real value on its own

### During Execution
- Completes in seconds
- Feels pointless to commit
- Could have been done with previous story

### If This Happens
Combine with related changes in one story.

## Special Cases

### Bug Fixes
Usually small, one story per bug unless:
- Multiple bugs in same file → Combine
- Related bugs in same feature → Combine

### Refactoring
Can be tricky:
- Rename one variable → Too small
- Refactor one function → Good size
- Refactor entire module → Too big (split by function)

### Dependencies
If Story B depends on Story A:
- Ensure Story A is complete first
- Order them by priority (A=1, B=2)
- Each story must still be independently completable

## Real-World Examples

### ✅ Well-Sized Stories

**US-001: Add user avatar field**
```
Description: Add avatar_url column to users table
Criteria:
- Add column as nullable string
- Generate migration
- Migration runs successfully
- Typecheck passes
```

**US-002: Upload avatar image**
```
Description: Allow users to upload avatar images
Criteria:
- Add upload endpoint at /api/user/avatar
- Accepts image file (max 2MB)
- Stores file and updates user.avatar_url
- Typecheck passes
- Tests pass
```

**US-003: Display avatar in header**
```
Description: Show user avatar in navigation header
Criteria:
- Avatar image shows in top right
- Shows as 40x40px circle
- Falls back to default icon if no avatar
- Typecheck passes
- Verify in browser
```

**US-004: Add avatar settings page**
```
Description: Create page for users to manage avatar
Criteria:
- Settings page at /settings/avatar
- Shows current avatar
- Upload button that works
- Remove button that clears avatar
- Typecheck passes
- Verify in browser
```

Each is small, focused, and verifiable.

### ❌ Poorly Sized Stories

**Too Big:**
```
"Build complete user profile system with avatar, bio,
location, website, social links, and privacy settings"
```

**Too Small:**
```
"Change avatar border-radius from 50% to 50%"
```

## Template for Right-Sized Stories

```json
{
  "id": "US-XXX",
  "title": "[One specific thing]",
  "description": "As a [user], I want [one specific feature] so that [one specific benefit]",
  "acceptanceCriteria": [
    "[Specific technical change 1]",
    "[Specific technical change 2]",
    "[Specific verification 1]",
    "Typecheck passes"
  ],
  "priority": 1,
  "passes": false,
  "notes": ""
}
```

## Quick Reference

| Story Size | Files Changed | Criteria | Time | Split? |
|------------|--------------|----------|------|--------|
| Tiny | 1 | 1-2 | <5 min | Yes (combine) |
| Small ✅ | 1-3 | 3-5 | 10-30 min | No |
| Medium ⚠️ | 3-5 | 5-8 | 30-60 min | Maybe |
| Large ❌ | 5+ | 8+ | 60+ min | Yes (split) |

## Bottom Line

**When in doubt, split it.**

It's better to have 10 small stories that complete successfully than 1 big story that fails halfway through.

You can always combine related small stories later if needed.

## Related Documentation

- [PRD Format Guide](PRD_FORMAT.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Main README](../README.md)
