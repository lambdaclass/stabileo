set -u
area=/root/audit/soundness-2026-11-11
for revision in 5397407e1^1; do
cd "$area/repo"
git worktree add --detach "$area/probe-$revision" "$revision"
cd "$area/probe-$revision"
mkdir -p engine/tests/metamorphic_corpus/nightly
cp "$area/repo/engine/tests/metamorphic_corpus/nightly"/issue-{1360,1361}.json engine/tests/metamorphic_corpus/nightly/
cp "$area/parent-tests.rs" engine/tests/metamorphic/audit_missing_regressions.rs
printf '\nmod audit_missing_regressions;\n' >> engine/tests/metamorphic/main.rs
nice -n 19 nix develop --command env CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="$area/target-probe-$revision" RUSTC_WRAPPER= cargo test --locked --release -p dedaliano-engine --test metamorphic audit_missing_regressions::audit_issue_136 -- --nocapture --test-threads=1 > "$area/probe-$revision.log" 2>&1
printf '%s status=%s\n' "$revision" "$?"
done
