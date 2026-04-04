# OPENCLAW_OFFLINE_LOCAL_RUNBOOK.md

# Running Button Idle Building Offline on a Linux Laptop with OpenClaw + Qwen

## Purpose

This file documents how to run this project locally on a Linux laptop using:

- OpenClaw
- Ollama
- a local Qwen model
- tmux
- persistent background services

The goal is to let the agent keep working locally instead of inside a GitHub-hosted shell.

This is the offline-local alternative to Codex-in-GitHub-shell.

---

## What This Setup Is For

Use this setup when you want:

- the repository to live on your own laptop
- the agent to run on your machine instead of a GitHub shell
- local persistence
- no dependency on a hosted shell session
- the ability to keep the agent running for long stretches through tmux and background services

---

## Reality Check

This setup can run continuously, but "until completed" only works if you define completion.

OpenClaw can keep taking turns through startup hooks and heartbeat runs, but it still needs:

- a concrete build goal
- a repo-local instruction file
- a stable workspace
- a model that is actually strong enough for coding tasks on your hardware

For this project, the agent should consider the current goal "completed" only when the active milestone is finished and the repository is in a working state for that milestone.

Do not try to let it free-run against the entire project scope with no milestone boundary.

---

## Recommended Model Choice

### Best practical default for a modest Linux laptop
Use:

- `qwen2.5-coder:7b`

### Lighter fallback
Use:

- `qwen2.5-coder:3b`

### Only use if you have much stronger hardware
Use:

- `qwen3-coder:30b`

Do not plan around `qwen3-coder:480b` locally unless you have extremely large memory capacity.

### Why

For this repo, code-specialized Qwen is a better fit than a general model.
If your laptop is modest, smaller coder models are the practical compromise.

---

## Recommended Local Architecture

Run four things together:

1. **The repo** in a local folder  
2. **Ollama** as the model runtime  
3. **OpenClaw Gateway/daemon** as the long-running agent host  
4. **tmux** so your controlling sessions stay persistent  

Use:

- OpenClaw workspace = the repo root or a dedicated clone of the repo
- `AGENTS.md` = repo instructions
- `MASTER_BUILD_SPEC.md` = full project scope
- `BOOT.md` = what to do on startup
- `HEARTBEAT.md` = what to keep doing every cycle

---

## Recommended Directory Layout

Use one of these two patterns.

### Pattern A: Repo is the workspace
```text
~/Projects/buttonidlebuilding
```

Set OpenClaw workspace to this repo root.

### Pattern B: Dedicated working clone
```text
~/Projects/buttonidlebuilding-openclaw
```

Use this if you want your normal working copy kept separate from the autonomous copy.

Pattern B is safer.

---

## Step 1: Install Base Tools

Install and verify:

- git
- tmux
- Node.js
- npm
- Ollama
- OpenClaw

Example on Debian/Ubuntu-style Linux:

```bash
sudo apt-get update
sudo apt-get install -y git tmux
```

Verify:

```bash
git --version
tmux -V
node -v
npm -v
```

---

## Step 2: Install Ollama

If Ollama is not installed:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

If you want to run it manually in a shell:

```bash
ollama serve
```

If your install provides a service, you can use that instead.

---

## Step 3: Pull a Local Qwen Model

### Recommended
```bash
ollama pull qwen2.5-coder:7b
```

### Lighter fallback
```bash
ollama pull qwen2.5-coder:3b
```

### Stronger hardware only
```bash
ollama pull qwen3-coder:30b
```

Check installed models:

```bash
ollama list
```

---

## Step 4: Install OpenClaw

Recommended install:

```bash
curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install-cli.sh | bash
```

Alternative:

```bash
npm install -g openclaw@latest
```

Verify:

```bash
openclaw --help
```

---

## Step 5: Onboard OpenClaw as a Local Daemon

Run:

```bash
openclaw onboard --install-daemon
```

During setup, choose a **local** setup path.

If the wizard is too opinionated for your use case, finish onboarding and then edit the config manually.

---

## Step 6: Configure OpenClaw to Use Ollama Properly

### Important rule

Use Ollama's **native API**, not the OpenAI-compatible `/v1` path, for local OpenClaw + Ollama runs.

That means:

- base URL should look like `http://127.0.0.1:11434`
- not `http://127.0.0.1:11434/v1`

### Example `~/.openclaw/openclaw.json`

Replace the repo path with your real local path.

