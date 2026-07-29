/**
 * No hidden bar-spacing margin may exist anywhere.
 *
 * The engine carried a hardcoded 10 mm and applied it as though it were part of the code
 * minimum. It was subtracted from every measured clearance, so a cage drawn exactly to
 * §25.2.1 failed its own check by that amount on every pair in every model; and it was
 * added to the acceptance threshold in the column candidate generator, which refused a
 * 28Ø12 column the verifier had already certified.
 *
 * The decided default is ZERO: CIRSOC's minimum clear spacing IS the construction
 * requirement. An engineer may raise the margin to get a more conservative cage. Nothing
 * may reintroduce one silently, so this gate reads the sources.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEFAULT_TOLERANCES } from '../collision';
import { DEFAULT_PLACEMENT_POLICY, DEFAULT_SPACING_MARGIN_M } from '../../../codes/cirsoc201/placement';
import { generateLayoutCandidates } from '../candidates';
import { generateColumnCandidates } from '../column-candidates';
import { minClearSpacingInLayer, minClearSpacingColumn } from '../../../codes/cirsoc201/spacing';

const SRC = new URL('../../../..', import.meta.url).pathname;
const DIRS = ['lib/engine/detailing', 'lib/codes/cirsoc201'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue;
      out.push(...walk(full));
    } else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('the default margin is zero, everywhere it could hide', () => {
  it('the placement policy adds nothing', () => {
    expect(DEFAULT_SPACING_MARGIN_M).toBe(0);
    expect(DEFAULT_PLACEMENT_POLICY.spacingAllowance).toBe(0);
  });

  it('the collision tolerance deducts nothing', () => {
    // This one was the most damaging: it silently reduced every measured clearance.
    expect(DEFAULT_TOLERANCES.placement).toBe(0);
  });

  it('no source defaults a spacing allowance to a nonzero literal', () => {
    const offenders: string[] = [];
    for (const file of DIRS.flatMap((d) => walk(join(SRC, d)))) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // `placementTolerance ?? 0.01`, `placement: 0.010`, `+ 0.010` on a spacing term.
      for (const m of src.matchAll(
        /(?:placement\w*|margin|allowance)\s*(?:[:?]{1,2}=?|\?\?)\s*(0?\.\d+)/gi,
      )) {
        if (Number(m[1]) !== 0) offenders.push(`${relative(SRC, file)}: ${m[0]}`);
      }
    }
    expect(offenders, 'a hidden spacing margin has been reintroduced').toEqual([]);
  });
});

describe('a code-minimum layout is accepted at the zero default', () => {
  it('beam candidates are pitched at the code minimum, not above it', () => {
    const code = minClearSpacingInLayer('2025', {
      barDiameterMm: 20, maxAggregateSizeMm: 19,
    }).minClear;
    const c = generateLayoutCandidates({
      count: 3, diameterMm: 20, clearWidth: 0.30, edition: '2025',
      maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: 0,
    });
    expect(c.length).toBeGreaterThan(0);
    // Exactly the code minimum, to the micron. Not the minimum plus something.
    expect(c[0].minClearInLayer - 0.020).toBeCloseTo(code, 6);
  });

  it('a positive project margin widens the pitch by exactly that amount', () => {
    const at0 = generateLayoutCandidates({
      count: 3, diameterMm: 20, clearWidth: 0.40, edition: '2025',
      maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: 0,
    })[0];
    const at10 = generateLayoutCandidates({
      count: 3, diameterMm: 20, clearWidth: 0.40, edition: '2025',
      maxAggregateSizeMm: 19, memberKind: 'beam', placementTolerance: 0.010,
    })[0];
    expect(at10.minClearInLayer - at0.minClearInLayer).toBeCloseTo(0.010, 6);
  });

  it('the 28Ø12 column is offered a cage at the zero default', () => {
    // Refused outright under the old constant. It was always code-legal.
    const cage = generateColumnCandidates({
      count: 28, diameterMm: 12, b: 0.5, h: 0.5, cover: 0.03, tieDiaMm: 8,
      edition: '2025', maxAggregateSizeMm: 19, placementTolerance: 0,
    });
    expect(cage.length).toBeGreaterThan(0);
    const code = minClearSpacingColumn('2025', {
      barDiameterMm: 12, maxAggregateSizeMm: 19,
    }).minClear;
    for (const c of cage) expect(c.minClear).toBeGreaterThanOrEqual(code - 1e-9);
  });
});
