// Opening-aware slab meshing (PR [9]): openings on opening layers must leave a
// real hole in the slab shell — no quad centroid inside the opening, exact
// mesh lines on rectilinear opening edges, and honest warnings for cases that
// cannot be cut exactly.
import { describe, it, expect } from 'vitest';
import { meshBreakpoints, meshRectWithOpenings, makeOpeningPoly } from '../geometry';
import { generateRcDraft } from '../draft';
import type { ArchPlan, RcDraftAssumptions, CadPt } from '../types';

const SOURCE = { fileName: 'op.dxf', importedAtIso: '2026-06-11T00:00:00.000Z' };

function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.4 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: false,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 4, splitBeams: true, snapTolerance: 0.01,
    ...over,
  };
}

/** Square slab on 4 corner columns, with one square opening in the middle. */
function planWithOpening(opening: CadPt[], slabSize = 6): ArchPlan {
  const s = slabSize;
  const cols: ArchPlan['columns'] = [
    { at: { x: 0, y: 0 }, sizeSource: 'default' },
    { at: { x: s, y: 0 }, sizeSource: 'default' },
    { at: { x: s, y: s }, sizeSource: 'default' },
    { at: { x: 0, y: s }, sizeSource: 'default' },
  ];
  const beams: ArchPlan['beams'] = [
    { a: { x: 0, y: 0 }, b: { x: s, y: 0 } },
    { a: { x: s, y: 0 }, b: { x: s, y: s } },
    { a: { x: s, y: s }, b: { x: 0, y: s } },
    { a: { x: 0, y: s }, b: { x: 0, y: 0 } },
  ];
  return {
    unit: 'm', mappings: [], columns: cols, beams, walls: [],
    slabs: [{ outline: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }], isQuad: true, isRectilinear: true }],
    openings: [{ outline: opening }],
    gridLines: [], schedules: [], warnings: [], skipped: [],
  };
}

function quadCentroids(draft: ReturnType<typeof generateRcDraft>): CadPt[] {
  const nodes = new Map(draft.snapshot.nodes.map(([id, n]) => [id, n]));
  return (draft.snapshot.quads ?? []).map(([, q]) => ({
    x: q.nodes.reduce((s, nid) => s + nodes.get(nid)!.x, 0) / 4,
    y: q.nodes.reduce((s, nid) => s + nodes.get(nid)!.y, 0) / 4,
  }));
}

describe('meshBreakpoints', () => {
  it('includes regular divisions and interior opening edges, merged & sorted', () => {
    // [0,6], 3 divisions → 0,2,4,6; opening edges 2.5, 4.5 inside.
    expect(meshBreakpoints(0, 6, 3, [2.5, 4.5])).toEqual([0, 2, 2.5, 4, 4.5, 6]);
  });
  it('drops edges on/outside the bounds and de-dups within tolerance', () => {
    expect(meshBreakpoints(0, 6, 2, [0, 6, 3.0000001])).toEqual([0, 3, 6]);
  });
});

describe('meshRectWithOpenings', () => {
  it('keeps cells around a rectangular opening and none inside it', () => {
    const panel = { minX: 0, minY: 0, maxX: 6, maxY: 6 };
    const op = makeOpeningPoly([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }])!;
    const { cells, droppedByOpening } = meshRectWithOpenings(panel, [
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 },
    ], 3, [op]);
    expect(droppedByOpening).toBeGreaterThan(0);
    // Opening edges (2 and 4) are mesh lines → the hole is exactly one cell.
    for (const c of cells) {
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
      expect(cx > 2 && cx < 4 && cy > 2 && cy < 4).toBe(false);
    }
    // Cell edges land exactly on the opening boundary.
    expect(cells.some((c) => Math.abs(c.maxX - 2) < 1e-9)).toBe(true);
    expect(cells.some((c) => Math.abs(c.minX - 4) < 1e-9)).toBe(true);
  });
});

