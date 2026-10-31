# Agent runner (fede-256gb)

The scripts that run Stabileo's fix and review agents on the shared agent host. They expect the layout
`~/projects/stabileo` (main checkout), `~/projects/stabileo-wt/<name>` (worktrees),
`~/projects/stabileo-state` (bin, queue, logs, reviews); every script re-runs itself under `bgrun`
(low-priority background slice) via `common.sh`.

## Engine policy (`engines.py`)

| Work | Order | Out when |
|---|---|---|
| Write: research papers, Tools, docs | claude, codex, kimi (Grok never writes code) | Claude: every `cswap` account at 100 % (5h or 7d) |
| Review | codex, kimi, grok | Codex: weekly window at 100 % (no paid credits unless `STABILEO_ALLOW_CODEX_CREDITS=1`) |

- The second reviewer is always a different model from the first and from the author (`AUTHOR_ENGINE`).
- Codex cannot write on this host (its bwrap sandbox is blocked by AppArmor; unsandboxed runs are not used).
- Kimi and Grok are probed with a one-line prompt, cached 30 minutes.
- Fallback engines only take `research`, `tools`, `review` and `docs` work. Engine, safety and app
  changes wait for Claude and still need two reviews before main.
- `python3 engines.py status` shows every engine's state; `STABILEO_FORCE_ENGINE=<e>` and `DRY_RUN=1`
  force an engine / print commands instead of running them.

## Unattended queue

`queue-runner.sh` processes `queue/jobs/pending/*.job` (`TYPE=fixpaper|review|review-chunked|review-paper`,
`ARG`, `SCOPE`, optional `ENGINE`, `AUTHOR_ENGINE`) so queued research and review jobs keep running
while the interactive session is paused. It runs every 10 minutes as a systemd user timer:

    systemd-run --user --unit=stabileo-queue --on-calendar='*:0/10' bgrun bash ~/projects/stabileo-state/bin/queue-runner.sh --once

A job whose engine is unavailable stays pending; finished jobs move to `done/` or `failed/`, and every
engine choice is logged in `logs/runner.log`.
