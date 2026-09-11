/**
 * The seven states, and the zero that must never be invented.
 *
 * ── What these are written against ─────────────────────────────────
 *
 * `FloorFamiliesPanel` computed its family counts as `floorRun?.slabs.length ?? 0`. With no
 * run that is `0`, rendered in the tab exactly like a real zero — so a project that had never
 * been through the floor pass reported that it had NO SLABS. That is a statement about the
 * building, and it was a statement about the button.
 *
 * So the load-bearing assertion in this file is not "the count is right". It is that an
 * unknown count is `null` and never `0`, and that the two readings a `0` used to conflate —
 * "nobody looked" and "we looked and found none" — are now different states with different
 * words.
 */

import { describe, it, expect } from 'vitest';
import {
  floorFamilyStates, offFamilyShells,
  type FloorFamilyInput, type FloorFamilyKey,
} from '../floor-family-state';

const VALIDATED = { maturity: { level: 'VALIDATED' }, unsupported: [] };

/** A run that classified nothing and designed nothing, for building up from. */
const emptyRun = {
  slabs: [], walls: [], classifications: [], unsupported: [],
};

function input(over: Partial<FloorFamilyInput> = {}): FloorFamilyInput {
  return {
    run: null,
    readiness: { shellCount: 0 },
    footingCount: 0,
    footingRun: null,
    error: null,
    ...over,
  };
}

const of = (r: ReturnType<typeof floorFamilyStates>, k: FloorFamilyKey) =>
  r.find((x) => x.family === k)!;

describe('no figure is invented before the pass classifies anything', () => {
  it('a model with shells and no run reports notRun, with every count null', () => {
    const r = floorFamilyStates(input({ readiness: { shellCount: 12 } }));
    const slabs = of(r, 'slabs');
    expect(slabs.kind).toBe('notRun');
    // The whole point: null, not 0.
    expect(slabs.classified).toBeNull();
    expect(slabs.designed).toBeNull();
    expect(slabs.refused).toBeNull();
    expect(slabs.skipped).toBeNull();
    expect(slabs.countsUnavailable).toBe(true);
  });

  it('never returns 0 for a count it cannot state', () => {
    // Swept across every family and every unknown path, because a single `?? 0` reintroduced
    // anywhere is the entire defect back.
    for (const inp of [
      input({ readiness: { shellCount: 5 } }),                       // notRun
      input({ readiness: { shellCount: 0 } }),                       // noElements
      input({ readiness: { shellCount: 5 }, error: 'boom' }),        // error
    ]) {
      for (const st of floorFamilyStates(inp)) {
        for (const k of ['classified', 'designed', 'refused', 'skipped'] as const) {
          expect(st[k], `${st.family}.${k} on ${st.kind}`).not.toBe(0);
          expect(st[k], `${st.family}.${k} on ${st.kind}`).toBeNull();
        }
      }
    }
  });

  it('distinguishes "nobody looked" from "we looked and found none"', () => {
    const notRun = of(floorFamilyStates(input({ readiness: { shellCount: 4 } })), 'slabs');
    const lookedAndFoundNone = of(floorFamilyStates(input({
      readiness: { shellCount: 4 },
      run: { ...emptyRun, classifications: [{ elementId: 1, family: 'wall' }] },
    })), 'slabs');

    expect(notRun.kind).toBe('notRun');
    expect(notRun.classified).toBeNull();
    // A real zero: the run classified, and none of them was a slab.
    expect(lookedAndFoundNone.classified).toBe(0);
    expect(lookedAndFoundNone.countsUnavailable).toBe(false);
  });
});

describe('sin elementos — a fact about the model, not about the run', () => {
  it('reports noElements for shells with no run at all', () => {
    // Outranks notRun on purpose: telling someone their model has no walls is more useful
    // than telling them a pass has not run over the walls they do not have.
    const r = floorFamilyStates(input({ readiness: { shellCount: 0 } }));
    expect(of(r, 'slabs').kind).toBe('noElements');
    expect(of(r, 'walls').kind).toBe('noElements');
  });

  it('reports noElements for foundations when none are modelled', () => {
    expect(of(floorFamilyStates(input({ footingCount: 0 })), 'foundations').kind)
      .toBe('noElements');
  });

  it('and does NOT report noElements when footings exist but no run has happened', () => {
    const f = of(floorFamilyStates(input({ footingCount: 3 })), 'foundations');
    expect(f.kind).toBe('notRun');
    expect(f.designed).toBeNull();
  });
});

