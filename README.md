# Ralph - Autonomous AI Agent for Pi

Autonomous AI agent loop that works through PRDs iteratively until complete. Each iteration spawns a fresh pi agent instance with clean context, implementing the Ralph pattern for systematic feature development.

![Ralph](https://img.shields.io/badge/Ralph-Autonomous%20Agent-blue)
![Pi](https://img.shields.io/badge/Pi-Code%20Agent-green)

## 🎯 What is Ralph?

Ralph is an autonomous development agent that:
- **Breaks down PRDs** into small, completable user stories
- **Works iteratively** through stories, one at a time
- **Spawns fresh instances** for each iteration (no context pollution)
- **Validates quality** with typecheck, lint, and tests
- **Commits progress** after each completed story
- **Tracks learnings** in a progress log for future iterations

## ✨ Features

- **Autonomous Loop**: Automatically works through PRD stories until complete
- **Fresh Instances**: Each iteration spawns a new pi process with clean context
- **Persistent Memory**: Progress tracked via git commits, prd.json, and progress.txt
- **Quality Gates**: Typecheck, lint, and tests must pass before marking stories complete
- **Git Integration**: Automatic commits after each completed story
- **PRD Converter**: Built-in skill to convert markdown PRDs to Ralph format

## 📦 Installation

### Prerequisites

- [pi code agent](https://github.com/badlogic/pi-mono) installed
- Node.js 18+ and npm
- Git initialized in your project

### Install the Extension

1. **Clone this repository:**
```bash
git clone https://github.com/your-username/ralph-pi-extension.git
cd ralph-pi-extension
```

2. **Copy the extension to pi's extensions directory:**
```bash
mkdir -p ~/.pi/agent/extensions
cp ralph.ts ~/.pi/agent/extensions/
```

3. **Install the ralph-prd skill:**
```bash
mkdir -p ~/.config/agents/skills/ralph-prd
cp skills/ralph-prd/SKILL.md ~/.config/agents/skills/ralph-prd/
```

That's it! The extension is auto-discovered by pi and will be available immediately.

## 🚀 Quick Start

### 1. Create a PRD in Ralph Format

Use the ralph-prd skill to convert your PRD:

```
Load the ralph-prd skill and convert [your PRD] to prd.json
```

Or manually create `prd.json` in your project root:

```json
{
  "project": "MyApp",
  "branchName": "ralph/task-priority",
  "description": "Task Priority System - Add priority levels to tasks",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add priority field to database",
      "description": "As a developer, I need to store task priority so it persists.",
      "acceptanceCriteria": [
        "Add priority column: 'high' | 'medium' | 'low' (default 'medium')",
        "Generate and run migration successfully",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

### 2. Run Ralph

```bash
/ralph 10
```

This starts Ralph with max 10 iterations. Ralph will:
1. Create/check out the branch from `branchName`
2. Work through stories in priority order (where `passes: false`)
3. Spawn fresh pi instances for each iteration
4. Run quality checks (typecheck, lint, tests)
5. Commit after each completed story
6. Update `prd.json` and `progress.txt`

### 3. Monitor Progress

```bash
/ralph-status
```

Shows which stories are complete and pending.

### 4. Continue If Needed

```bash
/ralph-continue 10
```

Continue from where Ralph left off.

## 📚 Documentation

- [Full Documentation](docs/README.md)
- [PRD Format Guide](docs/PRD_FORMAT.md)
- [Story Sizing Guidelines](docs/STORY_SIZING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 🛠️ Commands

### `/ralph [max_iterations]`

Start the Ralph autonomous loop.

```bash
/ralph 20
```

- `max_iterations`: Maximum iterations (default: 10)
- Creates branch from `prd.json` → `branchName`
- Spawns fresh pi instance for each iteration
- Stops when all stories complete or max iterations reached

### `/ralph-status`

Show current PRD status.

**Example output:**
```
PRD: MyApp
Status: 3/5 stories complete (2 pending)

✓ US-001 [P1] Add priority field to database
✓ US-002 [P2] Display priority indicator
✓ US-003 [P3] Add priority selector
○ US-004 [P4] Filter tasks by priority
○ US-005 [P5] Add priority notifications
```

### `/ralph-continue [max_iterations]`

Continue Ralph from where it left off.

## 🔧 API Tools

The extension provides tools that pi agents can use:

### `ralph_next_story`
Get the next pending user story (highest priority where `passes: false`).

### `ralph_complete_story`
Mark a story as complete and update prd.json.
- Parameters: `storyId`, `learnings`
- Marks story as `passes: true`
- Appends learnings to progress.txt
- Commits changes

### `ralph_progress`
View progress log from previous iterations.

### `ralph_quality_check`
Run quality checks before marking a story complete.
- Parameters: `commands` (optional)
- Defaults: typecheck, lint, tests

### `ralph_run_autonomous`
Run the autonomous Ralph loop (used internally).

## 📖 Example Workflow

```bash
# 1. Create PRD in Ralph format
Load ralph-prd skill and convert my-feature-prd.md to prd.json

# 2. Check status
/ralph-status

# 3. Run Ralph (10 iterations max)
/ralph 10

# 4. Monitor progress
cat progress.txt

# 5. If needed, continue
/ralph-continue 10
```

## 🎓 Key Concepts

### Story Size: The Number One Rule

**Each story must be completable in ONE iteration (one context window).**

✅ **Right-sized stories:**
- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic
- Add a filter dropdown to a list

❌ **Too big (split these):**
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

**Rule of thumb**: If you cannot describe the change in 2-3 sentences, it is too big.

### Story Ordering: Dependencies First

Stories execute in priority order. Earlier stories must not depend on later ones.

**Correct order:**
1. Schema/database changes (migrations)
2. Server actions / backend logic
3. UI components that use the backend
4. Dashboard/summary views that aggregate data

### Memory Between Iterations

Each iteration is a fresh pi instance with no memory. Memory persists via:

1. **Git History** - Commits from previous iterations
2. **prd.json** - Which stories have `passes: true`
3. **progress.txt** - Learnings and discovered patterns

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

- Original Ralph pattern: [snarktank/ralph](https://github.com/snarktank/ralph)
- Based on Geoffrey Huntley's [Ralph article](https://ghuntley.com/ralph/)
- Converted for pi code agent

## 📮 Support

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/ralph-pi-extension/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-username/ralph-pi-extension/discussions)

---

Made with ❤️ by the pi community
