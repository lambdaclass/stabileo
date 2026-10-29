#!/usr/bin/env bash
set -euo pipefail
SOURCE=$(cd "$(dirname "$0")/../.." && pwd)
TEMP=$(mktemp -d "${TMPDIR:-/tmp}/review-tests.XXXXXX")
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/bin" "$TEMP/repo" "$TEMP/worktrees"
cp -R "$SOURCE/scripts" "$TEMP/repo/"
# Keep catalog evidence available without copying generated research build trees.
mkdir -p "$TEMP/repo/research/tools"
cp "$SOURCE/research/tools/catalog.py" "$TEMP/repo/research/tools/"
cp "$SOURCE/research/papers.yaml" "$SOURCE/research/papers.json" "$TEMP/repo/research/"
for area in "$SOURCE"/research/*; do
  [ ! -d "$area" ] || [ "${area##*/}" = tools ] || ln -s "$area" "$TEMP/repo/research/${area##*/}"
done
cd "$TEMP/repo"
git init -q
git config user.email test@example.com
git config user.name 'Review test'
git add scripts
git commit -qm fixture
git branch -M main
export TEST_SHA
a=$(git rev-parse HEAD)
TEST_SHA=$a
git init -q --bare "$TEMP/remote.git"
git remote add origin "$TEMP/remote.git"
git push -q origin main
cat > "$TEMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -eu
n=0
[ ! -f "$TEST_COUNT" ] || n=$(cat "$TEST_COUNT")
n=$((n+1))
echo "$n" > "$TEST_COUNT"
if [ "$n" -le "${TEST_LAG:-0}" ]; then
  printf '%040d\n' 0
else
  echo "$TEST_SHA"
fi
STUB
cat > "$TEMP/bin/reviewer" <<'STUB'
#!/usr/bin/env bash
set -eu
name=${0##*/}
[ "$(git rev-parse HEAD)" = "$TEST_SHA" ]
if git symbolic-ref -q HEAD >/dev/null; then exit 91; fi
[ -z "$(cat)" ]
echo "$name $*" >> "$TEST_LOG"
case "$name" in
  kimi) mode=$KIMI_MODE; [[ "$*" = '-p '* && "$*" != *--plan* ]];;
  grok) mode=$GROK_MODE; [[ "$*" = *'--permission-mode plan'* ]];;
  codex) mode=${CODEX_MODE:-ok}; [[ "$*" = *'--sandbox read-only'* ]];;
esac
case "$mode" in
  fail) echo 'provider unavailable' >&2; exit 7;;
  quota) echo 'HTTP 429: quota exceeded' >&2; exit 1;;
  empty) printf ' \n\t\n';;
  narration) printf '• Inspecting the diff\n• Checking tests\n';;
  auth) echo 'Please log in to continue.';;
  permission) echo 'May I access the repository?';;
  inaccessible) echo "I couldn't access the repository.";;
  unfinished) printf 'ready\n• Checking one more thing\n';;
  indented) printf '  - **should-fix — x**\n  ready after should-fix items  \n';;
  quotes) printf 'CI log: rate limit exceeded (HTTP 429), usage limit and quota noise.\nready after should-fix items\n';  echo 'gh: rate limit exceeded' >&2;;
  legacy) echo 'ready to merge';;
  ok)
    printf 'Reviewed content at %s\nA test failed in the proposed code.\n%s\n\n' "$(git rev-parse HEAD)" "${TEST_VERDICT:-not ready}"
    if [ -n "${TEST_BARRIER:-}" ]; then
      # Keep every raw file open after writing so all runs overlap publication.
      touch "$TEST_BARRIER/$TEST_RUN-$name"
      for ((i=0; i<200; i++)); do
        [ "$(find "$TEST_BARRIER" -type f | wc -l)" -lt 6 ] || exit 0
        sleep 0.05
      done
      echo 'overlap barrier timed out' >&2; exit 92
    fi;;
