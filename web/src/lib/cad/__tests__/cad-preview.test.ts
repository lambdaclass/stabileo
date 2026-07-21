// PR [14] QA polish — pure view-math for the interactive DXF preview
// (fit-to-extents, wheel zoom about the cursor, drag pan, crop overlay bounds).
// Canvas drawing itself is not unit-tested; the transform math is.
import { describe, it, expect } from 'vitest';
import {
  fitView, zoomAround, panView, screenToWorld, cropScreenRect,
  planBBox, semanticPreviewStats,
} from '../preview';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { buildStabileoTemplateDxf } from '../template';
import { buildDraft } from '../draft-build';
import type { LayerMapping, RcDraftAssumptions } from '../types';

const BBOX = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe('preview.fitView', () => {
  it('centers a bbox and scales it to fill the canvas minus padding', () => {
    const v = fitView(BBOX, 120, 120, 10);
    expect(v.scale).toBeCloseTo(10, 6); // (120 - 2*10) / 10
    // world (0,0) → bottom-left inside the pad; world (10,10) → top-right.
    const X = (x: number) => x * v.scale + v.offsetX;
    const Y = (y: number) => -y * v.scale + v.offsetY;
    expect(X(0)).toBeCloseTo(10, 6);
    expect(X(10)).toBeCloseTo(110, 6);
    expect(Y(10)).toBeCloseTo(10, 6); // CAD y-up flips to canvas top
    expect(Y(0)).toBeCloseTo(110, 6);
  });

  it('never divides by zero on a degenerate (zero-area) bbox', () => {
    const v = fitView({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 100, 100, 8);
    expect(Number.isFinite(v.scale)).toBe(true);
    expect(Number.isFinite(v.offsetX)).toBe(true);
    expect(Number.isFinite(v.offsetY)).toBe(true);
  });
});

describe('preview.zoomAround', () => {
  it('keeps the world point under the cursor fixed while zooming', () => {
    const v = fitView(BBOX, 120, 120, 10);
    const before = screenToWorld(v, 72, 41);
    const zoomedIn = zoomAround(v, 72, 41, 1.15);
    const zoomedOut = zoomAround(v, 72, 41, 1 / 1.15);
    const a = screenToWorld(zoomedIn, 72, 41);
    const b = screenToWorld(zoomedOut, 72, 41);
    expect(a.x).toBeCloseTo(before.x, 6);
    expect(a.y).toBeCloseTo(before.y, 6);
    expect(b.x).toBeCloseTo(before.x, 6);
    expect(b.y).toBeCloseTo(before.y, 6);
    expect(zoomedIn.scale).toBeCloseTo(v.scale * 1.15, 6);
  });
});

describe('preview.panView', () => {
  it('shifts the view by a screen-space delta', () => {
    const v = fitView(BBOX, 120, 120, 10);
    const panned = panView(v, 15, -7);
    // The world point that was at (60,60) is now at (75,53).
    const w0 = screenToWorld(v, 60, 60);
    const w1 = screenToWorld(panned, 75, 53);
    expect(w1.x).toBeCloseTo(w0.x, 6);
    expect(w1.y).toBeCloseTo(w0.y, 6);
  });
});

describe('preview.screenToWorld', () => {
  it('is the exact inverse of the world→screen transform', () => {
    const v = { scale: 3.5, offsetX: 22, offsetY: 88 };
    const X = (x: number) => x * v.scale + v.offsetX;
    const Y = (y: number) => -y * v.scale + v.offsetY;
    const w = screenToWorld(v, X(4.2), Y(-1.3));
    expect(w.x).toBeCloseTo(4.2, 6);
    expect(w.y).toBeCloseTo(-1.3, 6);
  });
});

describe('preview.cropScreenRect', () => {
  it('maps a crop window to a normalized screen rectangle (y-flipped)', () => {
    const v = fitView(BBOX, 120, 120, 10); // scale 10, offX 10, offY 110
    const r = cropScreenRect(v, { x0: 2, x1: 8, y0: 1, y1: 9 });
    expect(r.left).toBeCloseTo(30, 6);
    expect(r.width).toBeCloseTo(60, 6);
    expect(r.top).toBeCloseTo(20, 6);   // Y(9) = 110 - 90
    expect(r.height).toBeCloseTo(80, 6); // Y(1) - Y(9) = 100 - 20
  });

  it('normalizes reversed crop bounds (x1<x0 / y1<y0)', () => {
    const v = fitView(BBOX, 120, 120, 10);
    const r = cropScreenRect(v, { x0: 8, x1: 2, y0: 9, y1: 1 });
    expect(r.left).toBeCloseTo(30, 6);
    expect(r.width).toBeCloseTo(60, 6);
    expect(r.height).toBeCloseTo(80, 6);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});

// ── Live "mapping consequence" preview (semantic extraction from mappings) ──
function assumptions(over: Partial<RcDraftAssumptions> = {}): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.3, h: 0.3 }, beamSection: { b: 0.2, h: 0.4 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: true, meshSlabs: true,
    meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.02,
    ...over,
  };
}
const setRole = (m: LayerMapping[], layers: Set<string>, role: LayerMapping['role']) =>
  m.map((x) => (layers.has(x.layer) ? { ...x, role } : x));

describe('preview — semantic extraction reflects the current mapping', () => {
  const doc = parseCadDxf(buildStabileoTemplateDxf(), 'tpl.dxf');
  const mappings = suggestLayerMappings(doc, 'm');

  it('extracts columns, beams, slabs from the template mapping', () => {
    const plan = extractArchPlan(doc, mappings, 'm');
    const s = semanticPreviewStats(plan);
    expect(s.columns).toBeGreaterThan(0);
    expect(s.beams).toBeGreaterThan(0);
    expect(s.slabs).toBeGreaterThan(0);
    expect(planBBox(plan)).not.toBeNull();
  });

  it('keeps the polygon-footprint beam a beam in the extraction', () => {
    const plan = extractArchPlan(doc, mappings, 'm');
    expect(plan.beams.some((b) => b.geomSource === 'polygon')).toBe(true);
  });

  it('mapping a beam layer to ignore removes its contribution', () => {
    const plan = extractArchPlan(doc, mappings, 'm');
    const beamLayers = new Set(plan.beams.map((b) => b.srcLayer).filter((l): l is string => !!l));
    expect(beamLayers.size).toBeGreaterThan(0);
    const ignored = extractArchPlan(doc, setRole(mappings, beamLayers, 'ignore'), 'm');
    expect(semanticPreviewStats(ignored).beams).toBe(0);
  });

  it('re-mapping the same layers back to beam restores the geometry', () => {
    const plan = extractArchPlan(doc, mappings, 'm');
    const beamLayers = new Set(plan.beams.map((b) => b.srcLayer).filter((l): l is string => !!l));
    const restored = extractArchPlan(doc, setRole(mappings, beamLayers, 'beam'), 'm');
    expect(semanticPreviewStats(restored).beams).toBeGreaterThan(0);
  });

  it('polygon beam survives into the live draft build (preview-only, no store)', () => {
    const plan = extractArchPlan(doc, mappings, 'm');
    const draft = buildDraft({
      plan, assumptions: assumptions(),
      source: { fileName: 'tpl.dxf', importedAtIso: '1970-01-01T00:00:00.000Z' },
    });
    expect(draft.counts.beams).toBeGreaterThan(0);
  });

  it('planBBox is null for an empty plan', () => {
    const empty = extractArchPlan(doc, setRole(mappings, new Set(mappings.map((m) => m.layer)), 'ignore'), 'm');
    expect(planBBox(empty)).toBeNull();
  });
});
