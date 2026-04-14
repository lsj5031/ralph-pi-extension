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

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";

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
const DEFAULT_MAX_ITERATIONS = 20;

type RalphNoticeLevel = "info" | "warning" | "error";

interface RalphReporter {
  report: (message: string, level?: RalphNoticeLevel) => void;
  stream?: (source: "pi" | "pi-err", chunk: string) => void;
}

interface RalphProgressSink {
  push: (message: string) => void;
}

interface RalphRunOptions {
  maxIterations: number;
  provider?: string;
  model?: string;
}

interface RalphRunResult {
  status: "complete" | "max-iterations" | "failed" | "stalled" | "cancelled";
  summary: string;
  details: {
    iterations: number;
    completed: number;
    total: number;
    allComplete: boolean;
  };
}

interface ChildPiResult {
  code: number | null;
  stdout: string;
  stderr: string;
  sawMeaningfulProgress: boolean;
  rawEventTail: string[];
  terminationReason: "meaningful-stall" | "aborted" | null;
  diagnosticsDir: string;
  elapsedMs: number;
  toolCounts: Record<string, number>;
  toolSequence: string[];
}

export default function (pi: ExtensionAPI) {
  let state: RalphState = {
    isRunning: false,
    currentIteration: 0,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    prdPath: "",
    prd: null,
    startBranch: "",
  };

  const extensionPath = __filename;

  function resetChildExecutionGuard() {
    // no-op; reserved for future child-specific coordination
  }

  function persistState() {
    pi.appendEntry(STATE_KEY, state);
  }

  function updateState(next: Partial<RalphState>) {
    state = { ...state, ...next };
    persistState();
  }

  async function runFromCommand(args: string, ctx: any, action: "start" | "continue") {
    const maxIterations = parseMaxIterations(args);
    const prdPath = join(ctx.cwd, "prd.json");

    if (!existsSync(prdPath)) {
      ctx.ui.notify("No prd.json found in current directory", "error");
      if (action === "start") {
        ctx.ui.notify(
          "Create one by loading the ralph-prd skill and converting your PRD",
          "info"
        );
      }
      return;
    }

    let prd = loadPRD(prdPath);
    if (!prd) {
      ctx.ui.notify("Failed to load prd.json", "error");
      return;
    }

    if (action === "continue") {
      const pending = prd.userStories.filter((story) => !story.passes);
      if (pending.length === 0) {
        ctx.ui.notify("All stories are complete!", "info");
        return;
      }
    }

    // Ensure .ralph/ is excluded from git before checking worktree status,
    // otherwise leftover diagnostics from a previous run will block startup.
    ensureRalphGitExclude(ctx.cwd);

    let initialBranch = "";
    try {
      const dirtyFiles = getGitStatusLines(ctx.cwd);
      if (dirtyFiles.length > 0) {
        ctx.ui.notify(formatDirtyWorktreeMessage(dirtyFiles), "error");
        return;
      }

      initialBranch = execSync("git branch --show-current", {
        cwd: ctx.cwd,
        encoding: "utf8",
      }).trim();
    } catch (error) {
      ctx.ui.notify("Not in a git repository", "error");
      return;
    }

    updateState({
      isRunning: true,
      currentIteration: 0,
      maxIterations,
      prdPath,
      prd,
      startBranch: initialBranch,
    });

    const progressSink = createProgressSink(ctx);
    let lastStreamNotice = "";
    let lastStreamNoticeAt = 0;

    const maybeNotifyStreamProgress = (line: string) => {
      const isImportant =
        line === "Child pi started" ||
        line === "Child pi turn started" ||
        line === "Model is thinking" ||
        line === "Model finished planning" ||
        line.startsWith("Preparing tool call:") ||
        line.startsWith("Prepared tool call:") ||
        line.startsWith("Running tool:") ||
        line.startsWith("Finished tool:") ||
        line.startsWith("Assistant:") ||
        line.startsWith("Child pi still working...");

      if (!isImportant) return;

      const minIntervalMs = line.startsWith("Child pi still working...") ? 30000 : 5000;
      const now = Date.now();
      if (line === lastStreamNotice && now - lastStreamNoticeAt < minIntervalMs) return;

      lastStreamNotice = line;
      lastStreamNoticeAt = now;
      ctx.ui.notify(line.slice(0, 240), "info");
    };

    const reporter: RalphReporter = {
      report(message, level = "info") {
        const singleLine = toSingleLine(message);
        ctx.ui.setStatus("ralph", singleLine);
        ctx.ui.setWorkingMessage(`Ralph: ${singleLine}`);
        progressSink.push(message);
        if (level !== "info" || shouldNotifyCommand(message)) {
          ctx.ui.notify(singleLine, level);
        }
      },
      stream(_source, chunk) {
        const singleLine = toSingleLine(chunk);
        if (singleLine.length > 0) {
          ctx.ui.setStatus("ralph", singleLine);
          ctx.ui.setWorkingMessage(`Ralph: ${singleLine.slice(0, 180)}`);
          progressSink.push(singleLine);
          maybeNotifyStreamProgress(singleLine);
        }
      },
    };

    progressSink.push(`Ralph running: ${prd.project}`);
    ctx.ui.setWorkingMessage(`Ralph running: ${prd.project}`);
    const result = await runAutonomousLoop({ maxIterations }, ctx, reporter);
    ctx.ui.setWorkingMessage();
    ctx.ui.setStatus("ralph", undefined);

    const notifyLevel: RalphNoticeLevel =
      result.status === "complete"
        ? "info"
        : result.status === "max-iterations"
          ? "warning"
          : result.status === "cancelled"
            ? "warning"
            : "error";

    ctx.ui.notify(toSingleLine(result.summary), notifyLevel);
  }

  async function runAutonomousLoop(
    options: RalphRunOptions,
    ctx: any,
    reporter: RalphReporter
  ): Promise<RalphRunResult> {
    const maxIterations = options.maxIterations || DEFAULT_MAX_ITERATIONS;
    const provider = options.provider;
    const model = options.model;
    const prdPath = join(ctx.cwd, "prd.json");

    if (!existsSync(prdPath)) {
      return {
        status: "failed",
        summary: "No prd.json found. Create one using the ralph-prd skill to convert your PRD.",
        details: { iterations: 0, completed: 0, total: 0, allComplete: false },
      };
    }

    const prd = loadPRD(prdPath);
    if (!prd) {
      return {
        status: "failed",
        summary: "Failed to load prd.json",
        details: { iterations: 0, completed: 0, total: 0, allComplete: false },
      };
    }

    // Ensure .ralph/ is excluded from git so diagnostics don't pollute
    // the worktree status. Uses .git/info/exclude (local, not .gitignore).
    // Must happen before the dirty-files check below.
    ensureRalphGitExclude(ctx.cwd);

    let dirtyFiles: string[] = [];
    let currentBranch = "";

    try {
      dirtyFiles = getGitStatusLines(ctx.cwd);
      currentBranch = execSync("git branch --show-current", {
        cwd: ctx.cwd,
        encoding: "utf8",
      }).trim();
    } catch (_error) {
      return {
        status: "failed",
        summary: "Not in a git repository",
        details: {
          iterations: 0,
          completed: prd.userStories.filter((story) => story.passes).length,
          total: prd.userStories.length,
          allComplete: false,
        },
      };
    }

    if (dirtyFiles.length > 0) {
      return {
        status: "failed",
        summary: formatDirtyWorktreeMessage(dirtyFiles),
        details: {
          iterations: 0,
          completed: prd.userStories.filter((story) => story.passes).length,
          total: prd.userStories.length,
          allComplete: false,
        },
      };
    }

    if (currentBranch !== prd.branchName) {
      reporter.report(`Creating branch: ${prd.branchName}...`);
      try {
        execSync(`git checkout -b ${prd.branchName}`, { cwd: ctx.cwd });
      } catch (_error) {
        execSync(`git checkout ${prd.branchName}`, { cwd: ctx.cwd });
      }
    }

    let startMessage = `Starting Ralph: ${prd.project}\nMax iterations: ${maxIterations}\nBranch: ${prd.branchName}`;
    if (provider) startMessage += `\nProvider: ${provider}`;
    if (model) startMessage += `\nModel: ${model}`;
    reporter.report(startMessage);

    let completedIterations = 0;
    let allComplete = false;
    let status: RalphRunResult["status"] = "max-iterations";
    let stopReason = `Status: Max iterations reached. Use /ralph-continue to keep going.`;

    for (let i = 0; i < maxIterations; i++) {
      if (ctx.signal?.aborted) {
        status = "cancelled";
        stopReason = `Status: Ralph stopped after ${i} iterations (cancelled).`;
        reporter.report(stopReason, "warning");
        break;
      }

      reporter.report(`Iteration ${i + 1}/${maxIterations}`);

      const beforePRD = loadPRD(prdPath);
      if (!beforePRD) {
        status = "failed";
        stopReason = "Status: Failed to reload prd.json during the run.";
        reporter.report(stopReason, "error");
        break;
      }

      const completedBefore = beforePRD.userStories.filter((story) => story.passes).length;
      if (completedBefore === beforePRD.userStories.length) {
        allComplete = true;
        status = "complete";
        stopReason = `Status: ALL STORIES COMPLETE!`;
        reporter.report(stopReason);
        break;
      }

      const storyPrompt = `You are Ralph, an autonomous coding agent. This is iteration ${i + 1} of ${maxIterations}.

## CRITICAL: This is a FRESH instance
You have NO context from previous iterations. Your ONLY memory is:
- Git commits (history of completed work)
- progress.txt (learnings and patterns discovered)
- prd.json (which stories are done)

## Your Job:
Implement ONE user story from the PRD.

## Step-by-step:
1. Use ralph_next_story tool to get the next pending story
2. Read progress.txt (use ralph_progress tool) — check for codebase patterns and gotchas
3. Read the files you need to understand the story and implement it
4. Implement the story — write actual code in actual files
5. Use ralph_quality_check tool to run tests/typecheck
6. If checks pass, use ralph_complete_story to mark it done with your learnings
7. If checks fail, fix issues and re-run quality check until it passes

## Rules:
- Work on ONE story only
- ALL quality checks must pass before using ralph_complete_story
- Add learnings to progress.txt via ralph_complete_story
- Commit is automatic when you complete the story

Begin now by using ralph_next_story, then ralph_progress, then start implementing.`;
      resetChildExecutionGuard();

      const args = [
        "-e",
        extensionPath,
        "--mode",
        "json",
        "-p",
      ];
      if (provider) args.push("--provider", provider);
      if (model) args.push("--model", model);
      args.push(storyPrompt);

      let spawnMessage = `Spawning fresh pi instance for iteration ${i + 1}...`;
      if (provider) spawnMessage += `\nProvider: ${provider}`;
      if (model) spawnMessage += `\nModel: ${model}`;
      reporter.report(spawnMessage);

      try {
        const beforeFiles = getTrackedSourceFileSnapshot(ctx.cwd);
        const childResult = await spawnChildPi(
          args,
          ctx.cwd,
          ctx.signal,
          reporter
        );
        completedIterations++;

        resetChildExecutionGuard();
        const updatedPRD = loadPRD(prdPath);
        if (!updatedPRD) {
          status = "failed";
          stopReason = "Status: Failed to reload prd.json after the iteration.";
          reporter.report(stopReason, "error");
          break;
        }

        const completedAfter = updatedPRD.userStories.filter((story) => story.passes).length;
        const progressMade = completedAfter > completedBefore;
        let worktreeAfter = getGitStatusLines(ctx.cwd);
        const afterFiles = getTrackedSourceFileSnapshot(ctx.cwd);
        const fileChangesMade = hasTrackedSourceChanges(beforeFiles, afterFiles);

        if (progressMade) {
          if (childResult.code !== 0) {
            reporter.report(
              `Iteration ${i + 1} completed a story, but the child exited with code ${childResult.code}. ` +
              `Continuing because prd.json advanced successfully.`,
              "warning"
            );
            reporter.report(
              formatChildFailure(
                childResult.stderr || childResult.stdout || "No error output captured.",
                childResult.rawEventTail,
                childResult
              ),
              "warning"
            );
          }

          if (worktreeAfter.length > 0) {
            const cleanup = rollbackDirtyWorktree(
              ctx.cwd,
              worktreeAfter,
              `iteration ${i + 1} after completing a story`
            );
            reporter.report(cleanup.message, cleanup.cleaned ? "warning" : "error");
            if (!cleanup.cleaned) {
              status = "failed";
              stopReason =
                `Status: Iteration ${i + 1} completed a story but Ralph could not restore a clean worktree.`;
              break;
            }
            worktreeAfter = getGitStatusLines(ctx.cwd);
          }

          if (updatedPRD.userStories.every((story) => story.passes)) {
            allComplete = true;
            status = "complete";
            stopReason = `Status: ALL STORIES COMPLETE!`;
            reporter.report(`Iteration ${i + 1} complete. Progress: ${completedAfter}/${updatedPRD.userStories.length}.`);
            reporter.report(stopReason);
            break;
          }

          reporter.report(
            `Iteration ${i + 1} complete. Progress: ${completedAfter}/${updatedPRD.userStories.length} stories done.`
          );
          updateState({ currentIteration: completedIterations, prd: updatedPRD });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (childResult.code !== 0) {
          status = childResult.terminationReason === "meaningful-stall" ? "stalled" : "failed";
          stopReason = childResult.terminationReason === "meaningful-stall"
            ? `Status: Iteration ${i + 1} stalled after extended exploration without implementation progress.`
            : `Status: Iteration ${i + 1} failed with exit code ${childResult.code}.`;
          reporter.report(
            `${stopReason}\n${formatChildFailure(
              childResult.stderr || childResult.stdout || "No error output captured.",
              childResult.rawEventTail,
              childResult
            )}`,
            status === "stalled" ? "warning" : "error"
          );
          if (worktreeAfter.length > 0) {
            const cleanup = rollbackDirtyWorktree(ctx.cwd, worktreeAfter, `failed iteration ${i + 1}`);
            reporter.report(cleanup.message, cleanup.cleaned ? "warning" : "error");
          }
          if (status === "stalled" && i + 1 < maxIterations) {
            reporter.report(`Retrying with a fresh child for iteration ${i + 2}/${maxIterations}.`, "warning");
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          break;
        }

        const usefulProgressMade = childResult.sawMeaningfulProgress || fileChangesMade;
        status = "stalled";
        stopReason = usefulProgressMade
          ? `Status: Iteration ${i + 1} made exploratory progress but did not complete a story before exiting.`
          : `Status: Iteration ${i + 1} made no meaningful progress before exiting.`;
        reporter.report(stopReason, "error");
        reporter.report(
          formatChildFailure(
            childResult.stdout || childResult.stderr || "No output captured.",
            childResult.rawEventTail,
            childResult
          ),
          "error"
        );
        if (!usefulProgressMade) {
          reporter.report("Hint: the child never reached a meaningful tool/edit phase; inspect the raw event tail above.", "error");
        }
        if (worktreeAfter.length > 0) {
          const cleanup = rollbackDirtyWorktree(ctx.cwd, worktreeAfter, `incomplete iteration ${i + 1}`);
          reporter.report(cleanup.message, cleanup.cleaned ? "warning" : "error");
        }
        if (i + 1 < maxIterations) {
          reporter.report(`Retrying with a fresh child for iteration ${i + 2}/${maxIterations}.`, "warning");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      } catch (error: any) {
        resetChildExecutionGuard();
        status = ctx.signal?.aborted ? "cancelled" : "failed";
        stopReason = `Status: Iteration ${i + 1} error: ${error.message}`;
        reporter.report(stopReason, status === "cancelled" ? "warning" : "error");
        break;
      }
    }

    const finalPRD = loadPRD(prdPath);
    const finalCompleted = finalPRD?.userStories.filter((story) => story.passes).length || 0;
    const finalTotal = finalPRD?.userStories.length || 0;

    updateState({
      isRunning: false,
      currentIteration: completedIterations,
      prd: finalPRD,
    });

    const summary = [
      `${"=".repeat(50)}`,
      `Ralph finished: ${finalCompleted}/${finalTotal} stories complete`,
      `Iterations completed: ${completedIterations}/${maxIterations}`,
      stopReason,
      `${"=".repeat(50)}`,
    ].join("\n");

    return {
      status,
      summary,
      details: {
        iterations: completedIterations,
        completed: finalCompleted,
        total: finalTotal,
        allComplete,
      },
    };
  }

  // Restore state from session
  pi.on("session_start", async (_event, ctx) => {
    resetChildExecutionGuard();
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
      await runFromCommand(args, ctx, "start");
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
      await runFromCommand(args, ctx, "continue");
    },
  });

  // Register tools for the agent to use during iterations
  pi.registerTool({
    name: "ralph_next_story",
    label: "Next Story",
    description: "Get the next pending user story from the PRD (highest priority where passes=false)",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
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
        Type.Number({ description: "Maximum number of iterations (default: 20)" })
      ),
      provider: Type.Optional(
        Type.String({ description: "Provider to use (e.g., anthropic)" })
      ),
      model: Type.Optional(
        Type.String({ description: "Model to use (e.g., gpt-4o)" })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await runAutonomousLoop(
        {
          maxIterations: params.maxIterations || DEFAULT_MAX_ITERATIONS,
          provider: params.provider,
          model: params.model,
        },
        { ...ctx, signal },
        {
          report(message) {
            onUpdate?.({ content: [{ type: "text", text: message }] });
          },
          stream(source, chunk) {
            onUpdate?.({ content: [{ type: "text", text: `[${source}] ${chunk}` }] });
          },
        }
      );

      return {
        content: [{ type: "text", text: result.summary }],
        details: result.details,
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
    async execute(toolCallId, params, signal, onUpdate, ctx) {
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
        execSync("git add -A", { cwd: ctx.cwd });
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
    async execute(toolCallId, params, signal, onUpdate, ctx) {
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
      commands: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Commands to run (e.g., ['npm run typecheck', 'npm test']). Defaults to detected project checks.",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const commands = params.commands && params.commands.length > 0
        ? params.commands
        : getDefaultQualityChecks(ctx.cwd);

      if (commands.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "No default quality checks were detected for this repository. " +
                "Pass explicit commands to ralph_quality_check before marking a story complete.",
            },
          ],
          details: { allPassed: false, results: [] },
        };
      }

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

async function spawnChildPi(
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  reporter: RalphReporter
): Promise<ChildPiResult> {
  const childCommand = ["pi", ...args].map(shellEscape).join(" ");
  const child = spawn("script", ["-qefc", childCommand, "/dev/null"], { cwd });
  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  let lastProgressAt = Date.now();
  let lastMeaningfulProgressAt = Date.now();
  let sawMeaningfulProgress = false;
  let terminationReason: ChildPiResult["terminationReason"] = null;
  const startedAt = Date.now();
  const rawEventTail: string[] = [];
  const toolCounts: Record<string, number> = {};
  const toolSequence: string[] = [];
  const diagnosticsDir = createChildDiagnosticsDir(cwd, startedAt);

  let exitCode: number | null = null;
  let closePromiseResolve: ((code: number | null) => void) | null = null;
  let spawnError: Error | null = null;
  const killTimers: ReturnType<typeof setTimeout>[] = [];

  const abortChild = () => {
    terminationReason = "aborted";
    child.kill("SIGTERM");
    killTimers.push(setTimeout(() => child.kill("SIGKILL"), 5000));
  };

  signal?.addEventListener("abort", abortChild, { once: true });
  const heartbeat = setInterval(() => {
    // Once a stall/abort has been detected, stop checking — the child
    // is already being killed and we don't want duplicate reports.
    if (terminationReason) return;

    const now = Date.now();
    if (now - lastProgressAt >= 5000) {
      const elapsedSeconds = Math.max(1, Math.round((now - startedAt) / 1000));
      reporter.stream?.("pi", `Child pi still working... ${elapsedSeconds}s elapsed`);
      lastProgressAt = now;
    }

    if (now - lastMeaningfulProgressAt >= 180000) {
      terminationReason = "meaningful-stall";
      reporter.report(
        `Child pi stalled: no meaningful progress for ${Math.round((now - lastMeaningfulProgressAt) / 1000)}s. Terminating child.`,
        "error"
      );
      child.kill("SIGTERM");
      killTimers.push(setTimeout(() => child.kill("SIGKILL"), 5000));
      lastMeaningfulProgressAt = now;
    }

    // Exploration stall: if the child has used many read/bash tools but
    // zero implementation tools (edit, write, ralph_quality_check), it's
    // stuck in a reading loop. Allow generous reading but still catch
    // pathological cases where it never reaches implementation.
    const implTools = ["edit", "write", "str_replace", "ralph_quality_check", "ralph_complete_story"];
    const totalExploration = Object.entries(toolCounts)
      .filter(([name]) => !implTools.includes(name))
      .reduce((sum, [, count]) => sum + count, 0);
    const totalImpl = Object.entries(toolCounts)
      .filter(([name]) => implTools.includes(name))
      .reduce((sum, [, count]) => sum + count, 0);
    if (totalExploration >= 40 && totalImpl === 0 && now - startedAt >= 180000) {
      terminationReason = "meaningful-stall";
      reporter.report(
        `Child pi exploration stall: ${totalExploration} exploration tools (read/bash) but 0 implementation tools after ${Math.round((now - startedAt) / 1000)}s. Terminating.`,
        "error"
      );
      child.kill("SIGTERM");
      killTimers.push(setTimeout(() => child.kill("SIGKILL"), 5000));
      lastMeaningfulProgressAt = now;
    }

    // Thinking-only stall: if the model has been reasoning for a long time
    // but never made a single tool call, it may be stuck in an infinite
    // reasoning loop. This catches cases where thinking_delta/text_delta
    // keep resetting the general timer but no actual work gets done.
    const totalTools = Object.values(toolCounts).reduce((sum, c) => sum + c, 0);
    if (totalTools === 0 && now - startedAt >= 180000) {
      terminationReason = "meaningful-stall";
      reporter.report(
        `Child pi thinking stall: 0 tool calls after ${Math.round((now - startedAt) / 1000)}s. Terminating.`,
        "error"
      );
      child.kill("SIGTERM");
      killTimers.push(setTimeout(() => child.kill("SIGKILL"), 5000));
      lastMeaningfulProgressAt = now;
    }
  }, 1000);

  try {
    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      lastProgressAt = Date.now();

      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          rawEventTail.push(line);
          if (rawEventTail.length > 80) rawEventTail.splice(0, rawEventTail.length - 80);
          const toolName = getChildToolName(line);
          if (toolName) {
            toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
            toolSequence.push(toolName);
            if (toolSequence.length > 100) toolSequence.splice(0, toolSequence.length - 100);
          }
          if (isMeaningfulChildLine(line)) {
            sawMeaningfulProgress = true;
            lastMeaningfulProgressAt = Date.now();
          }
          handleChildStdoutLine(line, reporter);
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      lastProgressAt = Date.now();
      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        reporter.stream?.("pi-err", trimmed);
      }
    });

    child.on("error", (error) => {
      spawnError = error;
      reporter.report(`Failed to spawn pi: ${error.message}`, "error");
      // Safety: if close never fires after a spawn error (rare but possible),
      // resolve after a short delay so we don't hang forever.
      killTimers.push(setTimeout(() => closePromiseResolve?.(null), 2000));
    });

    exitCode = await new Promise<number | null>((resolve) => {
      closePromiseResolve = resolve;
      child.on("close", resolve);
    });

    const trailing = stdoutBuffer.trim();
    if (trailing.length > 0) {
      rawEventTail.push(trailing);
      if (rawEventTail.length > 80) rawEventTail.splice(0, rawEventTail.length - 80);
      const trailingToolName = getChildToolName(trailing);
      if (trailingToolName) {
        toolCounts[trailingToolName] = (toolCounts[trailingToolName] || 0) + 1;
        toolSequence.push(trailingToolName);
        if (toolSequence.length > 100) toolSequence.splice(0, toolSequence.length - 100);
      }
      if (isMeaningfulChildLine(trailing)) {
        sawMeaningfulProgress = true;
        lastMeaningfulProgressAt = Date.now();
      }
      handleChildStdoutLine(trailing, reporter);
    }
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", abortChild);
    for (const timer of killTimers) clearTimeout(timer);
    // Ensure the child is really dead before we return.
    child.kill("SIGKILL");

    // Always write diagnostics, even if the child crashed or was interrupted.
    // This is the key fix: previously writeChildDiagnostics was inside the try
    // block and could be skipped if the child never closed or threw an error.
    const elapsedMs = Date.now() - startedAt;
    writeChildDiagnostics(diagnosticsDir, {
      args,
      childCommand,
      cwd,
      code: exitCode,
      stdout,
      stderr,
      terminationReason,
      rawEventTail,
      toolCounts,
      toolSequence,
      elapsedMs,
      sawMeaningfulProgress,
    });
  }

  // If spawn itself failed, include the error in stderr so callers can see it.
  if (spawnError) {
    stderr += `\n[ralph] spawn error: ${spawnError.message}`;
  }

  return {
    code: exitCode,
    stdout,
    stderr,
    sawMeaningfulProgress,
    rawEventTail,
    terminationReason,
    diagnosticsDir,
    elapsedMs: Date.now() - startedAt,
    toolCounts,
    toolSequence,
  };
}

function handleChildStdoutLine(line: string, reporter: RalphReporter): void {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      message?: {
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
        toolName?: string;
      };
      assistantMessageEvent?: {
        type?: string;
        delta?: string;
        content?: string;
        toolCall?: {
          name?: string;
          arguments?: Record<string, unknown>;
        };
      };
      toolName?: string;
      toolCall?: {
        toolName?: string;
        name?: string;
      };
      toolResult?: {
        toolName?: string;
        isError?: boolean;
      };
    };

    const progress = describeChildEvent(event);
    if (progress) {
      reporter.stream?.("pi", progress);
    }
  } catch {
    reporter.stream?.("pi", line);
  }
}

