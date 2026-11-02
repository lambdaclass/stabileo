#!/usr/bin/env bash
# Base worktree: node_modules + WASM + research WASM, the source other worktrees clone from.
cd ~/projects/stabileo-wt/base
bgrun nix develop -c bash -c 'cd web && npm ci --no-audit --no-fund && cd .. && scripts/wasm-cached.sh && make research.wasm NIX_RUN='
rc=$?; echo "EXIT=$rc"; exit "$rc"