describe('designed, refused, skipped and provisional come from the run', () => {
  const threeSlabs = {
    ...emptyRun,
    classifications: [
      { elementId: 1, family: 'slab' as const },
      { elementId: 2, family: 'slab' as const },
      { elementId: 3, family: 'slab' as const },
    ],
  };

  it('designed counts the results, and clears when nothing is outstanding', () => {
    const r = floorFamilyStates(input({
      readiness: { shellCount: 3 },
      run: { ...threeSlabs, slabs: [VALIDATED, VALIDATED, VALIDATED] },
    }));
    const s = of(r, 'slabs');
    expect(s.kind).toBe('designed');
    expect(s.designed).toBe(3);
    expect(s.refused).toBe(0);
    expect(s.skipped).toBe(0);
  });

  it('refused names the elements the pass stopped on', () => {
    const r = floorFamilyStates(input({
      readiness: { shellCount: 3 },
      run: { ...threeSlabs, unsupported: [{ elementId: 1 }, { elementId: 2 }] },
    }));
    const s = of(r, 'slabs');
    expect(s.refused).toBe(2);
    // Nothing designed, so a refusal is the headline rather than a footnote.
    expect(s.kind).toBe('refused');
  });

  it('skipped is what was classified and then neither designed nor refused', () => {
    const r = floorFamilyStates(input({
      readiness: { shellCount: 3 },
      run: { ...threeSlabs, slabs: [VALIDATED], unsupported: [{ elementId: 2 }] },
    }));
    const s = of(r, 'slabs');
    // 3 classified − 1 designed − 1 refused = 1 outside the run's scope.
    expect(s.skipped).toBe(1);
  });

  it('provisional is a design that is not complete, and it outranks designed', () => {
    // Unvalidated maturity.
    const a = of(floorFamilyStates(input({
      readiness: { shellCount: 1 },
      run: {
        ...emptyRun,
        classifications: [{ elementId: 1, family: 'slab' }],
        slabs: [{ maturity: { level: 'ESTIMATED' }, unsupported: [] }],
      },
    })), 'slabs');
    expect(a.provisional).toBe(1);
    expect(a.kind).toBe('provisional');

    // Or a design naming conditions it could not cover.
    const b = of(floorFamilyStates(input({
      readiness: { shellCount: 1 },
      run: {
        ...emptyRun,
        classifications: [{ elementId: 1, family: 'slab' }],
        slabs: [{ maturity: { level: 'VALIDATED' }, unsupported: ['no punching data'] }],
      },
    })), 'slabs');
    expect(b.provisional).toBe(1);
    expect(b.kind).toBe('provisional');
  });

  it('missing maturity is provisional, not designed', () => {
    // The cautious default. An absent record must never read as a validated one.
    const s = of(floorFamilyStates(input({
      readiness: { shellCount: 1 },
      run: { ...emptyRun, classifications: [{ elementId: 1, family: 'slab' }], slabs: [{}] },
    })), 'slabs');
    expect(s.kind).toBe('provisional');
  });

  it('a mostly-designed family with one refusal does not report itself as clean', () => {
    // The failure mode: 40 designed and 1 refused reading as "designed" and burying the one
    // thing a reviewer has to look at.
    const s = of(floorFamilyStates(input({
      readiness: { shellCount: 3 },
      run: { ...threeSlabs, slabs: [VALIDATED, VALIDATED], unsupported: [{ elementId: 3 }] },
    })), 'slabs');
    expect(s.designed).toBe(2);
    expect(s.refused).toBe(1);
    expect(s.kind).not.toBe('designed');
  });
});

describe('inclined and degenerate shells are not dropped', () => {
  const run = {
    ...emptyRun,
    classifications: [
      { elementId: 1, family: 'slab' as const },
      { elementId: 2, family: 'inclined' as const },
      { elementId: 3, family: 'inclined' as const },
      { elementId: 4, family: 'degenerate' as const },
    ],
    slabs: [VALIDATED],
  };

  it('reports them separately from slabs, walls and refusals', () => {
    // Before this they were in no count anywhere: not in slabs[], not in walls[], and not in
    // the refusals unless they happened to raise one.
    const off = offFamilyShells(input({ readiness: { shellCount: 4 }, run }))!;
    expect(off.inclined).toBe(2);
    expect(off.degenerate).toBe(1);
    expect(off.total).toBe(3);
  });

  it('does not count them as slabs or walls', () => {
    const r = floorFamilyStates(input({ readiness: { shellCount: 4 }, run }));
    expect(of(r, 'slabs').classified).toBe(1);
    expect(of(r, 'walls').classified).toBe(0);
  });

  it('is null with no run — the same rule as every other count', () => {
    expect(offFamilyShells(input({ readiness: { shellCount: 4 } }))).toBeNull();
  });
});

describe('an error outranks every figure', () => {
  it('reports error for every family and states no counts', () => {
    // Figures on hand belong to the previous run. Showing them beside a failure would present
    // stale numbers as current ones.
    const r = floorFamilyStates(input({
      readiness: { shellCount: 9 }, footingCount: 4, error: 'floor pass threw',
      run: { ...emptyRun, classifications: [{ elementId: 1, family: 'slab' }], slabs: [VALIDATED] },
    }));
    for (const st of r) {
      expect(st.kind, st.family).toBe('error');
      expect(st.classified, st.family).toBeNull();
      expect(st.countsUnavailable, st.family).toBe(true);
    }
  });
});

describe('foundations read their own gate', () => {
  it('a null check is a refusal, not a zero', () => {
    const f = of(floorFamilyStates(input({
      footingCount: 3,
      footingRun: { outcomes: [{ check: {} }, { check: null }, { check: null }] },
    })), 'foundations');
    expect(f.designed).toBe(1);
    expect(f.refused).toBe(2);
  });

  it('a modelled footing absent from the outcomes is skipped, not refused', () => {
    const f = of(floorFamilyStates(input({
      footingCount: 5,
      footingRun: { outcomes: [{ check: {} }, { check: {} }] },
    })), 'foundations');
    expect(f.designed).toBe(2);
    expect(f.refused).toBe(0);
    expect(f.skipped).toBe(3);
  });
});