function describeChildEvent(event: {
  type?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    toolName?: string;
  };
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
    content?: string;
    toolCall?: {
      name?: string;
      arguments?: Record<string, unknown>;
    };
  };
  toolName?: string;
  toolCall?: {
    toolName?: string;
    name?: string;
  };
  toolResult?: {
    toolName?: string;
    isError?: boolean;
  };
}): string | null {
  switch (event.type) {
    case "agent_start":
      return "Child pi started";
    case "turn_start":
      return "Child pi turn started";
    case "message_start":
      if (event.message?.role === "assistant") {
        return "Model is thinking";
      }
      return null;
    case "message_update":
      if (event.assistantMessageEvent?.type === "thinking_start") {
        return "Model is thinking";
      }
      if (event.assistantMessageEvent?.type === "thinking_delta") {
        return null;
      }
      if (event.assistantMessageEvent?.type === "thinking_end") {
        return "Model finished planning";
      }
      if (event.assistantMessageEvent?.type === "toolcall_start") {
        return `Preparing tool call: ${event.assistantMessageEvent.toolCall?.name || "unknown"}`;
      }
      if (event.assistantMessageEvent?.type === "toolcall_end") {
        return `Prepared tool call: ${event.assistantMessageEvent.toolCall?.name || "unknown"}`;
      }
      if (event.assistantMessageEvent?.type === "text_delta") {
        const delta = toSingleLine(event.assistantMessageEvent.delta || "");
        return delta.length > 0 ? `Model: ${delta}` : null;
      }
      return null;
    case "tool_execution_start":
      return `Running tool: ${event.toolCall?.toolName || event.toolCall?.name || event.toolName || "unknown"}`;
    case "tool_execution_end":
      return `Finished tool: ${event.toolResult?.toolName || event.toolName || "unknown"}`;
    case "message_end":
      if (event.message?.role === "assistant") {
        const text = event.message.content
          ?.filter((content) => content.type === "text")
          .map((content) => content.text || "")
          .join(" ")
          .trim();
        return text ? `Assistant: ${toSingleLine(text).slice(0, 200)}` : "Assistant message complete";
      }
      return null;
    case "agent_end":
      return "Child pi finished";
    default:
      return null;
  }
}

