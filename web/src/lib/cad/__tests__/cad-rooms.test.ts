// Room-/use-based live loads (PR [9]): label parser + per-quad assignment by
// nearest room label, with honest fallback to the global default L.
import { describe, it, expect } from 'vitest';
import { classifyRoomLabel, ROOM_CATEGORY_LOADS } from '../rooms';
import { generateRcDraft } from '../draft';
import type { ArchPlan, RcDraftAssumptions, CadPt } from '../types';

const SOURCE = { fileName: 'rooms.dxf', importedAtIso: '2026-06-12T00:00:00.000Z' };

describe('classifyRoomLabel', () => {
  it('maps Spanish room labels to CIRSOC use categories + loads', () => {
    expect(classifyRoomLabel('ESTAR')).toMatchObject({ category: 'living', q: 2.0 });
    expect(classifyRoomLabel('COMEDOR')).toMatchObject({ category: 'living' });
    expect(classifyRoomLabel('DORMITORIO')).toMatchObject({ category: 'private', q: 2.0 });
    expect(classifyRoomLabel('BAÑO')).toMatchObject({ category: 'private' });
    expect(classifyRoomLabel('COCINA')).toMatchObject({ category: 'private' });
    expect(classifyRoomLabel('BALCÓN')).toMatchObject({ category: 'balcony', q: 5.0 });
    expect(classifyRoomLabel('BALCON')).toMatchObject({ category: 'balcony', q: 5.0 });
    expect(classifyRoomLabel('COCHERA')).toMatchObject({ category: 'garage', q: 2.5 });
    expect(classifyRoomLabel('LOCAL')).toMatchObject({ category: 'commercial', q: 4.0 });
    expect(classifyRoomLabel('DEPÓSITO')).toMatchObject({ category: 'storage', q: 6.0 });
    expect(classifyRoomLabel('ESCALERA')).toMatchObject({ category: 'stair', q: 2.0 });
  });

  it('maps English equivalents and cleans MTEXT formatting', () => {
    expect(classifyRoomLabel('BEDROOM')).toMatchObject({ category: 'private' });
    expect(classifyRoomLabel('{\\fCentury Gothic|b0;ESTAR}')).toMatchObject({ category: 'living' });
    expect(classifyRoomLabel('\\pxqc;{\\Fromans|c129;OFICINA}')).toMatchObject({ category: 'office' });
  });

  it('returns null for non-room text (dimensions, project notes)', () => {
    expect(classifyRoomLabel('H = 2.40 m')).toBeNull();
    expect(classifyRoomLabel('PLANTA TIPO')).toBeNull();
    expect(classifyRoomLabel('V-101: 15x40')).toBeNull();
  });

  it('every category resolves to a load value', () => {
    for (const cat of ['living', 'private', 'stair', 'balcony', 'terrace', 'garage', 'office', 'commercial', 'storage']) {
      expect(typeof ROOM_CATEGORY_LOADS[cat]).toBe('number');
    }
  });
});

// ── Generator: per-quad live load by room ────────────────────

function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.4 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: false,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 4, splitBeams: true, snapTolerance: 0.01,
    roomBasedLiveLoads: true,
    ...over,
  };
}

/** 12×6 slab on 6 perimeter columns, two halves labeled ESTAR (left) and
 *  BALCON (right) so the two halves get different live loads. */
function twoRoomPlan(): ArchPlan {
  const cols: ArchPlan['columns'] = [
    { at: { x: 0, y: 0 }, sizeSource: 'default' }, { at: { x: 6, y: 0 }, sizeSource: 'default' },
    { at: { x: 12, y: 0 }, sizeSource: 'default' }, { at: { x: 0, y: 6 }, sizeSource: 'default' },
    { at: { x: 6, y: 6 }, sizeSource: 'default' }, { at: { x: 12, y: 6 }, sizeSource: 'default' },
  ];
  const beams: ArchPlan['beams'] = [
    { a: { x: 0, y: 0 }, b: { x: 12, y: 0 } }, { a: { x: 0, y: 6 }, b: { x: 12, y: 6 } },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 6 } }, { a: { x: 6, y: 0 }, b: { x: 6, y: 6 } },
    { a: { x: 12, y: 0 }, b: { x: 12, y: 6 } },
  ];
  return {
    unit: 'm', mappings: [], columns: cols, beams, walls: [],
    slabs: [{ outline: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 0, y: 6 }], isQuad: true, isRectilinear: true }],
    openings: [], gridLines: [], schedules: [],
    roomLabels: [
      { at: { x: 3, y: 3 }, category: 'living', q: 2.0, raw: 'ESTAR' },
      { at: { x: 9, y: 3 }, category: 'balcony', q: 5.0, raw: 'BALCON' },
    ],
    warnings: [], skipped: [],
  };
}

