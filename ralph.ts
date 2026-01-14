/**
 * Ralph - Autonomous AI Agent Loop Extension for Pi
 *
 * Converts the Ralph pattern (from snarktank/ralph) to work with Pi.
 * Ralph runs repeatedly until all PRD items are complete, with each iteration
 * spawning a fresh agent instance with clean context.
 *
 * Memory persists via:
 * - Git history (commits from previous iterations)
 * - prd.json (which stories are done)
 * - Session entries (learnings and progress)
 *
 * Based on: https://github.com/snarktank/ralph
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes: string;
}

interface PRD {
  project: string;
  branchName: string;
  description: string;
  userStories: UserStory[];
}

interface RalphState {
  isRunning: boolean;
  currentIteration: number;
  maxIterations: number;
  prdPath: string;
  prd: PRD | null;
  startBranch: string;
}

const STATE_KEY = "ralph-state";
const PROGRESS_FILE = "progress.txt";

export default function (pi: ExtensionAPI) {
  let state: RalphState = {
    isRunning: false,
    currentIteration: 0,
    maxIterations: 10,
    prdPath: "",
    prd: null,
    startBranch: "",
  };

  // Restore state from session
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === STATE_KEY) {
        const savedState = entry.data as RalphState;
        if (savedState.isRunning) {
          state = { ...savedState, isRunning: false }; // Reset running state on reload
        }
      }
    }
  });

  // Register the ralph command
  pi.registerCommand("ralph", {
    description: "Start the Ralph autonomous agent loop (spawns fresh pi instances for each story)",
    handler: async (args, ctx) => {
      const maxIterations = parseInt(args) || 10;
      const prdPath = join(ctx.cwd, "prd.json");

      if (!existsSync(prdPath)) {
        ctx.ui.notify("No prd.json found in current directory", "error");
        ctx.ui.notify(
          "Create one by loading the ralph-prd skill and converting your PRD",
          "info"
        );
        return;
      }

      // Check git status
      try {
        const status = execSync("git status --porcelain", { cwd: ctx.cwd, encoding: "utf8" });
        if (status.trim()) {
          const ok = await ctx.ui.confirm(
            "Uncommitted Changes",
            "You have uncommitted changes. Ralph will commit after each story. Continue anyway?"
          );
          if (!ok) return;
        }
      } catch (error) {
        ctx.ui.notify("Not in a git repository", "error");
        return;
      }

      // Save initial state
      const initialBranch = execSync("git branch --show-current", {
        cwd: ctx.cwd,
        encoding: "utf8",
      }).trim();

      state = {
        isRunning: true,
        currentIteration: 0,
        maxIterations,
        prdPath,
        prd: loadPRD(prdPath),
        startBranch: initialBranch,
      };

      pi.appendEntry(STATE_KEY, state);

      ctx.ui.notify("Starting Ralph autonomous loop...", "info");

      // Send message to trigger the ralph_run_autonomous tool
      pi.sendUserMessage(
        `Run Ralph with max ${maxIterations} iterations. Use the ralph_run_autonomous tool to start.`
      );
    },
  });

  // Register ralph-status command
  pi.registerCommand("ralph-status", {
    description: "Show Ralph PRD status",
    handler: async (_args, ctx) => {
      const prdPath = join(ctx.cwd, "prd.json");
      if (!existsSync(prdPath)) {
        ctx.ui.notify("No prd.json found", "error");
        return;
      }

      const prd = loadPRD(prdPath);
      if (!prd) {
        ctx.ui.notify("Failed to load prd.json", "error");
        return;
      }

      const total = prd.userStories.length;
      const completed = prd.userStories.filter((s) => s.passes).length;
      const pending = total - completed;

      let message = `PRD: ${prd.project}\n`;
      message += `Status: ${completed}/${total} stories complete (${pending} pending)\n\n`;

      for (const story of prd.userStories) {
        const status = story.passes ? "✓" : "○";
        const priority = `[P${story.priority}]`;
        message += `${status} ${story.id} ${priority} ${story.title}\n`;
      }

      ctx.ui.notify(message, "info");
    },
  });

  // Register ralph-continue command
  pi.registerCommand("ralph-continue", {
    description: "Continue Ralph loop from where it left off",
    handler: async (args, ctx) => {
      const maxIterations = parseInt(args) || 10;
      const prdPath = join(ctx.cwd, "prd.json");

      if (!existsSync(prdPath)) {
        ctx.ui.notify("No prd.json found", "error");
        return;
      }

      const prd = loadPRD(prdPath);
      if (!prd) {
        ctx.ui.notify("Failed to load prd.json", "error");
        return;
      }

      const pending = prd.userStories.filter((s) => !s.passes);
      if (pending.length === 0) {
        ctx.ui.notify("All stories are complete!", "success");
        return;
      }

      ctx.ui.notify(
        `Continuing Ralph: ${prd.userStories.filter((s) => s.passes).length}/${prd.userStories.length} stories done`,
        "info"
      );

      // Send message to trigger the ralph_run_autonomous tool
      pi.sendUserMessage(
        `Continue Ralph with max ${maxIterations} iterations. Use the ralph_run_autonomous tool.`
      );
    },
  });

  // Register tools for the agent to use during iterations
  pi.registerTool({
    name: "ralph_next_story",
    label: "Next Story",
    description: "Get the next pending user story from the PRD (highest priority where passes=false)",
    parameters: Type.Object({}),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const prdPath = join(ctx.cwd, "prd.json");
      const prd = loadPRD(prdPath);

      if (!prd) {
        return {
          content: [{ type: "text", text: "Failed to load prd.json" }],
          details: { error: "PRD not found" },
        };
      }

      // Find highest priority story where passes=false
      const pendingStories = prd.userStories
        .filter((s) => !s.passes)
        .sort((a, b) => a.priority - b.priority);

      if (pendingStories.length === 0) {
        return {
          content: [{ type: "text", text: "All stories are complete!" }],
          details: { complete: true },
        };
      }

      const story = pendingStories[0];

      let text = `Next Story: ${story.id} - ${story.title}\n\n`;
      text += `Description: ${story.description}\n\n`;
      text += `Acceptance Criteria:\n`;
      for (const criterion of story.acceptanceCriteria) {
        text += `  - ${criterion}\n`;
      }

      return {
        content: [{ type: "text", text }],
        details: { story },
      };
    },
  });

  // Register the autonomous Ralph tool - this spawns fresh pi agent instances for each iteration
  pi.registerTool({
    name: "ralph_run_autonomous",
    label: "Run Ralph",
    description: "Run Ralph autonomous loop - spawns fresh pi agent instances for each story until complete or max iterations reached",
    parameters: Type.Object({
      maxIterations: Type.Optional(
        Type.Number({ description: "Maximum number of iterations (default: 10)" })
      ),
    }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const maxIterations = params.maxIterations || 10;
      const prdPath = join(ctx.cwd, "prd.json");

      if (!existsSync(prdPath)) {
        return {
          content: [
            {
              type: "text",
              text: "No prd.json found. Create one using the ralph-prd skill to convert your PRD.",
            },
          ],
          details: { error: "PRD not found" },
        };
      }

      const prd = loadPRD(prdPath);
      if (!prd) {
        return {
          content: [{ type: "text", text: "Failed to load prd.json" }],
          details: { error: "Failed to load PRD" },
        };
      }

      // Check if on correct branch
      const currentBranch = execSync("git branch --show-current", {
        cwd: ctx.cwd,
        encoding: "utf8",
      }).trim();

      if (currentBranch !== prd.branchName) {
        onUpdate?.({
          content: [{ type: "text", text: `Creating branch: ${prd.branchName}...` }],
        });
        try {
          execSync(`git checkout -b ${prd.branchName}`, { cwd: ctx.cwd });
        } catch (error) {
          execSync(`git checkout ${prd.branchName}`, { cwd: ctx.cwd });
        }
      }

      onUpdate?.({
        content: [
          {
            type: "text",
            text: `🚀 Starting Ralph: ${prd.project}\nMax iterations: ${maxIterations}\nBranch: ${prd.branchName}`,
          },
        ],
      });

      // Run autonomous iterations using fresh pi instances
      let completedIterations = 0;
      let allComplete = false;

      for (let i = 0; i < maxIterations; i++) {
        if (signal?.aborted) {
          onUpdate?.({
            content: [{ type: "text", text: `Ralph stopped after ${i} iterations (cancelled)` }],
          });
          break;
        }

        onUpdate?.({
          content: [{ type: "text", text: `\n--- Iteration ${i + 1}/${maxIterations} ---` }],
        });

        // Check if all stories are complete
        const currentPRD = loadPRD(prdPath);
        if (currentPRD && currentPRD.userStories.every((s) => s.passes)) {
          allComplete = true;
          onUpdate?.({
            content: [{ type: "text", text: `\n🎉 ALL STORIES COMPLETE!` }],
          });
          break;
        }

        // For each iteration, spawn a FRESH pi instance in print mode
        // This is the key Ralph pattern - each iteration is a clean slate
        // Only files (git, prd.json, progress.txt) provide memory between iterations
        const storyPrompt = `You are Ralph, an autonomous coding agent. This is iteration ${i + 1} of ${maxIterations}.

## CRITICAL: This is a FRESH instance
You have NO context from previous iterations. Your ONLY memory is:
- Git commits (history of completed work)
- progress.txt (learnings and patterns discovered)
- prd.json (which stories are done)

## Your Job:
Implement ONE user story from the PRD.

## Step-by-step:
1. Read progress.txt FIRST - check the "Codebase Patterns" section at the top
2. Use ralph_next_story tool to get the next pending story
3. Implement that single story
4. Use ralph_quality_check tool to run tests/typecheck
5. If checks pass, use ralph_complete_story to mark it done with your learnings
6. If checks fail, fix issues and re-run quality check until it passes

## Rules:
- Work on ONE story only
- ALL quality checks must pass before using ralph_complete_story
- Add learnings to progress.txt via ralph_complete_story
- Commit is automatic when you complete the story

Begin now by reading progress.txt, then using ralph_next_story.`;

        try {
          // Spawn a fresh pi instance in print mode for each iteration
          // This matches Ralph's approach of spawning fresh Amp instances
          // Each instance is completely independent - only files provide continuity
          const piCmd = `pi -p "${storyPrompt.replace(/"/g, '\\"')}"`;

          onUpdate?.({
            content: [
              {
                type: "text",
                text: `Spawning fresh pi instance for iteration ${i + 1}...`,
              },
            ],
          });

          const piResult = await pi.exec("pi", ["-p", storyPrompt], {
            cwd: ctx.cwd,
            signal,
            timeout: 300000, // 5 minutes max per iteration
          });

          completedIterations++;

          // Check output for completion signal
          const output = piResult.stdout + piResult.stderr;
          const hadError = piResult.code !== 0;

          // Check if the iteration completed a story
          const updatedPRD = loadPRD(prdPath);
          const completedCount = updatedPRD?.userStories.filter((s) => s.passes).length || 0;

          const statusText = hadError
            ? `Iteration ${i + 1} had errors. Progress: ${completedCount}/${updatedPRD?.userStories.length}`
            : `Iteration ${i + 1} complete. Progress: ${completedCount}/${updatedPRD?.userStories.length} stories done.`;

          onUpdate?.({
            content: [{ type: "text", text: statusText }],
          });

          if (hadError && piResult.stderr) {
            onUpdate?.({
              content: [{ type: "text", text: `Error output:\n${piResult.stderr.substring(0, 500)}` }],
            });
          }

          // Check for completion signal in output
          if (output.includes("<RALPH_COMPLETE>") || output.includes("ALL STORIES COMPLETE")) {
            allComplete = true;
            onUpdate?.({
              content: [{ type: "text", text: `\n🎉 All stories complete!` }],
            });
            break;
          }

          // Small delay between iterations
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          onUpdate?.({
            content: [{ type: "text", text: `Iteration ${i + 1} error: ${error.message}` }],
          });
        }
      }

      // Final status
      const finalPRD = loadPRD(prdPath);
      const finalCompleted = finalPRD?.userStories.filter((s) => s.passes).length || 0;
      const finalTotal = finalPRD?.userStories.length || 0;

      let resultText = `\n${"=".repeat(50)}\n`;
      resultText += `Ralph finished: ${finalCompleted}/${finalTotal} stories complete\n`;
      resultText += `Iterations completed: ${completedIterations}/${maxIterations}\n`;
      if (allComplete) {
        resultText += `Status: 🎉 ALL STORIES COMPLETE!\n`;
      } else {
        resultText += `Status: Max iterations reached. Use /ralph-continue to keep going.\n`;
      }
      resultText += `${"=".repeat(50)}`;

      return {
        content: [{ type: "text", text: resultText }],
        details: {
          iterations: completedIterations,
          completed: finalCompleted,
          total: finalTotal,
          allComplete,
        },
      };
    },
  });

  pi.registerTool({
    name: "ralph_complete_story",
    label: "Complete Story",
    description: "Mark a user story as complete and update prd.json",
    parameters: Type.Object({
      storyId: Type.String({ description: "Story ID to mark complete (e.g., US-001)" }),
      learnings: Type.String({
        description:
          "Learnings from this iteration (patterns discovered, gotchas, useful context)",
      }),
    }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const prdPath = join(ctx.cwd, "prd.json");
      let prd = loadPRD(prdPath);

      if (!prd) {
        return {
          content: [{ type: "text", text: "Failed to load prd.json" }],
          details: { error: "PRD not found" },
        };
      }

      // Find and update the story
      const story = prd.userStories.find((s) => s.id === params.storyId);
      if (!story) {
        return {
          content: [{ type: "text", text: `Story ${params.storyId} not found` }],
          details: { error: "Story not found" },
        };
      }

      story.passes = true;
      story.notes = params.learnings;

      // Save updated PRD
      savePRD(prdPath, prd);

      // Append to progress.txt
      const progressPath = join(ctx.cwd, PROGRESS_FILE);
      if (!existsSync(progressPath)) {
        ensureDirectoryExistence(progressPath);
        writeFileSync(progressPath, `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n`);
      }

      const timestamp = new Date().toISOString();
      const progressEntry = `\n## ${timestamp} - ${story.id}\n${params.learnings}\n---\n`;
      appendFileSync(progressPath, progressEntry);

      // Commit changes
      try {
        execSync(`git add prd.json ${PROGRESS_FILE}`, { cwd: ctx.cwd });
        execSync(`git commit -m "feat: ${story.id} - ${story.title}"`, { cwd: ctx.cwd });
      } catch (error) {
        // Might be nothing to commit if no changes
      }

      // Check if all stories are complete
      const allComplete = prd.userStories.every((s) => s.passes);

      let message = `✓ Marked ${story.id} as complete\n`;
      message += `Committed: feat: ${story.id} - ${story.title}\n`;
      message += `Progress saved to ${PROGRESS_FILE}\n`;
      if (allComplete) {
        message += `\n🎉 ALL STORIES COMPLETE!`;
      }

      return {
        content: [{ type: "text", text: message }],
        details: { story, allComplete },
      };
    },
  });

  pi.registerTool({
    name: "ralph_progress",
    label: "View Progress",
    description: "View the progress log from previous iterations",
    parameters: Type.Object({}),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const progressPath = join(ctx.cwd, PROGRESS_FILE);

      if (!existsSync(progressPath)) {
        return {
          content: [{ type: "text", text: "No progress log found" }],
          details: {},
        };
      }

      const content = readFileSync(progressPath, "utf-8");

      return {
        content: [{ type: "text", text: content }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "ralph_quality_check",
    label: "Quality Check",
    description: "Run quality checks (typecheck, lint, tests) before marking a story complete",
    parameters: Type.Object({
      commands: Type.Array(Type.String(), {
        description:
          "Commands to run (e.g., ['npm run typecheck', 'npm test']). Defaults to common checks.",
      }),
    }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      const commands = params.commands.length > 0 ? params.commands : getDefaultQualityChecks();

      let results = [];
      let allPassed = true;

      for (const cmd of commands) {
        try {
          onUpdate?.({
            content: [{ type: "text", text: `Running: ${cmd}...` }],
          });

          const output = execSync(cmd, { cwd: ctx.cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
          results.push(`✓ ${cmd}\n${output.substring(0, 500)}`);
        } catch (error: any) {
          allPassed = false;
          results.push(`✗ ${cmd}\n${error.message || error.toString()}`);
        }
      }

      const summary = allPassed ? "All quality checks passed!" : "Some quality checks failed!";
      const fullOutput = results.join("\n\n");

      return {
        content: [{ type: "text", text: `${summary}\n\n${fullOutput}` }],
        details: { allPassed, results },
      };
    },
  });

}

// Helper functions

function loadPRD(path: string): PRD | null {
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as PRD;
  } catch (error) {
    return null;
  }
}

function savePRD(path: string, prd: PRD): void {
  ensureDirectoryExistence(path);
  writeFileSync(path, JSON.stringify(prd, null, 2), "utf-8");
}

function ensureDirectoryExistence(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getDefaultQualityChecks(): string[] {
  // Common quality check commands
  return [
    "npm run typecheck 2>/dev/null || tsc --noEmit 2>/dev/null || true",
    "npm run lint 2>/dev/null || true",
    "npm test 2>/dev/null || true",
  ].filter((cmd) => {
    try {
      execSync(cmd.split(" ")[0] + " --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
}