function isMeaningfulChildLine(line: string): boolean {
  if (!line.startsWith("{")) {
    return false;
  }

  try {
    const event = JSON.parse(line) as {
      type?: string;
      message?: { role?: string };
      assistantMessageEvent?: { type?: string };
      toolName?: string;
      toolCall?: { toolName?: string; name?: string };
      toolResult?: { toolName?: string; isError?: boolean };
    };

    // Tool execution is always meaningful.
    if (event.type === "tool_execution_start" || event.type === "tool_execution_end") return true;
    if (event.type === "tool_result") return true;
    if (event.type === "agent_end") return true;
    if (event.type === "message_end" && event.message?.role === "assistant") return true;

    // The model is actively working when thinking or generating text.
    // Without these, long planning/thinking phases (30-90+ seconds of
    // thinking_delta / text_delta events) can trigger a false stall.
    if (event.type === "message_update") {
      const subType = event.assistantMessageEvent?.type;
      if (subType === "thinking_start" || subType === "thinking_delta" ||
          subType === "thinking_end" || subType === "text_delta") {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function getChildToolName(line: string): string | null {
  if (!line.startsWith("{")) return null;

  try {
    const event = JSON.parse(line) as {
      type?: string;
      toolName?: string;
      toolCall?: { toolName?: string; name?: string };
      toolResult?: { toolName?: string };
      assistantMessageEvent?: { type?: string; toolCall?: { name?: string } };
    };

    if (event.type === "tool_execution_start") {
      return event.toolCall?.toolName || event.toolCall?.name || event.toolName || null;
    }
    if (event.type === "tool_execution_end") {
      return event.toolResult?.toolName || event.toolName || null;
    }
    if (event.assistantMessageEvent?.type === "toolcall_end") {
      return event.assistantMessageEvent.toolCall?.name || null;
    }

    return null;
  } catch {
    return null;
  }
}

function isImplementationToolName(toolName: string): boolean {
  return ["edit", "write", "ralph_quality_check", "ralph_complete_story", "agent-browser"].includes(toolName);
}

function getTrackedSourceFileSnapshot(cwd: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const output = execSync("git ls-files", { cwd, encoding: "utf8" }).trim();
  if (!output) return snapshot;

  const interestingExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".svelte", ".py", ".rs", ".go", ".java", ".kt", ".swift", ".c", ".cc", ".cpp", ".h", ".hpp", ".json", ".toml", ".yaml", ".yml", ".sql", ".css", ".html"
  ]);

  for (const relPath of output.split("\n").filter(Boolean)) {
    if (relPath === "prd.json" || relPath === PROGRESS_FILE) continue;
    const ext = relPath.includes(".") ? relPath.slice(relPath.lastIndexOf(".")) : "";
    if (!interestingExtensions.has(ext)) continue;
    try {
      snapshot[relPath] = readFileSync(join(cwd, relPath), "utf8");
    } catch {
      // Ignore unreadable files.
    }
  }

  return snapshot;
}

function hasTrackedSourceChanges(before: Record<string, string>, after: Record<string, string>): boolean {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const path of paths) {
    if ((before[path] || "") !== (after[path] || "")) {
      return true;
    }
  }
  return false;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function createProgressSink(ctx: any): RalphProgressSink {
  const lines: string[] = [];
  const maxLines = 20;

  return {
    push(message: string) {
      if (!ctx?.hasUI) return;

      const nextLines = message
        .split("\n")
        .map((line) => toSingleLine(line))
        .filter((line) => line.length > 0);

      if (nextLines.length === 0) return;

      for (const line of nextLines) {
        if (lines[lines.length - 1] === line) continue;
        lines.push(line);
      }

      if (lines.length > maxLines) {
        lines.splice(0, lines.length - maxLines);
      }

      ctx.ui.setWidget("ralph-progress", [...lines], { placement: "aboveEditor" });
    },
  };
}

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

/**
 * Ensure .ralph/ is listed in .git/info/exclude so Ralph's diagnostics
 * directory never appears as untracked in `git status` output.
 * Uses .git/info/exclude (local-only, not shared via .gitignore) so it
 * doesn't pollute the project's own ignore file.
 */
function ensureRalphGitExclude(cwd: string): void {
  try {
    // Don't create .git/ in a non-repo directory.
    if (!existsSync(join(cwd, ".git"))) return;
    const excludePath = join(cwd, ".git", "info", "exclude");
    let content = "";
    if (existsSync(excludePath)) {
      content = readFileSync(excludePath, "utf8");
      if (content.includes(".ralph")) return; // Already excluded
    }
    const entry = `\n# Ralph autonomous agent diagnostics\n.ralph/\n`;
    ensureDirectoryExistence(excludePath);
    writeFileSync(excludePath, content + entry, "utf8");
  } catch {
    // Best-effort; if we can't write the exclude file, Ralph still works
    // but .ralph/ may show as untracked.
  }
}

function getGitStatusLines(cwd: string): string[] {
  const status = execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim();
  return status ? status.split("\n").filter(Boolean) : [];
}

function formatDirtyFilesPreview(dirtyFiles: string[]): string {
  const preview = dirtyFiles.slice(0, 5).join("\n");
  const extra = dirtyFiles.length > 5 ? `\n...and ${dirtyFiles.length - 5} more` : "";
  return preview + extra;
}

function formatDirtyWorktreeMessage(dirtyFiles: string[]): string {
  return [
    "Ralph requires a clean git worktree before it runs.",
    "Commit, stash, or discard these changes first:",
    formatDirtyFilesPreview(dirtyFiles),
  ].join("\n");
}

function getWorktreeDiagnostics(cwd: string): string {
  const sections: string[] = [];

  try {
    const stagedStat = execSync("git diff --cached --stat", {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    if (stagedStat) {
      sections.push(`Staged diff stat:\n${stagedStat}`);
    }
  } catch {
    // Ignore diff collection failures.
  }

  try {
    const unstagedStat = execSync("git diff --stat", {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    if (unstagedStat) {
      sections.push(`Unstaged diff stat:\n${unstagedStat}`);
    }
  } catch {
    // Ignore diff collection failures.
  }

  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    if (untracked) {
      const files = untracked.split("\n").filter(Boolean);
      const preview = files.slice(0, 10).join("\n");
      const extra = files.length > 10 ? `\n...and ${files.length - 10} more` : "";
      sections.push(`Untracked files:\n${preview}${extra}`);
    }
  } catch {
    // Ignore untracked file collection failures.
  }

  try {
    const diffPreview = execSync("git diff --no-ext-diff --unified=1", {
      cwd,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    }).trim();
    if (diffPreview) {
      sections.push(`Diff preview:\n${diffPreview.slice(0, 2000)}`);
    }
  } catch {
    // Ignore diff preview failures.
  }

  return sections.join("\n\n");
}

function rollbackDirtyWorktree(
  cwd: string,
  dirtyFiles: string[],
  context: string
): { cleaned: boolean; message: string } {
  const diagnostics = getWorktreeDiagnostics(cwd);
  const lines = [
    `Ralph detected uncommitted changes after ${context}.`,
    formatDirtyFilesPreview(dirtyFiles),
  ];

  if (diagnostics) {
    lines.push(diagnostics);
  }

  try {
    execSync("git reset --hard HEAD", { cwd, stdio: "pipe" });

    // Remove Ralph's own diagnostics directory (the only untracked dir we create).
    // Avoid `git clean -fd` which can fail on permission-denied dirs created
    // by other tools (e.g., Docker-owned .pnpm-store).
    const ralphDir = join(cwd, ".ralph");
    try {
      rmSync(ralphDir, { recursive: true, force: true });
    } catch {
      // Best-effort; .ralph may have permission issues too.
    }

    const remaining = getGitStatusLines(cwd);
    // If remaining dirty files are only untracked (??) that we can't remove,
    // treat the worktree as clean enough — they aren't Ralph's changes.
    const onlyUntracked = remaining.every((line) => line.startsWith("??"));
    if (remaining.length === 0 || onlyUntracked) {
      if (onlyUntracked && remaining.length > 0) {
        lines.push(
          `Ralph rolled back its own changes. Some untracked files remain ` +
          `(not created by Ralph, e.g., build artifacts with restricted permissions). ` +
          `These will not affect the next iteration.`
        );
      } else {
        lines.push("Ralph rolled back the unfinished changes and restored a clean worktree.");
      }
      return { cleaned: true, message: lines.join("\n\n") };
    }

    lines.push("Ralph attempted cleanup, but the worktree is still dirty:");
    lines.push(formatDirtyFilesPreview(remaining));
    return { cleaned: false, message: lines.join("\n\n") };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    lines.push(`Ralph failed to restore a clean worktree automatically: ${errorMessage}`);
    return { cleaned: false, message: lines.join("\n\n") };
  }
}

function formatChildFailure(
  output: string,
  rawEventTail: string[] = [],
  diagnostics?: { diagnosticsDir?: string; elapsedMs?: number; toolCounts?: Record<string, number>; toolSequence?: string[] }
): string {
  const tail = rawEventTail.length > 0
    ? `\n\nChild raw event tail:\n${rawEventTail.slice(-20).join("\n")}`
    : "";
  const diagnosticsLines: string[] = [];

  if (diagnostics?.elapsedMs != null) {
    diagnosticsLines.push(`Elapsed: ${Math.round(diagnostics.elapsedMs / 1000)}s`);
  }
  if (diagnostics?.toolCounts && Object.keys(diagnostics.toolCounts).length > 0) {
    const counts = Object.entries(diagnostics.toolCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}=${count}`)
      .join(", ");
    diagnosticsLines.push(`Tool counts: ${counts}`);
  }
  if (diagnostics?.toolSequence && diagnostics.toolSequence.length > 0) {
    diagnosticsLines.push(`Tool sequence tail: ${diagnostics.toolSequence.slice(-25).join(" -> ")}`);
  }
  if (diagnostics?.diagnosticsDir) {
    diagnosticsLines.push(`Diagnostics: ${diagnostics.diagnosticsDir}`);
  }

  const diagnosticsBlock = diagnosticsLines.length > 0
    ? `\n\nChild diagnostics:\n${diagnosticsLines.join("\n")}`
    : "";

  return `Child pi output:\n${output.slice(-2000)}${diagnosticsBlock}${tail}`;
}

function createChildDiagnosticsDir(cwd: string, startedAt: number): string {
  const dir = join(cwd, ".ralph", "child-runs", `${startedAt}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeChildDiagnostics(
  diagnosticsDir: string,
  data: {
    args: string[];
    childCommand: string;
    cwd: string;
    code: number | null;
    stdout: string;
    stderr: string;
    terminationReason: string | null;
    rawEventTail: string[];
    toolCounts: Record<string, number>;
    toolSequence: string[];
    elapsedMs: number;
    sawMeaningfulProgress: boolean;
  }
): void {
  try {
    writeFileSync(
      join(diagnosticsDir, "summary.json"),
      JSON.stringify(
        {
          cwd: data.cwd,
          args: data.args,
          childCommand: data.childCommand,
          code: data.code,
          terminationReason: data.terminationReason,
          elapsedMs: data.elapsedMs,
          sawMeaningfulProgress: data.sawMeaningfulProgress,
          toolCounts: data.toolCounts,
          toolSequence: data.toolSequence,
        },
        null,
        2
      ),
      "utf8"
    );
    writeFileSync(join(diagnosticsDir, "stdout.log"), data.stdout, "utf8");
    writeFileSync(join(diagnosticsDir, "stderr.log"), data.stderr, "utf8");
    writeFileSync(join(diagnosticsDir, "raw-event-tail.log"), data.rawEventTail.join("\n"), "utf8");
  } catch {
    // Ignore diagnostic write failures.
  }
}

function parseMaxIterations(args: string): number {
  const parsed = Number.parseInt(args.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ITERATIONS;
}

function shouldNotifyCommand(message: string): boolean {
  return (
    message.startsWith("Starting Ralph") ||
    message.startsWith("Creating branch") ||
    message.startsWith("Iteration ") ||
    message.includes("ALL STORIES COMPLETE") ||
    message.includes("Max iterations reached")
  );
}

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getDefaultQualityChecks(cwd: string): string[] {
  const commands: string[] = [];
  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = packageJson.scripts || {};

      if (scripts.typecheck) commands.push("npm run typecheck");
      if (scripts.lint) commands.push("npm run lint");
      if (scripts.test) commands.push("npm test");
      if (!scripts.test && scripts["test:ci"]) commands.push("npm run test:ci");
    } catch {
      // Ignore malformed package.json and fall through to other checks.
    }
  }

  if (existsSync(join(cwd, "Cargo.toml"))) {
    commands.push("cargo test");
  }

  if (existsSync(join(cwd, "go.mod"))) {
    commands.push("go test ./...");
  }

  if (
    existsSync(join(cwd, "pyproject.toml")) ||
    existsSync(join(cwd, "pytest.ini")) ||
    existsSync(join(cwd, "tox.ini"))
  ) {
    commands.push("pytest");
  }

  return [...new Set(commands)];
}
