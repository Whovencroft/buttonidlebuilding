# CODEX_TMUX_LOCAL_LINUX.md

# Running Codex Locally on a Linux Laptop in tmux

## Purpose

This file explains how to run Codex directly on your Linux laptop in a persistent `tmux` session instead of running it inside a GitHub-hosted shell.

This is usually the better option if you want:

- direct control over the environment
- access to your local files
- better persistence
- less dependency on browser sessions
- the same repo available even when a hosted shell is unavailable

---

## Important Reality Check

Codex CLI is designed to run locally in your terminal environment. OpenAI's official docs describe it as a terminal tool that runs locally, and they explicitly list Linux as an officially supported platform. The docs also describe installation with `npm install -g @openai/codex`, login with `codex --login`, and support for Suggest, Auto Edit, and Full Auto modes. citeturn252994search0turn252994search3

So yes, running Codex from your Linux laptop instead of a GitHub shell is a normal and supported way to use it. citeturn252994search0

---

## What You Need

Install and verify:

- git
- Node.js
- npm
- tmux
- Codex CLI

Examples on Debian/Ubuntu-style systems:

```bash
sudo apt-get update
sudo apt-get install -y git tmux
```

Install Node.js and npm using your preferred method if they are not already installed.

Verify:

```bash
node -v
npm -v
git --version
tmux -V
```

---

## Install Codex CLI

```bash
npm install -g @openai/codex
```

OpenAI's official docs list that as the standard install path. citeturn252994search0turn252994search5

Update later with:

```bash
codex --upgrade
```

OpenAI's docs list `codex --upgrade` as the update path. citeturn252994search0

---

## Authenticate Codex

### Option A: Sign in with ChatGPT

```bash
codex --login
```

OpenAI's help docs say this launches the Sign in with ChatGPT flow and stores credentials locally. citeturn252994search3

### Option B: API key

```bash
export OPENAI_API_KEY="YOUR_KEY_HERE"
```

OpenAI's getting-started guide lists exporting `OPENAI_API_KEY` as the API-key path. citeturn252994search0

---

## Clone or Open the Repo

If the repo is not on your laptop yet:

```bash
git clone https://github.com/Whovencroft/buttonidlebuilding.git
cd buttonidlebuilding
```

If it is already present:

```bash
cd /path/to/buttonidlebuilding
git status
```

---

## Start a Persistent tmux Session

```bash
tmux new -s codex_build
```

Useful tmux commands:

- Detach: `Ctrl+b` then `d`
- Reattach: `tmux attach -t codex_build`
- List sessions: `tmux ls`
- Kill session: `tmux kill-session -t codex_build`

This lets Codex continue running even if you close the terminal window and reconnect later.

---

## Recommended Local Workflow

### Step 1: Create a working branch

```bash
git checkout main
git pull
git checkout -b codex/migration-pass-1
```

### Step 2: Launch Codex in the repo root

Safe mode:

```bash
codex
```

Auto-edit mode:

```bash
codex --auto-edit
```

Full auto mode:

```bash
codex --full-auto
```

OpenAI's docs describe those modes as:
- Suggest
- Auto Edit
- Full Auto citeturn252994search0

### Step 3: Give Codex a scoped prompt

Example:

```text
Read MASTER_BUILD_SPEC.md, ARCHITECTURE.md, MIGRATION_PLAN.md, BASELINE_BEHAVIOR.md, SAVE_SCHEMA_SNAPSHOT.md, and AGENTS.md.
Inspect index.html, css/styles.css, js/main.js, js/core/scene_manager.js, js/scenes/button_idle_scene.js, js/scenes/marble_scene.js, and js/scenes/marble/*.
Implement only the first migration milestone:
- add Vite + TypeScript foundation
- preserve current browser behavior
- do not redesign gameplay yet
- keep scene IDs button_idle and marble
- stop after the project boots through the new module entry path
Show diffs and explain assumptions.
```

### Step 4: Log output

```bash
codex --auto-edit 2>&1 | tee codex_run.log
```

or

```bash
codex --full-auto 2>&1 | tee codex_full_auto.log
```

---

## Best Practice for This Project

Do not tell Codex to build the entire end-state project in one shot.

Use milestone-based runs:

1. foundation and toolchain
2. scene host migration
3. current scene port
4. save/input services
5. progression layer
6. touch/mobile path
7. Phaser adapter
8. future scene expansion

This repository is too layered for a single giant unattended prompt to produce a clean result.

---

## Suggested tmux Layout

### Pane 1
Codex session

### Pane 2
Repo monitor

```bash
watch -n 2 'git status --short; echo; git diff --stat'
```

### Pane 3
Build/test commands as needed

Examples:

```bash
npm install
npm run build
npm run dev
```

Create panes with tmux:

- vertical split: `Ctrl+b` then `%`
- horizontal split: `Ctrl+b` then `"`

---

## Recovery and Troubleshooting

### If Codex gets stuck
Use `Ctrl+C`, then restart with a narrower prompt.

### If authentication breaks
Retry:

```bash
codex --login
```

or re-export `OPENAI_API_KEY`.

### If the run drifts off scope
Stop it and restate a smaller milestone.
Do not keep nudging a bad full-auto run indefinitely.

### If the repo becomes messy
Use git:

```bash
git status
git diff
git restore .
```

or reset the branch if needed.

### If you want stronger isolation
Run Codex in a dedicated local clone of the repo instead of your main working copy.

---

## Optional Local Automation Pattern

If you want Codex to keep working after you detach from tmux, a common pattern is:

1. start tmux
2. launch Codex with a milestone-specific prompt
3. pipe output to a log
4. detach
5. reattach later and inspect the diff

That gives you local persistence without depending on a hosted shell staying alive.

---

## About OpenClaw

You mentioned OpenClaw earlier, but for this specific use case you do not need OpenClaw to run Codex locally.
Codex CLI already runs directly in the terminal on Linux. OpenClaw would be a separate agent stack, not a requirement for local Codex usage. The simpler path for this repository is to run Codex directly in tmux on your laptop. citeturn252994search0turn252994search3

---

## Final Recommendation

For this project, the most practical setup is:

- keep the repository on your Linux laptop
- run Codex directly in that repo
- use tmux for persistence
- work one milestone at a time
- review diffs after every run

That is cleaner and more durable than relying on a GitHub-hosted shell for long autonomous runs.