esac
STUB
chmod +x "$TEMP/bin/gh" "$TEMP/bin/reviewer"
for name in codex kimi grok; do ln -s reviewer "$TEMP/bin/$name"; done
export PATH="$TEMP/bin:$PATH" REVIEW_OUT="$TEMP/out" REVIEW_WORKTREES="$TEMP/worktrees"
export TEST_COUNT="$TEMP/count" TEST_LOG="$TEMP/log" REVIEW_SHA_INTERVAL=1 REVIEW_SHA_TIMEOUT=3
export KIMI_MODE=ok GROK_MODE=ok TEST_LAG=0
assert_clean() {
  [ "$(git worktree list --porcelain | grep -c '^worktree ')" -eq 1 ]
  [ -z "$(ls -A "$REVIEW_WORKTREES")" ]
  [ -z "$(git for-each-ref refs/review-runs/)" ]
}
run_case() {
  : > "$TEST_LOG"
  rm -f "$TEST_COUNT"
  local case_out
  case_out=$(mktemp -d "$TEMP/case.XXXXXX")
  REVIEW_OUT=$case_out bash scripts/review/review-pr.sh 123 '' "${TEST_PIN:-$TEST_SHA}"
  grep -Fx "REVIEWER: $1" "$case_out"/run-*/*.md
  grep -Fx "SHA: $TEST_SHA" "$case_out"/run-*/review-123-"${TEST_SHA:0:12}"-codex.md
  assert_clean
}
run_case Kimi
if grep -q '^grok ' "$TEST_LOG"; then exit 1; fi
KIMI_MODE=quota run_case Grok
KIMI_MODE=fail GROK_MODE=fail run_case 'adversarial Codex'
[ "$(grep -c '^codex ' "$TEST_LOG")" -eq 2 ]
KIMI_MODE=empty run_case Grok
for incomplete in narration auth permission inaccessible unfinished legacy; do
  KIMI_MODE=$incomplete run_case Grok
done
KIMI_MODE=narration GROK_MODE=narration run_case 'adversarial Codex'
for verdict in ready 'ready after should-fix items' 'not ready'; do
  TEST_VERDICT=$verdict run_case Kimi
done
TEST_PIN=${TEST_SHA:0:12} run_case Kimi
# A complete review that quotes quota or rate-limit text (e.g. from CI logs) still counts.
KIMI_MODE=quotes CODEX_MODE=quotes run_case Kimi
# Kimi indents its final verdict line; it still counts.
KIMI_MODE=indented run_case Kimi
KIMI_MODE=fail GROK_MODE=empty run_case 'adversarial Codex'
TEST_LAG=1 run_case Kimi
[ "$(cat "$TEST_COUNT")" -eq 2 ]
rm -f "$TEST_COUNT"
if TEST_LAG=99 REVIEW_SHA_TIMEOUT=1 bash scripts/review/review-pr.sh 123 '' "$TEST_SHA" > "$TEMP/timeout" 2>&1; then
  echo 'Expected SHA timeout' >&2; exit 1
fi
grep -q 'timed out' "$TEMP/timeout"
assert_clean
if KIMI_MODE=fail GROK_MODE=fail CODEX_MODE=fail bash scripts/review/review-pr.sh 123 '' "$TEST_SHA"; then
  echo 'Expected reviewer failure' >&2; exit 1
fi
assert_clean
if CODEX_MODE=narration bash scripts/review/review-pr.sh 123 '' "$TEST_SHA"; then
  echo 'Expected primary Codex failure despite successful Kimi' >&2; exit 1
