# Every runner script runs in the low-priority background group (bgrun: background.slice, nice 10).
if [ -z "${STABILEO_BGRUN:-}" ] && command -v bgrun >/dev/null; then export STABILEO_BGRUN=1; exec bgrun bash "$0" "$@"; fi
# Shared paths for the Stabileo agent runner on fede-256gb.
REPO=$HOME/projects/stabileo                       # main checkout (stays on main)
WT=$HOME/projects/stabileo-wt                      # one worktree per workstream
ST=$HOME/projects/stabileo-state
S=$ST/scratchpad                          # laptop-era results (review3/, reviews/, logs)
LOGS=$ST/logs
Q=$ST/queue
ROADMAP=$WT/roadmap/docs/roadmap/PRODUCT_ROADMAP.md   # PR #800 branch, read-only copy
export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-6}
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$LOGS/runner.log"; }

# Engine fallback policy (engines.py): pick_engine <write|review> [exclude...] prints claude/codex/kimi/grok or none.
# Fallback engines (anything but claude) only for these scopes; engine, safety and app work waits for Claude.
FALLBACK_SCOPES="research tools review docs"
pick_engine() { python3 "$ST/bin/engines.py" pick "$@"; }
scope_allows() { local engine=$1 scope=$2; [ "$engine" = claude ] && return 0; case " $FALLBACK_SCOPES " in *" $scope "*) return 0;; esac; return 1; }
