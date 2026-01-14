# Ralph PRD Format Guide

Complete guide to creating PRDs in Ralph's JSON format for autonomous execution.

## Overview

Ralph uses a specific JSON format for PRDs that enables autonomous execution. This format breaks down features into small, completable user stories with clear acceptance criteria.

## JSON Structure

```json
{
  "project": "[Project Name]",
  "branchName": "ralph/[feature-name-kebab-case]",
  "description": "[Feature description from PRD title/intro]",
  "userStories": [
    {
      "id": "US-001",
      "title": "[Story title]",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

## Field Descriptions

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project` | string | Yes | Name of the project |
| `branchName` | string | Yes | Git branch name (format: `ralph/feature-name`) |
| `description` | string | Yes | Brief description of the feature |
| `userStories` | array | Yes | Array of user story objects |

### User Story Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique story ID (format: `US-001`, `US-002`, etc.) |
| `title` | string | Yes | Short, descriptive title |
| `description` | string | Yes | User story format: "As a [user], I want [feature] so that [benefit]" |
| `acceptanceCriteria` | array | Yes | Verifiable criteria (see guidelines below) |
| `priority` | number | Yes | Execution order (1 = first) |
| `passes` | boolean | Yes | Completion status (always `false` initially) |
| `notes` | string | Yes | Additional notes (always empty string initially) |

## Story Sizing Rules

### The Number One Rule

**Each story must be completable in ONE iteration (one context window).**

Ralph spawns a fresh pi instance per iteration with no memory of previous work. If a story is too big, the LLM runs out of context before finishing and produces broken code.

### Right-Sized Stories ✅

- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list
- Create a new API endpoint
- Add form validation
- Implement a utility function

### Too Big (Split These) ❌

- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"
- "Create a full CRUD system"
- "Build a payment flow"

**Rule of thumb**: If you cannot describe the change in 2-3 sentences, it is too big.

## Story Ordering

Stories execute in priority order (1, 2, 3...). Earlier stories must NOT depend on later ones.

### Correct Order ✅

1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

### Wrong Order ❌

