/**
 * The calculation does not import design.
 *
 * The calculation and the contract are what can be published on their own; the design suite
 * (verifiers, detailing, connections, steel design, the CIRSOC 201/301 checkers) reads the
 * calculation's results through the contract. A calculation file that imports a design module
 * would take the suite with it, so this fails on any new crossing. The ones below are the
 * crossings that exist today, each with its reason; the list only shrinks.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CALC_FILES = [
  'lib/engine/solver-service.ts', 'lib/engine/solver-worker.ts', 'lib/engine/solver-pool.ts',
  'lib/engine/wasm-solver.ts', 'lib/engine/station-forces.ts', 'lib/engine/structural-bundle.ts',
  'lib/engine/solve-finish.ts', 'lib/engine/member-behaviour.ts', 'lib/engine/combinations-service.ts',
];
const CALC_DIRS = [
  'lib/engine/loads', 'lib/codes/cirsoc101', 'lib/codes/cirsoc102', 'lib/codes/cirsoc103',
  'lib/codes/cirsoc104', 'lib/codes/families', 'lib/design-contract',
];
const SUITE = [
  'lib/engine/design', 'lib/engine/detailing', 'lib/connection', 'lib/engine/steel', 'lib/codes/cirsoc201',
  'lib/engine/codes/argentina', 'lib/engine/station-design-forces', 'lib/engine/verification-service',
  'lib/engine/auto-verify',
];
/** Crossings that exist today. The Rust kernels' JS wrappers sit beside their design callers. */
const BASELINE = new Set([
  'lib/engine/wasm-solver.ts -> lib/engine/codes/argentina/rc-section-kernel',
  'lib/engine/wasm-solver.ts -> lib/engine/detailing/collision-kernel',
  // The CIRSOC 201 beam and CIRSOC 301 member checkers moved into the engine (main, #298 and #308):
  // the solver registers their Rust kernels at start, as it does the two above.
  'lib/engine/wasm-solver.ts -> lib/engine/codes/argentina/cirsoc201-beam-kernel',
  'lib/engine/wasm-solver.ts -> lib/engine/codes/argentina/cirsoc301-kernel',
  // The CIRSOC 201 section engine (main): the solver registers it at start, like the kernels above.
  'lib/engine/wasm-solver.ts -> lib/engine/codes/argentina/cirsoc201-engine',
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(SRC, dir))) {
    const p = join(dir, n);
    if (statSync(join(SRC, p)).isDirectory()) { if (n !== '__tests__') out.push(...walk(p)); }
    else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('the calculation does not import the design suite', () => {
  it('no calculation file imports a design module, beyond the recorded crossings', () => {
    const found: string[] = [];
    for (const f of [...CALC_FILES, ...CALC_DIRS.flatMap(walk)]) {
      const src = readFileSync(join(SRC, f), 'utf8');
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+[^;]*?from\s+'(\.[^']+)'/g)) {
        const target = relative(SRC, normalize(join(SRC, dirname(f), m[1]!)));
        if (SUITE.some((s) => target === s || target.startsWith(`${s}/`) || target.startsWith(s))) {
          found.push(`${f} -> ${target}`);
        }
      }
    }
    expect(found.filter((x) => !BASELINE.has(x))).toEqual([]);
  });
});
