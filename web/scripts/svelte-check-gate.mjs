#!/usr/bin/env node
/**
 * svelte-check-gate.mjs — scoped `svelte-check` gate.
 *
 * WHY A SCOPED GATE
 * -----------------
 * `svelte-check` was introduced late: `tsc --noEmit` never reads `.svelte`
 * files, so every type error inside a Svelte component had been invisible to
 * all tooling. The first run reported 494 errors across 107 files, spread over
 * PRO, CAD, landing and other areas owned by different workstreams. Failing
 * the whole repository on day one would either block every commit or invite a
 * mass edit of code this workstream does not own — and mass-editing other
 * people's components to silence a checker is how real regressions get
 * introduced.
 *
 * So the gate is scoped instead of suppressed. Nothing is excluded from
 * checking and no compiler option is weakened: the full check still runs and
 * still prints everything (`npm run check`). This gate simply decides what is
 * allowed to FAIL a build today — the paths this workstream owns, which must
 * stay at zero errors.
 *
 * GUARDED_PATHS is meant to grow. Each phase that cleans an area adds it here,
 * and the repo-wide count in `npm run check` is the backlog. When the backlog
 * reaches zero the gate becomes repository-wide and this file can go away.
 *
 * Warnings are reported but never fail the gate — the Svelte 5 runes migration
 * emits many `state_referenced_locally` advisories that are not defects.
 */

import { spawn } from 'node:child_process';

/** Paths whose `svelte-check` ERRORS fail the build. Extend as areas are cleaned. */
const GUARDED_PATHS = [
  'src/components/edu/',
  'src/lib/engine/kinematic-2d.ts',
  'src/lib/engine/solve-diagnostics.ts',
  'src/lib/geometry/coordinate-system.ts',
  'src/lib/section/',
  'src/components/SectionStressPanel.svelte',
  'src/components/stress/CrossSectionDrawing.svelte',
  'src/lib/data/section-catalog.ts',
  'src/components/SectionChanger.svelte',
  'src/components/ProfileSelector.svelte',
  'src/components/tables/SectionsTable.svelte',
  // PRO's Specifications and drawn-section editors, written clean.
  'src/components/pro/spec/',
  'src/components/pro/section/',
];

const isGuarded = (file) => GUARDED_PATHS.some((p) => file.startsWith(p));

// `--output machine` lines look like:
//   <ts> ERROR "src/x.svelte" 12:3 "message"
//   <ts> COMPLETED 1109 FILES 494 ERRORS 194 WARNINGS 107 FILES_WITH_PROBLEMS
const DIAGNOSTIC = /^\d+ (ERROR|WARNING) "([^"]+)" (\d+:\d+) "(.*)"$/;
const SUMMARY = /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS (\d+) WARNINGS/;

const child = spawn(
  'npx',
  ['svelte-check', '--tsconfig', './tsconfig.json', '--output', 'machine'],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);

let buffer = '';
const guardedErrors = [];
let summary = null;

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) handleLine(line);
});

function handleLine(line) {
  const summaryMatch = SUMMARY.exec(line);
  if (summaryMatch) {
    summary = { files: +summaryMatch[1], errors: +summaryMatch[2], warnings: +summaryMatch[3] };
    return;
  }
  const match = DIAGNOSTIC.exec(line);
  if (!match) return;
  const [, severity, file, position, message] = match;
  if (severity === 'ERROR' && isGuarded(file)) {
    guardedErrors.push({ file, position, message: message.replace(/\\n/g, ' ') });
  }
}

child.on('close', (code) => {
  if (buffer) handleLine(buffer);

  console.log('\nsvelte-check gate — guarded paths:');
  for (const p of GUARDED_PATHS) console.log(`  ${p}`);

  if (summary) {
    console.log(
      `\nRepository-wide: ${summary.errors} errors, ${summary.warnings} warnings ` +
        `across ${summary.files} files (informational — run \`npm run check\` for detail).`,
    );
  } else if (code !== 0 && code !== 1) {
    console.error(`\nsvelte-check exited with code ${code} without a summary line.`);
    process.exit(code ?? 1);
  }

  if (guardedErrors.length === 0) {
    console.log('\n✓ No errors in guarded paths.\n');
    process.exit(0);
  }

  console.error(`\n✗ ${guardedErrors.length} error(s) in guarded paths:\n`);
  for (const e of guardedErrors) console.error(`  ${e.file}:${e.position}  ${e.message}`);
  console.error('');
  process.exit(1);
});