function quadLoad(draft: ReturnType<typeof generateRcDraft>) {
  const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
  const quadC = new Map<number, CadPt>();
  for (const [id, q] of draft.snapshot.quads ?? []) {
    quadC.set(id, {
      x: q.nodes.reduce((s, n) => s + nodes.get(n)!.x, 0) / 4,
      y: q.nodes.reduce((s, n) => s + nodes.get(n)!.y, 0) / 4,
    });
  }
  return (draft.snapshot.loads as Array<{ data: { quadId: number; q: number; caseId: number } }>)
    .filter((l) => l.data.caseId === 2)
    .map((l) => ({ c: quadC.get(l.data.quadId)!, q: l.data.q }));
}

describe('generateRcDraft — room-based live loads', () => {
  it('assigns each slab quad the live load of its nearest room label', () => {
    const draft = generateRcDraft(twoRoomPlan(), assumptions(), SOURCE);
    const loads = quadLoad(draft);
    expect(loads.length).toBeGreaterThan(0);
    for (const { c, q } of loads) {
      if (c.x < 6) expect(q).toBe(2.0);   // ESTAR half
      else expect(q).toBe(5.0);            // BALCON half
    }
    expect(draft.counts.liveLoadByCategory.living).toBeGreaterThan(0);
    expect(draft.counts.liveLoadByCategory.balcony).toBeGreaterThan(0);
    expect(draft.warnings.map((w) => w.message)).toContain('liveLoadsByRoom:2');
    expect(draft.warnings.map((w) => w.message)).toContain('roomBoundaryByNearestLabel');
  });

  it('quads with no nearby room label fall back to default L and are counted/warned', () => {
    // Only a far-corner label; most quads are beyond the 6 m reach.
    const plan = twoRoomPlan();
    plan.roomLabels = [{ at: { x: -50, y: -50 }, category: 'living', q: 2.0, raw: 'ESTAR' }];
    const draft = generateRcDraft(plan, assumptions(), SOURCE);
    expect(draft.counts.liveLoadDefaulted).toBeGreaterThan(0);
    expect(draft.warnings.map((w) => w.message).some((m) => m.startsWith('liveLoadDefaulted'))).toBe(true);
    for (const { q } of quadLoad(draft)) expect(q).toBe(2.0); // default L
  });

  it('records the load source + mapping in provenance', () => {
    const draft = generateRcDraft(twoRoomPlan(), assumptions(), SOURCE);
    const text = draft.provenance.assumptions.join('\n');
    expect(text).toContain('Live loads assigned by ROOM LABELS');
    expect(text).toContain('CIRSOC 101');
    expect(text).toMatch(/living 2 kN\/m²|balcony 5 kN\/m²/);
  });

  it('roof still carries Lr, not a room live load', () => {
    const draft = generateRcDraft(twoRoomPlan(), assumptions({ nFloors: 2, storyHeights: [3, 3], roofLiveLoad: 1 }), SOURCE);
    const roofLr = draft.snapshot.loads.filter((l) => (l.data as { caseId: number }).caseId === 3);
    expect(roofLr.length).toBeGreaterThan(0);
    for (const l of roofLr) expect((l.data as { q: number }).q).toBe(1);
  });
});

describe('generateRcDraft — regression: no room labels → global L unchanged', () => {
  it('with room-based ON but zero labels, behaves as global default L + warns', () => {
    const plan = twoRoomPlan(); plan.roomLabels = [];
    const draft = generateRcDraft(plan, assumptions(), SOURCE);
    for (const { q } of quadLoad(draft)) expect(q).toBe(2.0);
    expect(Object.keys(draft.counts.liveLoadByCategory).length).toBe(0);
    expect(draft.warnings.map((w) => w.message)).toContain('roomBasedRequestedNoLabels');
  });

  it('with room-based OFF, all floor quads carry the single global L (no per-room split)', () => {
    const draft = generateRcDraft(twoRoomPlan(), assumptions({ roomBasedLiveLoads: false }), SOURCE);
    for (const { q } of quadLoad(draft)) expect(q).toBe(2.0);
    expect(Object.keys(draft.counts.liveLoadByCategory).length).toBe(0);
    expect(draft.counts.liveLoadDefaulted).toBe(0);
  });
});