fi
assert_clean
second_out=$(mktemp -d "$TEMP/second.XXXXXX")
REVIEW_OUT=$second_out bash scripts/review/review-second.sh 123 '' "$TEST_SHA"
[ "$(find "$second_out" -name '*-codex.md' | wc -l)" -eq 0 ]
assert_clean
# Distinct commits and repeated runs of the same commit must never share artifacts.
git commit -qm second --allow-empty
b=$(git rev-parse HEAD)
git push -q origin main
git update-ref refs/remotes/origin/main "$a"
printf 'preserve shared fetch state\n' > .git/FETCH_HEAD
cp .git/FETCH_HEAD "$TEMP/fetch-head"
mkdir "$TEMP/barrier"
export TEST_BARRIER="$TEMP/barrier"
concurrent_out=$(mktemp -d "$TEMP/concurrent.XXXXXX")
REVIEW_OUT=$concurrent_out TEST_SHA=$a TEST_RUN=a TEST_COUNT="$TEMP/count-a" bash scripts/review/review-pr.sh 123 '' "$a" > "$TEMP/run-a.log" 2>&1 & pid_a=$!
REVIEW_OUT=$concurrent_out TEST_SHA=$b TEST_RUN=b TEST_COUNT="$TEMP/count-b" bash scripts/review/review-pr.sh 123 '' "$b" > "$TEMP/run-b.log" 2>&1 & pid_b=$!
REVIEW_OUT=$concurrent_out TEST_SHA=$a TEST_RUN=c TEST_COUNT="$TEMP/count-c" bash scripts/review/review-pr.sh 123 '' "$a" > "$TEMP/run-c.log" 2>&1 & pid_c=$!
wait "$pid_a" || { cat "$TEMP/run-a.log"; exit 1; }
wait "$pid_b" || { cat "$TEMP/run-b.log"; exit 1; }
wait "$pid_c" || { cat "$TEMP/run-c.log"; exit 1; }
unset TEST_BARRIER
[ "$(git rev-parse origin/main)" = "$a" ]
cmp .git/FETCH_HEAD "$TEMP/fetch-head"
python3 - "$concurrent_out" "$a" "$b" <<'CHECK'
from pathlib import Path
import sys
root = Path(sys.argv[1])
assert len(list(root.iterdir())) == 3
reviews = list(root.glob('run-*/*.md'))
assert len(reviews) == 6
seen = []
for review in reviews:
    text = review.read_text()
    sha = text.splitlines()[1].removeprefix('SHA: ')
    assert f'Reviewed content at {sha}\n' in text, text
    assert review.name.startswith(f'review-123-{sha[:12]}-')
    assert text.rstrip().endswith('not ready')
    seen.append(sha)
assert seen.count(sys.argv[2]) == 4 and seen.count(sys.argv[3]) == 2
assert not list(root.rglob('*.tmp'))
CHECK
assert_clean
bash scripts/review/record-review.sh shauer-2025 Kimi "$TEST_SHA" 'ready to merge'
bash scripts/review/record-review.sh shauer-2025 Grok "$TEST_SHA" 'not ready'
python3 research/tools/catalog.py --offline
python3 - <<'PY'
import yaml
from research.tools.catalog import check_reviews
with open('research/papers.yaml') as f:
    reviews = yaml.safe_load(f)['papers'][0]['reviews']
assert len(reviews) == 2
assert [r['reviewer'] for r in reviews] == ['Kimi', 'Grok']
assert check_reviews([])
for invalid in (None, {}, [None], [{'reviewer': 'Kimi', 'sha': 'bad', 'verdict': 'ready to merge'}]):
    assert not check_reviews(invalid)
PY
# Exercise an existing block-style list, not only the flow list written above.
python3 - <<'PYBLOCK'
from pathlib import Path
import yaml
p = Path('research/papers.yaml')
p.write_text(yaml.safe_dump(yaml.safe_load(p.read_text()), sort_keys=False))
PYBLOCK
bash scripts/review/record-review.sh shauer-2025 Codex "$TEST_SHA" 'ready after should-fix items'
python3 research/tools/catalog.py --offline
cp research/papers.yaml "$TEMP/before.yaml"
if bash scripts/review/record-review.sh shauer-2025 Kimi invalid 'ready to merge'; then exit 1; fi
cmp research/papers.yaml "$TEMP/before.yaml"
echo 'review scripts: all tests passed'
