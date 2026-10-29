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
  kimi) mode=$KIMI_MODE;;
  grok) mode=$GROK_MODE; [[ "$*" = *'--permission-mode plan'* ]];;
  codex) mode=${CODEX_MODE:-ok}; [[ "$*" = *'--sandbox read-only'* ]];;
esac
case "$mode" in
  fail) echo 'provider unavailable' >&2; exit 7;;
  quota) echo 'HTTP 429: quota exceeded' >&2;;
  empty) printf ' \n\t\n';;
  ok) printf 'A test failed in the proposed code.\nnot ready\n';;
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
}
run_case() {
  : > "$TEST_LOG"
  rm -f "$TEST_COUNT"
  bash scripts/review/review-pr.sh 123 '' "$TEST_SHA"
  grep -Fx "REVIEWER: $1" "$REVIEW_OUT/review-123-second.md"
  grep -Fx "SHA: $TEST_SHA" "$REVIEW_OUT/review-123-codex.md"
  assert_clean
}
run_case Kimi
! grep -q '^grok ' "$TEST_LOG"
KIMI_MODE=quota run_case Grok
KIMI_MODE=fail GROK_MODE=fail run_case 'adversarial Codex'
[ "$(grep -c '^codex ' "$TEST_LOG")" -eq 2 ]
KIMI_MODE=empty run_case Grok
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
if CODEX_MODE=fail bash scripts/review/review-pr.sh 123 '' "$TEST_SHA"; then
  echo 'Expected primary Codex failure despite successful Kimi' >&2; exit 1
fi
assert_clean
rm -f "$REVIEW_OUT/review-123-codex.md"
bash scripts/review/review-second.sh 123 '' "$TEST_SHA"
[ ! -e "$REVIEW_OUT/review-123-codex.md" ]
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