```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434",
        "apiKey": "ollama-local",
        "api": "ollama",
        "models": [
          {
            "id": "qwen2.5-coder:7b",
            "name": "Qwen2.5 Coder 7B",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 32768,
            "maxTokens": 32768
          },
          {
            "id": "qwen2.5-coder:3b",
            "name": "Qwen2.5 Coder 3B",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 32768,
            "maxTokens": 32768
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "ollama/qwen2.5-coder:7b",
        "fallbacks": [
          "ollama/qwen2.5-coder:3b"
        ]
      },
      "workspace": "/home/YOUR_USER/Projects/buttonidlebuilding-openclaw",
      "repoRoot": "/home/YOUR_USER/Projects/buttonidlebuilding-openclaw",
      "heartbeat": {
        "every": "10m",
        "prompt": "Read HEARTBEAT.md if it exists. Follow it strictly. Continue the active project milestone. If blocked, write the blocker to STATUS.md and stop. If nothing needs attention, reply HEARTBEAT_OK."
      }
    }
  },
  "tools": {
    "web": {
      "search": {
        "enabled": false
      }
    }
  }
}
```

### Also set the environment variable

```bash
export OLLAMA_API_KEY="ollama-local"
```

You can put that in your shell profile if needed.

---

## Step 7: Put the Repo Docs in the Workspace

The workspace must contain the project instructions.

At minimum, the repo should include:

- `MASTER_BUILD_SPEC.md`
- `ARCHITECTURE.md`
- `MIGRATION_PLAN.md`
- `BASELINE_BEHAVIOR.md`
- `SAVE_SCHEMA_SNAPSHOT.md`
- `AGENTS.md`

These are the files the local agent should treat as its source of truth.

---

## Step 8: Add BOOT.md and HEARTBEAT.md to the Repo Root

OpenClaw can use startup and heartbeat files in the workspace.

### `BOOT.md`

Use this file to tell the agent what to do each time the gateway starts.

Example:

```md
# BOOT.md

On startup:

1. Read `MASTER_BUILD_SPEC.md`, `ARCHITECTURE.md`, `MIGRATION_PLAN.md`, and `AGENTS.md`.
2. Read `STATUS.md` if it exists.
3. Identify the current milestone.
4. Continue only the next unfinished task in that milestone.
5. Prefer small, reviewable code changes.
6. After each meaningful change:
   - update `STATUS.md`
   - note blockers if any
   - stop if the build is broken
7. If the current milestone is complete, write `MILESTONE_COMPLETE` in `STATUS.md` and stop.
```

### `HEARTBEAT.md`

Use this file as the recurring checklist the agent follows every cycle.

Example:

```md
# HEARTBEAT.md

- Read `STATUS.md`.
- Continue the current milestone from `MASTER_BUILD_SPEC.md`.
- Do not jump to future genre scenes early.
- Keep the browser build runnable.
- If a save schema changes, add or update a migration.
- If blocked, write:
  - what failed
  - what file was involved
  - what information is missing
- If the milestone is complete, write `MILESTONE_COMPLETE` to `STATUS.md` and reply `HEARTBEAT_OK`.
```

### `STATUS.md`

Create this file too. It is the agent's current run ledger.

Example:

```md
# STATUS.md

Current milestone: Vite + TypeScript foundation

Completed:
- none yet

Current task:
- create package.json, vite.config.ts, tsconfig.json, src/main.ts

Blockers:
- none
```

---

## Step 9: Enable Helpful OpenClaw Hooks

List hooks:

```bash
openclaw hooks list
```

Enable these if available:

```bash
openclaw hooks enable boot-md
openclaw hooks enable session-memory
openclaw hooks enable command-logger
```

### Why

- `boot-md` runs `BOOT.md` on gateway startup
- `session-memory` helps preserve context across `/new`
- `command-logger` helps you audit what happened

---

## Step 10: Use tmux for Control and Monitoring

Start a tmux session:

```bash
tmux new -s openclaw_build
```

Create a useful layout.

### Pane 1: Ollama
If not using a service:
```bash
ollama serve
```

### Pane 2: OpenClaw logs or status
Examples:
```bash
openclaw daemon status
```

or, if installed as a service:
```bash
journalctl --user -fu openclaw
```

If the service is system-level instead:
```bash
journalctl -fu openclaw
```

### Pane 3: Repo monitoring
```bash
watch -n 5 'cd ~/Projects/buttonidlebuilding-openclaw && git status --short && echo && git diff --stat'
```

