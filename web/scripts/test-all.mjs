/**
 * The full Vitest gate: two passes, both always run, either failure propagates.
 *
 * ── Why two passes and not one run ─────────────────────────────────
 *
 * The suite reported every assertion passing and still exited 1 with
 *
 *     [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * `onTaskUpdate` is the worker → coordinator RPC. It does not time out because a test is
 * slow; it times out because the COORDINATOR did not get scheduled in time to answer. The
 * coordinator is also the Vite module transformer for every worker, so starving it stalls
 * the whole run.
 *
 * Measured on this machine (8 cores, 16 GB) while the failure was reproducing:
 *
 *   7 forked workers        44–68 % CPU each
 *   nested `vite build`     78 % CPU, 1.75 GB RSS, plus its own esbuild children
 *   coordinator             25.8 % CPU  ← starved
 *   load average            29.7 on 8 cores (~3.7x oversubscribed)
 *
 * Two independent causes, and the fix addresses both:
 *
 *   1. The RPC budget is SIXTY seconds, so losing it means the coordinator went
 *      unschedulable for a full minute — not that a test was slow. With the default
 *      `forks` pool the coordinator is a separate process waiting on acks from its own
 *      CPU-bound children. The unit pass therefore runs on `threads`, where workers are
 *      worker_threads in the coordinator's own process and the ack is an in-process
 *      postMessage. Measured back to back under identical load:
 *
 *        forks    exit 1   73.07 s   216 files passed + Timeout calling "onTaskUpdate"
 *        threads  exit 0   82.82 s   216 files passed, zero RPC errors
 *
 *      Reproduced first, three times, so the pool was chosen against evidence rather than
 *      against a hunch: `forks` failed 2/2 contended runs and `threads` passed the third.
 *
 *   2. `e2e-hook-gating.test.ts` shells out to two real production builds. Each is itself
 *      a parallel rollup/esbuild job, so it does not occupy one worker slot, it occupies
 *      the machine. Measured at 58.9 s of a 60.3 s run — it defines the wall-clock floor
 *      on its own. It runs in its own serial pass, where it competes with nothing.
 *
 * A quiet machine passed either way (3/3 green before any change), which is exactly why
 * the reproduction had to be built first: without deliberate CPU contention the bug is
 * invisible and any change would have looked like it worked.
 *
 * Removing the build test from the general pass is NOT skipping it: the build pass runs it
 * with the same assertions, and this script fails if that pass fails. That matters because
 * the test is the only proof that a production artifact does not ship the browser-test
 * hooks.
 *
 * ── What was deliberately NOT done ─────────────────────────────────
 *
 * No RPC timeout was raised, no retry was added, no worker error was demoted to a warning,
 * no fixture was shrunk and no assertion was removed. Every one of those turns a real
 * signal off; none of them addresses a starved coordinator.
 */

import { spawnSync } from 'node:child_process';

/** Extra argv is forwarded to both passes; see `passWithNoTests` below. */
const forwarded = process.argv.slice(2);

/**
 * With a filter, a pass legitimately matches nothing — `npm test -- slab` selects unit
 * files only. Without one, an empty pass means the project globs are wrong and must fail.
 */
const filtered = forwarded.length > 0;

const PASSES = [
  { project: 'unit', label: 'unit + integration (bounded parallel pool)' },
  { project: 'build', label: 'production builds (serial, whole machine)' },
];

const results = [];

for (const pass of PASSES) {
  const args = ['vitest', 'run', '--project', pass.project,
    ...(filtered ? ['--passWithNoTests'] : []), ...forwarded];
  console.log(`\n\x1b[1m─── vitest: ${pass.project} — ${pass.label} ───\x1b[0m\n`);
  const started = Date.now();
  const r = spawnSync('npx', args, { stdio: 'inherit', shell: false });
  results.push({
    ...pass,
    code: r.status === null ? 1 : r.status,
    signal: r.signal ?? null,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  });
}

console.log('\n\x1b[1m─── vitest summary ───\x1b[0m');
for (const r of results) {
  const ok = r.code === 0;
  console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${r.project}`
    + `  ${r.seconds}s${r.signal ? `  (signal ${r.signal})` : ''}`);
}

// Either failure fails the gate. Reported after both passes have run, so one broken pass
// does not hide the state of the other.
const failed = results.filter((r) => r.code !== 0);
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${results.length} Vitest passes failed: `
    + failed.map((r) => r.project).join(', '));
  process.exit(1);
}
console.log(`\nAll ${results.length} Vitest passes green.`);
