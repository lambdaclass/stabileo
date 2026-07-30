/**
 * The callbacks cannot be positionally confused, because there are no positions.
 *
 * ── The defect this replaces ───────────────────────────────────────
 *
 * `detectCollisions` took `(bars, tolerances, requiredClearFor, classifyFor, placementFor)`.
 * `classifyFor` was inserted ahead of `placementFor` after `floor-design.ts` was written,
 * and that call site went on passing four arguments — so `placementFor` landed in the
 * classifier's slot. Every pair then returned a `number` where a `PairClassification` was
 * expected and the whole whole-floor check silently inverted.
 *
 * Nothing failed loudly. That is the point: both callbacks take two `BarPath`s, so the
 * swap typechecks at the call site, and the wrong one is only detectable by its effect.
 *
 * ── Why this file is a SOURCE gate as well as a behavioural one ────
 *
 * A behavioural test cannot see the defect. The bug was not "the function computes the
 * wrong answer" — the function was fine — it was "the call site can hand it the wrong
 * thing and be believed". So the shape of the API is what has to be pinned: the day
 * someone adds a positional overload "for convenience", the defect class is back, and the
 * behavioural tests below would all still pass.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_TOLERANCES, detectCollisions, type DetectCollisionsOptions,
} from '../collision';
import { buildStraightBarWithHooks, type BarPath } from '../../../codes/cirsoc201/bar-geometry';

const HERE = dirname(fileURLToPath(import.meta.url));
const COLLISION_SRC = resolve(HERE, '../collision.ts');
const FLOOR_SRC = resolve(HERE, '../floor-design.ts');

/** Comment bodies discuss the old positional form; only real code should be scanned. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Split a parameter or argument list on TOP-LEVEL commas, ignoring a trailing one. */
function topLevelArgs(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    // `<`/`>` are deliberately NOT treated as brackets: `=>` appears in every callback
    // type here and would drive the depth negative.
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/** Every call to `name`, as its top-level argument list. */
function callArgs(src: string, name: string): string[][] {
  const out: string[][] = [];
  const needle = `${name}(`;
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) {
    // Skip the declaration itself and any longer identifier ending in `name`.
    if (/[A-Za-z0-9_$]/.test(src[i - 1] ?? '')) continue;
    let depth = 0;
    let end = -1;
    for (let k = i + needle.length - 1; k < src.length; k++) {
      if ('([{'.includes(src[k])) depth++;
      else if (')]}'.includes(src[k])) { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end === -1) continue;
    out.push(topLevelArgs(src.slice(i + needle.length, end)));
  }
  return out;
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'wasm') continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|svelte)$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function bar(id: string, y: number, dia = 20): BarPath {
  return buildStraightBarWithHooks({
    id, diameterMm: dia, role: 'longitudinal',
    start: { x: 0, y, z: 0 }, end: { x: 2, y, z: 0 },
    axis: { x: 1, y: 0, z: 0 }, hookNormal: { x: 0, y: 0, z: 1 },
    ownerElementIds: [1], edition: '2025',
  });
}

describe('detectCollisions takes named options', () => {
  it('accepts every knob by name and nothing by position', () => {
    // If any of these were still positional this object would be the SECOND argument and
    // would be read as `tolerances`, so the call would not behave as asserted below.
    const opts: DetectCollisionsOptions = {
      tolerances: DEFAULT_TOLERANCES,
      requiredClearFor: () => 0.025,
      placementFor: () => 0,
      prune: true,
    };
    expect(() => detectCollisions([bar('a', 0), bar('b', 0.2)], opts)).not.toThrow();
  });

  it('the source exposes exactly one, two-parameter signature', () => {
    const src = readFileSync(COLLISION_SRC, 'utf8');
    const decls = [...src.matchAll(/export function detectCollisions\s*\(([\s\S]*?)\n\)\s*:/g)];
    expect(decls).toHaveLength(1);
    expect(topLevelArgs(decls[0][1])).toEqual([
      'bars: readonly BarPath[]',
      'opts: DetectCollisionsOptions = {}',
    ]);
  });

  it('no call anywhere in the repo passes a third argument', () => {
    // A third argument is the defect returning. Swept across every source file rather than
    // the two production callers, because a TEST that does it teaches the pattern back.
    const offenders: string[] = [];
    for (const file of sourceFiles(resolve(HERE, '../../../..'))) {
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const call of callArgs(src, 'detectCollisions')) {
        if (call.length > 2) offenders.push(`${file}: ${call.length} args`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the classifier and the placement callback are not interchangeable', () => {
  // Two bars 45 mm apart centre to centre: 25 mm of surface clearance for Ø20, which the
  // default 25 mm requirement makes a marginal case rather than an obvious one.
  const pair = [bar('a', 0), bar('b', 0.045)];

  it('placementFor returns a number and only ever shifts the allowance', () => {
    const none = detectCollisions(pair, {
      tolerances: { placement: 0, requiredClear: 0.030, marginalBand: 0.001 },
      placementFor: () => 0,
    });
    const generous = detectCollisions(pair, {
      tolerances: { placement: 0, requiredClear: 0.030, marginalBand: 0.001 },
      placementFor: () => 0.010,
    });
    // The allowance is deducted from the achieved clearance, so a bigger allowance can only
    // make the pair look worse — never better, and never change what class it is.
    expect(none.conflicts.length).toBeLessThanOrEqual(generous.conflicts.length);
  });

  it('classifyFor returns a classification and can declare a pair unreportable', () => {
    const r = detectCollisions(pair, {
      tolerances: { placement: 0, requiredClear: 0.030, marginalBand: 0.001 },
      classifyFor: () => ({
        pairClass: 'orthogonalCrossing', requiredClear: 0, reportable: false, refs: [],
        labelKey: 'detailing.pairClass.orthogonalCrossing',
      }),
    });
    expect(r.conflicts).toEqual([]);
  });

  it('a placement callback in the classifier slot would be a type error, not a silent swap', () => {
    const placementFor = (_a: BarPath, _b: BarPath) => 0.010;
    // @ts-expect-error a `number`-returning callback is not a `PairClassification` one.
    const bad: DetectCollisionsOptions = { classifyFor: placementFor };
    expect(bad).toBeTruthy();
  });
});

describe('floor-design consumes the authoritative classifier', () => {
  it('does not re-implement the spacing rules with its own callbacks', () => {
    // The floor pass used to carry a private `isParallel` + `requiredClearFor` pair that
    // restated, less completely, what `classifyPair` already decides. Two copies of one
    // rule set is how the families drifted apart in the first place.
    const src = readFileSync(FLOOR_SRC, 'utf8');
    expect(src).toMatch(/classifyPair/);
    expect(src).not.toMatch(/function isParallel/);
    expect(src).not.toMatch(/minClearSpacingInLayer/);
  });
});