### Pane 4: Manual wake or dashboard
If you want a control UI:
```bash
openclaw dashboard
```

---

## Step 11: Start the Continuous Loop

The continuous loop has three parts.

### Part A: Long-running services
Keep these alive:

- Ollama
- OpenClaw Gateway/daemon

### Part B: Startup continuation
Use `BOOT.md` + `boot-md` so the agent resumes work after restarts.

### Part C: Periodic continuation
Use heartbeat so the agent keeps taking turns.

For true 24/7 behavior, do **not** restrict heartbeat active hours.

If needed, manually wake the agent:

```bash
openclaw system event --text "Continue the current Button Idle Building milestone. Read HEARTBEAT.md and STATUS.md." --mode now
```

That is the cleanest local "keep going" trigger.

---

## Step 12: How to Define "Completed"

Do not let the local agent decide that the whole project is complete just because one subtask ended.

Completion must be milestone-based.

Examples:

### Good milestone definitions
- "Vite + TypeScript foundation complete"
- "Current button and marble scenes ported"
- "SaveService and InputService integrated"
- "Marble touch controls complete"
- "Phaser adapter and test scene complete"

### Bad completion definition
- "Build the whole final game"

For unattended local work, always set one milestone at a time in `STATUS.md`.

---

## Step 13: Recommended Local Operating Pattern

### Best pattern

1. keep a dedicated repo clone for OpenClaw
2. set that repo as the workspace
3. keep Ollama running locally
4. keep OpenClaw installed as a daemon/service
5. enable `boot-md`
6. keep heartbeat enabled
7. use `STATUS.md` to define the current milestone
8. manually wake the agent if needed
9. review diffs between milestones

### Example daily cycle

```bash
cd ~/Projects/buttonidlebuilding-openclaw
git pull
tmux attach -t openclaw_build
openclaw system event --text "Continue the current milestone. Use local repo docs only." --mode now
```

Later:

```bash
git status
git diff --stat
git diff
```

---

## Step 14: Troubleshooting

### OpenClaw does not see Ollama
Check:

```bash
curl http://127.0.0.1:11434/api/tags
ollama list
openclaw models list
```

### OpenClaw outputs broken tool calls or raw JSON
You are probably using the wrong Ollama endpoint.
Use native Ollama API mode and remove `/v1`.

### The model is too slow
Drop to:

```bash
ollama pull qwen2.5-coder:3b
```

and switch the primary model in `openclaw.json`.

### The model is too weak
Move up to a larger coder model only if your hardware can support it.
Do not expect a tiny model to autonomously complete the full project cleanly.

### The agent loops or drifts
Tighten:

- `AGENTS.md`
- `BOOT.md`
- `HEARTBEAT.md`
- `STATUS.md`

The more precise these files are, the better the run.

### The repo gets messy
Keep work on a dedicated branch in the OpenClaw clone and review often.

Example:

```bash
git checkout -b openclaw/milestone-vite-foundation
```

---

## Step 15: Strong Recommendation for This Repo

For this project, the best offline-local path is:

- Ollama local
- OpenClaw local daemon
- Qwen coder model
- repo clone as workspace
- tmux for persistence
- `BOOT.md` + `HEARTBEAT.md` + `STATUS.md`
- milestone-based completion only

That is the most realistic way to make "run continuously until completed" behave like an actual controlled engineering loop instead of an uncontrolled wander.

---

## Step 16: Minimal Command Checklist

### One-time setup

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:7b

curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install-cli.sh | bash
openclaw onboard --install-daemon

export OLLAMA_API_KEY="ollama-local"
```

### Each run

```bash
cd ~/Projects/buttonidlebuilding-openclaw
tmux attach -t openclaw_build || tmux new -s openclaw_build
openclaw system event --text "Continue the current milestone for Button Idle Building." --mode now
```

### Ongoing review

```bash
git status
git diff --stat
git diff
```

---

## Final Instruction

This setup is meant to keep the local agent moving through the project in controlled milestone-sized steps.

Treat `MASTER_BUILD_SPEC.md` as the source of truth.
Treat `AGENTS.md` as the operating rules.
Treat `BOOT.md`, `HEARTBEAT.md`, and `STATUS.md` as the local autonomy loop.

Do not ask the local model to build the entire final project in one shot.
Use the local agent as a persistent milestone worker, not as a magic one-pass finisher.
