# Contributing

## Reviews before main

Run Codex and Kimi before merging to main. Kimi is the priority second reviewer;
if it is unavailable, use Grok, then an independent adversarial Codex review.
Pin a full commit SHA (or an unambiguous local abbreviation, resolved with
`git rev-parse`) so a push during review cannot change what is reviewed:

```sh
scripts/review/review-pr.sh 123 '' "$(git rev-parse HEAD)"
# Same arguments, second reviewer only:
scripts/review/review-second.sh 123 '' "$(git rev-parse HEAD)"
```

The optional middle argument selects a prompt file. The scripts wait up to ten
minutes for GitHub to report the requested SHA, fetch that exact commit, and
remove their detached worktree on exit. `REVIEW_SHA_TIMEOUT` and
`REVIEW_SHA_INTERVAL` override the wait and polling interval in seconds.
Install/authenticate `gh`, `codex`, and the available `kimi` / `grok` CLIs first.

Results are `review-<pr>-<sha12>-<reviewer>.md`, with reviewer and full SHA
labels, in a unique run directory under `$REVIEW_OUT` (default
`${TMPDIR:-/tmp}/stabileo-reviews`). The runner prints this path. Completed
reviews are published by atomic rename; concurrent runs, including the same
SHA, retain separate artifacts. Fetches use a per-run base ref without updating
`origin/main` or `FETCH_HEAD`; prompts use that ref and it is removed on exit.
Raw output, stderr, and exit codes are retained alongside them. Worktrees go
under `$REVIEW_WORKTREES` (default the repository's parent). A successful run
means reviews were obtained: the last nonblank line must be exactly `ready`,
`ready after should-fix items`, or `not ready`. Narration, authentication or
permission requests, and other incomplete output trigger fallback (or failure
for primary Codex / exhausted fallbacks). Read verdicts and address findings
before merging. Kimi runs with `-p` in a detached, throwaway checkout of the pinned SHA (its CLI rejects `--plan` together with `-p`),
Grok uses `--permission-mode plan`, and Codex uses `--sandbox read-only`. Re-run against the new SHA after fixes.

For research papers, record the actual reviewer and reviewed SHA:

```sh
scripts/review/record-review.sh shauer-2025 Kimi "$SHA" 'ready to merge'
python3 research/tools/catalog.py --offline
```

Other verdicts are `ready after should-fix items` and `not ready`. Recording
appends to the optional `reviews: []` list and refreshes `research/papers.json`.
This requires the Python dependencies in `research/tools/requirements.txt`.
Use `scripts/status.sh` for the open PR table; it excludes Dimank92,
Brayaniglesias08, and Dependabot. Run `make check.review-scripts` for the local
stub-based regression tests.
