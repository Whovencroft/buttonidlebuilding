# CODEX_TMUX_GITHUB_SHELL.md

# Running Codex Autonomously in tmux in a GitHub Shell

## Purpose

This file explains how to run Codex in a persistent `tmux` session inside a GitHub-hosted shell environment such as Codespaces or another Linux shell attached to your repository.

The goal is to let Codex continue working even if your browser tab disconnects or the terminal view closes.

---

## Important Reality Check

Codex CLI runs locally in the terminal environment where you launch it. OpenAI's official Codex CLI docs describe it as a local terminal tool that can read, modify, and run code on your machine, and support Suggest, Auto Edit, and Full Auto modes. It can be installed with `npm install -g @openai/codex`, and you can authenticate either with an API key or by running `codex --login`. OpenAI's docs also note that Codex CLI officially supports macOS and Linux. citeturn252994search0turn252994search3

A GitHub-hosted shell is still just a Linux environment from Codex CLI's perspective.
That means the flow is the same as local Linux, with extra care around persistence.

---

## Before You Start

Make sure the environment has:

- your repository checked out
- Node.js installed
- npm installed
- git configured
- `tmux` installed
- Codex CLI installed
- Codex authenticated

If `tmux` is missing, install it first.

Examples:

```bash
sudo apt-get update
sudo apt-get install -y tmux
```

If you do not have sudo in the environment, use whatever package installation method the shell environment provides.

---

## Install Codex CLI

```bash
npm install -g @openai/codex
```

OpenAI's official getting-started docs list that command as the standard install path. citeturn252994search0turn252994search5

---

## Authenticate Codex

### Option A: Sign in with ChatGPT

```bash
codex --login
```

OpenAI's help docs say the CLI supports `codex --login`, which opens the Sign in with ChatGPT flow and stores credentials locally. citeturn252994search3

### Option B: API key

```bash
export OPENAI_API_KEY="YOUR_KEY_HERE"
```

OpenAI's getting-started guide lists exporting `OPENAI_API_KEY` as the direct API-key path. citeturn252994search0

If you use an API key repeatedly, add the export to your shell profile instead of pasting it every time.

---

## Create a Persistent tmux Session

Start a named session:

```bash
tmux new -s codex_build
```

Useful tmux basics:

- Detach: `Ctrl+b` then `d`
- Reattach: `tmux attach -t codex_build`
- List sessions: `tmux ls`
- Kill session: `tmux kill-session -t codex_build`

---

## Recommended Repo Prep

Inside the tmux session:

```bash
cd /workspaces/buttonidlebuilding
git status
```

Use the actual repository path in your environment.

If this is a Codespace, verify the workspace path first:

```bash
pwd
ls
```

---

## Recommended Codex Launch Modes

OpenAI's docs define three approval modes:

- Suggest
- Auto Edit
- Full Auto

Suggest is the safest.
Auto Edit can write files automatically but still asks before shell commands.
Full Auto can read, write, and execute commands autonomously in its sandboxed mode. citeturn252994search0

### Safe exploration
```bash
codex
```

### Auto-edit but still approve commands
```bash
codex --auto-edit
```

### Autonomous execution
```bash
codex --full-auto
```

For this repository, only use `--full-auto` if:

- the repo is committed and clean enough to recover from mistakes
- you are comfortable reviewing large automated changes afterward
- your instructions are explicit

---

## Best Launch Pattern for This Project

Start Codex from the repo root and give it a scoped instruction that points it to the repo docs.

Example:

```bash
codex --auto-edit
```

Then prompt it with something like:

```text
Read MASTER_BUILD_SPEC.md, ARCHITECTURE.md, MIGRATION_PLAN.md, BASELINE_BEHAVIOR.md, SAVE_SCHEMA_SNAPSHOT.md, and AGENTS.md.
Inspect index.html, css/styles.css, js/main.js, js/core/scene_manager.js, js/scenes/button_idle_scene.js, js/scenes/marble_scene.js, and js/scenes/marble/*.
Implement only the first migration milestone:
- add Vite + TypeScript foundation
- preserve current browser behavior
- do not redesign gameplay yet
- keep scene IDs button_idle and marble
- stop after the project boots through the new module entry path
Show diffs and explain any assumptions.
```

For unattended runs, replace `--auto-edit` with `--full-auto`.

---

## Logging Output to a File

To preserve terminal output, run Codex through `tee`:

```bash
codex --auto-edit 2>&1 | tee codex_run.log
```

For full auto:

```bash
codex --full-auto 2>&1 | tee codex_full_auto.log
```

This makes it easier to inspect what happened after reconnecting.

---

## Recommended Safety Workflow

### Before each run

```bash
git checkout main
git pull
git checkout -b codex/migration-pass-1
git status
```

### During the run

Keep Codex scoped to one milestone.
Do not ask it to build the entire final game in one pass.

### After the run

```bash
git status
git diff --stat
git diff
npm install
npm run build
```

If the repo has a dev server:

```bash
npm run dev
```

Review output before merging anything.

---

## Recovery Tips

### If tmux is missing
Install it, or use `screen` as a fallback.

### If Codex auth fails
Retry:

```bash
codex --login
```

or re-export the API key.

### If the shell disconnects
Reconnect to the environment, then reattach:

```bash
tmux attach -t codex_build
```

### If Codex goes off scope
Interrupt with `Ctrl+C`, then restart with a narrower prompt.

### If the repo becomes messy
Use git to reset or isolate changes on a throwaway branch.

---

## Recommended Session Layout

A useful two-pane tmux layout:

### Pane 1
Run Codex

### Pane 2
Watch repo state

```bash
watch -n 2 'git status --short; echo; git diff --stat'
```

Create panes with:

- vertical split: `Ctrl+b` then `%`
- horizontal split: `Ctrl+b` then `"`

---

## Final Recommendation

For this project, the best pattern in a GitHub shell is:

1. start a named tmux session
2. run Codex from the repo root
3. scope it to one migration phase at a time
4. capture output to a log file
5. review the resulting diff before moving to the next phase

This gives you persistence, recoverability, and a cleaner review process than trying to let it solve the whole project in a single unattended run.