describe('generateRcDraft — opening cut from slab', () => {
  it('a rectangular slab with a rectangular opening has quads around it and zero inside', () => {
    const draft = generateRcDraft(
      planWithOpening([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]),
      assumptions(), SOURCE,
    );
    expect(draft.counts.openingsDetected).toBe(1);
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    expect(draft.counts.slabQuads).toBeGreaterThan(0);
    for (const c of quadCentroids(draft)) {
      expect(c.x > 2 && c.x < 4 && c.y > 2 && c.y < 4).toBe(false);
    }
    expect(draft.warnings.map((w) => w.message)).toContain('openingsCut:1');
  });

  it('edge nodes around the opening are shared (welded), not duplicated', () => {
    const draft = generateRcDraft(
      planWithOpening([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]),
      assumptions(), SOURCE,
    );
    const keys = new Set<string>();
    for (const [, n] of draft.snapshot.nodes) {
      const k = `${n.x.toFixed(4)}|${n.y.toFixed(4)}|${(n.z ?? 0).toFixed(4)}`;
      expect(keys.has(k)).toBe(false);
      keys.add(k);
    }
    // The four opening corners exist as real shared mesh nodes.
    for (const [x, y] of [[2, 2], [4, 2], [4, 4], [2, 4]]) {
      expect([...draft.snapshot.nodes].some(([, n]) =>
        Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6 && (n.z ?? 0) === 3)).toBe(true);
    }
  });

  it('non-rectilinear opening: still no quad inside it, flagged approximate', () => {
    // Triangular opening — cannot become exact mesh lines.
    const draft = generateRcDraft(
      planWithOpening([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 4 }]),
      assumptions({ meshDivisions: 8 }), SOURCE,
    );
    expect(draft.counts.openingsCutFromSlabs).toBe(1);
    const msgs = draft.warnings.map((w) => w.message);
    expect(msgs).toContain('openingsCutApprox:1');
    // No cell centroid inside the triangle (approximate but never plated over).
    const inTri = (p: CadPt) => {
      const sign = (a: CadPt, b: CadPt, c: CadPt) => (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
      const A = { x: 2, y: 2 }, B = { x: 4, y: 2 }, C = { x: 3, y: 4 };
      const d1 = sign(p, A, B), d2 = sign(p, B, C), d3 = sign(p, C, A);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(neg && pos);
    };
    for (const c of quadCentroids(draft)) expect(inTri(c)).toBe(false);
  });

  it('ignoreOpenings override meshes solid and warns high-severity', () => {
    const draft = generateRcDraft(
      planWithOpening([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]),
      assumptions({ ignoreOpenings: true }), SOURCE,
    );
    expect(draft.counts.openingsCutFromSlabs).toBe(0);
    expect(draft.counts.openingsNotCut).toBe(1);
    const ignored = draft.warnings.find((w) => w.message === 'openingsIgnored:1');
    expect(ignored?.severity).toBe('error');
    // A quad now DOES cover the opening centre.
    expect(quadCentroids(draft).some((c) => c.x > 2 && c.x < 4 && c.y > 2 && c.y < 4)).toBe(true);
  });

  it('skewed slab with an opening is refused (shell skipped), not meshed solid', () => {
    const skew: ArchPlan = {
      ...planWithOpening([{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]),
      slabs: [{
        // Supported on its bottom edge (on the y=0 beam) but otherwise a
        // skewed (non-axis-aligned) quad containing the opening centroid → the
        // opening cannot be cut exactly, so the shell is refused (not solid).
        outline: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 6 }, { x: -1, y: 5 }],
        isQuad: true, isRectilinear: false,
      }],
    };
    const draft = generateRcDraft(skew, assumptions(), SOURCE);
    expect(draft.counts.slabQuads).toBe(0);            // shell refused
    expect(draft.counts.openingsNotCut).toBe(1);
    expect(draft.warnings.map((w) => w.message)).toContain('openingsNotCutSkewedSlab:1');
  });
});
