/**
 * A metallic member does not enter the concrete pipeline, and a concrete one still does.
 *
 * ── The behaviour this replaces ────────────────────────────────────
 *
 * Measured on this branch at its base commit, with an IPE 300 at fy = 345 and complete
 * demands supplied:
 *
 *   ctxs.size               → 1              the steel member got a concrete context
 *   ctx.material.fc         → 345            its yield read as a concrete strength
 *   designMember(...)       → DEMAND_UNAVAILABLE with limiting ['missingMaterial']
 *                             and reason 'notConcrete'
 *
 * Nothing was ever certified — the adapter refused — so the app was safe. It was not
 * honest: the demand was available, the reason shown was the wrong one, and the member was
 * counted in every concrete total on the way past.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAllMemberContexts, buildAllMemberContextsUnfiltered,
  type ContextModelData,
} from '../member-context';
import { designMember } from '../candidate-search';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';

function mixedModel(): ContextModelData {
  return {
    nodes: new Map<number, any>([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 6, y: 0, z: 0 }],
      [3, { id: 3, x: 12, y: 0, z: 0 }],
    ]),
    elements: new Map<number, any>([
      // 1: steel. 2: concrete.
      [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
      [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 2, materialId: 2, type: 'frame' }],
    ]),
    sections: new Map<number, any>([
      [1, { id: 1, name: 'IPE 300', b: 0.15, h: 0.30 }],
      [2, { id: 2, name: 'V 20x40', b: 0.20, h: 0.40 }],
    ]),
    materials: new Map<number, any>([
      [1, { id: 1, name: 'Acero A572 Gr50', fy: 345 }],
      [2, { id: 2, name: 'H-25', fy: 25 }],
    ]),
    supports: new Map<number, any>([[1, { nodeId: 1, type: 'pinned' }]]),
  } as ContextModelData;
}

const demands = new Map<number, any>([1, 2].map((id) => [id, {
  elementId: id,
  demands: [
    { category: 'Mz+', value: 120, absValue: 120, station: 3, comboName: 'U1' },
    { category: 'Mz-', value: -40, absValue: 40, station: 0, comboName: 'U1' },
    { category: 'Vy', value: 80, absValue: 80, station: 0, comboName: 'U1' },
    { category: 'N_compression', value: -5, absValue: 5, station: 0, comboName: 'U1' },
  ],
}]));
const stations = new Map<number, any>([1, 2].map((id) => [id, {
  elementId: id, comboResults: [{ comboName: 'U1', stations: [] }],
}]));

describe('buildAllMemberContexts leaves metallic members out of the concrete pipeline', () => {
  const model = mixedModel();

  it('builds a context for the concrete member and not for the steel one', () => {
    const ctxs = buildAllMemberContexts(model, { demands, stations });
    expect([...ctxs.keys()]).toEqual([2]);
  });

  it('so the steel member cannot be counted as concrete that failed', () => {
    // `providedSummary` walks exactly this map. A steel hall used to report every one of
    // its members as an unavailable concrete member.
    const ctxs = buildAllMemberContexts(model, { demands, stations });
    expect(ctxs.size).toBe(1);
    expect(ctxs.get(1)).toBeUndefined();
  });

  it('records the family on the context it does build', () => {
    const ctxs = buildAllMemberContexts(model, { demands, stations });
    expect(ctxs.get(2)!.materialFamily).toBe('concrete');
  });

  it('still classifies the steel member when asked unfiltered, and marks it blocked', () => {
    const all = buildAllMemberContextsUnfiltered(model, { demands, stations });
    expect([...all.keys()].sort()).toEqual([1, 2]);
    const steel = all.get(1)!;
    expect(steel.materialFamily).toBe('steel');
    expect(steel.blocking).toContain('missingMaterial');
  });

  it('never lets a steel member reach a certificate, even unfiltered', () => {
    const all = buildAllMemberContextsUnfiltered(model, { demands, stations });
    const o = designMember(cirsoc201Adapter, all.get(1)!);
    expect(o.accepted).toBeUndefined();
    expect(o.certificate).toBeUndefined();
    expect(o.reasons.map((r) => r.key)).toContain('design.reason.notConcrete');
  });

  it('designs the concrete member exactly as before', () => {
    const ctxs = buildAllMemberContexts(model, { demands, stations });
    const o = designMember(cirsoc201Adapter, ctxs.get(2)!);
    // Whatever the search concludes, it is a CONCRETE conclusion reached with f'c = 25 —
    // not a refusal caused by this change.
    expect(o.elementId).toBe(2);
    expect(ctxs.get(2)!.material.fc).toBe(25);
    expect(o.reasons.map((r) => r.key)).not.toContain('design.reason.notConcrete');
  });
});

describe('a declared grade overrides the magnitude here too', () => {
  it('keeps a concrete member with a steel-looking fy out of the pipeline when declared steel', () => {
    const model = mixedModel();
    (model.materials.get(2) as { gradeId?: string }).gradeId = 'en-s355';
    const ctxs = buildAllMemberContexts(model, {
      demands, stations, lookupGrade: (id) => (id === 'en-s355' ? 'steel' : null),
    });
    expect([...ctxs.keys()]).toEqual([]);
  });

  it('and lets a declared concrete grade in regardless of what the number looks like', () => {
    const model = mixedModel();
    (model.materials.get(1) as { gradeId?: string }).gradeId = 'h50';
    const ctxs = buildAllMemberContexts(model, {
      demands, stations, lookupGrade: (id) => (id === 'h50' ? 'concrete' : null),
    });
    expect([...ctxs.keys()].sort()).toEqual([1, 2]);
  });
});

describe('a member with no material at all', () => {
  it('stays in the table, blocked on the missing material, instead of vanishing', () => {
    // `unknown` is not metallic — it is unfinished input, and dropping it would make
    // "you forgot to set a material" look like "this member does not exist".
    const model = mixedModel();
    model.materials.delete(1);
    const ctxs = buildAllMemberContexts(model, { demands, stations });
    expect([...ctxs.keys()].sort()).toEqual([1, 2]);
    const ctx = ctxs.get(1)!;
    expect(ctx.materialFamily).toBe('unknown');
    expect(ctx.blocking).toContain('missingMaterial');
  });

  it('but the steel member stays excluded', () => {
    // The pass-through is for `unknown` only; the metallic exclusion is unchanged.
    const ctxs = buildAllMemberContexts(mixedModel(), { demands, stations });
    expect([...ctxs.keys()]).toEqual([2]);
  });
});
