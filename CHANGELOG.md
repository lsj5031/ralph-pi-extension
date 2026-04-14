# Changelog

All notable changes to Ralph Pi Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `.ralph/` diagnostics directory no longer appears as untracked in `git status` — automatically added to `.git/info/exclude` at startup
- `git clean -fd` replaced with targeted `rmSync(.ralph/)` — the old command failed on Docker-owned directories like `.pnpm-store/` with permission denied, causing Ralph to halt
- Remaining untracked files (`??`) after rollback are now tolerated — they aren't Ralph's changes and won't block subsequent iterations
- Child stall detection now counts `thinking_delta`/`text_delta` events as meaningful progress — prevents false stall kills during long planning/thinking phases
- General stall timeout increased from 90s to 180s for complex stories
- Added exploration stall detection: kills child if 40+ exploration tools with 0 implementation tools after 180s
- Added thinking-only stall detection: kills child if 0 tool calls after 180s (catches infinite reasoning loops)
- Heartbeat guard prevents duplicate stall reports after first detection
- Removed `--no-session` from child args — session logs now persist for debugging
- `ensureRalphGitExclude` now guards against non-git directories to avoid creating orphan `.git/` dirs

### Planned
- Web dashboard for monitoring Ralph progress
- Support for multiple quality check profiles
- Integration with CI/CD pipelines
- Story estimation and time tracking
- Automatic story size validation

## [1.0.0] - 2026-01-14

### Added
- Initial release of Ralph autonomous agent for pi
- Core autonomous loop with fresh instance spawning
- PRD to JSON conversion skill (ralph-prd)
- Git integration with automatic commits
- Quality gates (typecheck, lint, tests)
- Progress tracking via prd.json and progress.txt
- `/ralph` command to start autonomous loop
- `/ralph-status` command to check progress
- `/ralph-continue` command to resume execution
- Comprehensive documentation
- Example PRDs with properly sized stories

### Documentation
- Main README with quick start guide
- PRD Format Guide with complete JSON schema reference
- Story Sizing Guidelines with real-world examples
- Troubleshooting Guide with common issues and solutions
- Contributing Guidelines
- Example PRDs and usage guides

### Features
- Automatic branch creation from prd.json
- Story execution in priority order
- Verifiable acceptance criteria
- Browser verification support for UI stories
- Learnings tracking across iterations
- Error recovery and retry mechanisms

## [0.1.0] - 2026-01-13

### Added
- Initial concept and prototype
- Basic PRD parsing
- Simple story execution loop

[Unreleased]: https://github.com/lsj5031/ralph-pi-extension/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/lsj5031/ralph-pi-extension/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/lsj5031/ralph-pi-extension/releases/tag/v0.1.0
