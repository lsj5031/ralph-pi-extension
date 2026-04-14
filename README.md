# 🤖 Ralph: The Autonomous PRD Agent for Pi

> **Stop babysitting your AI.** Ralph is an autonomous development agent for the [pi code agent](https://github.com/badlogic/pi-mono) framework that systematically builds complex features by following a PRD, one tiny step at a time.

[![Release](https://img.shields.io/github/v/release/lsj5031/ralph-pi-extension)](https://github.com/lsj5031/ralph-pi-extension/releases/latest)
[![License](https://img.shields.io/github/license/lsj5031/ralph-pi-extension)](LICENSE)
[![Ralph](https://img.shields.io/badge/Ralph-Autonomous%20Agent-blue)](https://github.com/lsj5031/ralph-pi-extension)
[![Pi](https://img.shields.io/badge/Pi-Code%20Agent-green)](https://github.com/badlogic/pi-mono)

---

## 🚀 Why Ralph?

Most AI agents struggle with "context drift" and "hallucination" during long coding sessions. Ralph solves this by applying a simple but powerful pattern:

1.  **Divide & Conquer**: It breaks your big requirements (PRD) into small, manageable "User Stories".
2.  **Zero Context Pollution**: For every story, Ralph spawns a **fresh, clean AI instance**. No leftover errors or irrelevant history to confuse the model.
3.  **Quality First**: It won't move on until the code passes **typecheck, lint, and tests**.
4.  **Persistent Memory**: It tracks its own learnings in a `progress.txt` file so the next fresh instance knows what was discovered in the last one.

---

## 📦 One-Command Installation

The easiest way to get Ralph is using the built-in `pi install` command.

```bash
# In your project directory:
pi install https://github.com/lsj5031/ralph-pi-extension
```

That's it! This command will:
*   ✅ Install the `/ralph` extension.
*   ✅ Automatically load the `ralph-prd` skill for PRD conversion.
*   ✅ Set up all necessary tools for autonomous execution.

---

## 🛠️ How to Use It (The 3-Step Flow)

### 1. Create your `prd.json`
You can convert any Markdown PRD to the Ralph format using the built-in skill:
```text
/skill ralph-prd: Convert my-feature.md to prd.json
```

### 2. Start the Autonomous Loop
Run Ralph and tell it how many iterations (stories) it should try to complete:
```bash
/ralph 20
```
Ralph will now take the wheel, creating a branch, implementing stories, running tests, and committing code until it's done or out of iterations.

Ralph requires a clean git worktree before it starts so each story commit only contains that story's changes. If a child iteration stalls or fails mid-story, Ralph now automatically rolls back unfinished uncommitted changes before stopping so the next `/ralph-continue` is not blocked by leftover partial edits.

### 3. Check Status & Progress
Want to see where it is?
```bash
/ralph-status
```
Want to read what it learned?
```bash
cat progress.txt
```

---

## 📖 Key Commands

| Command | Description |
| :--- | :--- |
| `/ralph [max]` | Starts the autonomous implementation loop (default: 20). |
| `/ralph-status` | Shows which stories are complete and which are pending. |
| `/ralph-continue [max]` | Picks up where it left off if it hit the iteration limit (default: 20). |

---

## 💡 The Golden Rule of Ralph

**Small stories are successful stories.** 

Each story in your `prd.json` should be something that can be finished in **one single turn**. If a story is too big (e.g., "Implement the entire backend"), the AI will get lost. Break it down!

*   ✅ **Good**: "Add `priority` field to the Task database model."
*   ❌ **Bad**: "Build a full task management system with priority and labels."

---

## 🙏 Credits & Inspiration

This project is built by the community and is deeply inspired by the work of others:

*   **[snarktank/ralph](https://github.com/snarktank/ralph)**: The original implementation of the Ralph pattern.
*   **[Geoffrey Huntley](https://ghuntley.com/ralph/)**: For the methodology and original concept.
*   **[pi code agent](https://github.com/badlogic/pi-mono)**: The incredible framework that makes this possible.

---

## 🤝 Contributing

We love PRs! If you have ideas for improving the autonomous loop or adding new quality gates, feel free to open an issue or submit a pull request.

Made with ❤️ for the autonomous future.