1. UI component (depends on schema that doesn't exist yet)
2. Schema change

## Acceptance Criteria Guidelines

### Must Be Verifiable

Each criterion must be something Ralph can CHECK, not something vague.

### Good Criteria ✅

```json
{
  "acceptanceCriteria": [
    "Add status column to tasks table with default 'pending'",
    "Filter dropdown has options: All, Active, Completed",
    "Clicking delete shows confirmation dialog",
    "Typecheck passes"
  ]
}
```

### Bad Criteria ❌

```json
{
  "acceptanceCriteria": [
    "Works correctly",
    "User can do X easily",
    "Good UX",
    "Handles edge cases"
  ]
}
```

### Required Criteria

**Every story must include:**
```json
"Typecheck passes"
```

**For stories with testable logic:**
```json
"Tests pass"
```

**For stories that change UI:**
```json
"Verify in browser using dev-browser skill"
```

## Complete Example

```json
{
  "project": "TaskApp",
  "branchName": "ralph/task-status",
  "description": "Task Status Feature - Track task progress with status indicators",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add status field to tasks table",
      "description": "As a developer, I need to store task status in the database.",
      "acceptanceCriteria": [
        "Add status column: 'pending' | 'in_progress' | 'done' (default 'pending')",
        "Generate and run migration successfully",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-002",
      "title": "Display status badge on task cards",
      "description": "As a user, I want to see task status at a glance.",
      "acceptanceCriteria": [
        "Each task card shows colored status badge",
        "Badge colors: gray=pending, blue=in_progress, green=done",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 2,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-003",
      "title": "Add status toggle to task list rows",
      "description": "As a user, I want to change task status directly from the list.",
      "acceptanceCriteria": [
        "Each row has status dropdown or toggle",
        "Changing status saves immediately",
        "UI updates without page refresh",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 3,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-004",
      "title": "Filter tasks by status",
      "description": "As a user, I want to filter the list to see only certain statuses.",
      "acceptanceCriteria": [
        "Filter dropdown: All | Pending | In Progress | Done",
        "Filter persists in URL params",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 4,
      "passes": false,
      "notes": ""
    }
  ]
}
```

## Splitting Large Features

### Original (Too Big)
```json
{
  "title": "Add user notification system",
  "description": "Build complete notification system"
}
```

### Split Into Multiple Stories

```json
{
  "userStories": [
    {
      "id": "US-001",
      "title": "Add notifications table to database",
      "description": "As a developer, I need a notifications table.",
      "acceptanceCriteria": [
        "Create notifications table with id, user_id, message, created_at",
        "Add index on user_id",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-002",
      "title": "Create notification service",
      "description": "As a developer, I need a service to send notifications.",
      "acceptanceCriteria": [
        "Create sendNotification() function",
        "Function accepts userId and message",
        "Tests pass",
        "Typecheck passes"
      ],
      "priority": 2,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-003",
      "title": "Add notification bell icon to header",
      "description": "As a user, I want to see notifications in the header.",
      "acceptanceCriteria": [
        "Bell icon shows in top right",
        "Badge shows unread count",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 3,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-004",
      "title": "Create notification dropdown panel",
      "description": "As a user, I want to see my notifications in a dropdown.",
      "acceptanceCriteria": [
        "Clicking bell shows dropdown",
        "Shows last 10 notifications",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 4,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-005",
      "title": "Add mark-as-read functionality",
      "description": "As a user, I want to mark notifications as read.",
      "acceptanceCriteria": [
        "Clicking notification marks as read",
        "Unread count updates immediately",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 5,
      "passes": false,
      "notes": ""
    },
    {
      "id": "US-006",
      "title": "Add notification preferences page",
      "description": "As a user, I want to control which notifications I receive.",
      "acceptanceCriteria": [
        "Settings page with notification toggles",
        "Preferences persist in database",
        "Typecheck passes",
        "Verify in browser using dev-browser skill"
      ],
      "priority": 6,
      "passes": false,
      "notes": ""
    }
  ]
}
```

## Branch Naming

Branch names should:
- Start with `ralph/` prefix
- Use kebab-case
- Describe the feature
- Be short but descriptive

### Examples
- `ralph/task-status`
- `ralph/user-authentication`
- `ralph/export-csv`
- `ralph/dashboard-charts`

## Checklist Before Saving

Before saving `prd.json`, verify:

- [ ] Each story is completable in one iteration (small enough)
- [ ] Stories are ordered by dependency (schema → backend → UI)
- [ ] Every story has "Typecheck passes" as criterion
- [ ] UI stories have "Verify in browser using dev-browser skill"
- [ ] Acceptance criteria are verifiable (not vague)
- [ ] No story depends on a later story
- [ ] IDs are sequential (US-001, US-002, etc.)
- [ ] Priorities are sequential starting from 1
- [ ] All stories have `passes: false`
- [ ] All notes fields are empty strings
- [ ] Branch name follows `ralph/feature-name` format

## Common Mistakes

### ❌ Stories are too big
**Problem**: "Build entire user dashboard"
**Solution**: Split into: schema, queries, components, layout

### ❌ Wrong order
**Problem**: UI component before database schema
**Solution**: Reorder with schema first

### ❌ Vague acceptance criteria
**Problem**: "Works well"
**Solution**: "Dropdown shows 5 options sorted alphabetically"

### ❌ Missing typecheck
**Problem**: No automated validation
**Solution**: Always add "Typecheck passes"

## Next Steps

After creating `prd.json`:

1. Place it in your project root
2. Run `/ralph-status` to verify
3. Run `/ralph 10` to start Ralph
4. Monitor with `cat progress.txt`

## Related Documentation

- [Story Sizing Guidelines](STORY_SIZING.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Main README](../README.md)
