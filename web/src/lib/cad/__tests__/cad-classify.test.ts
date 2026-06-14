import { describe, it, expect } from 'vitest';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { simplePlanDxf, PLAN_LAYERS, buildDxf, dxfLwPolyline, dxfLine, dxfCircle, dxfText } from './dxf-fixture';
import type { LayerMapping } from '../types';

function planDoc() {
  return parseCadDxf(simplePlanDxf(), 'plan.dxf');
}

describe('suggestLayerMappings', () => {
  it('suggests roles from the es/en name vocabulary with high confidence', () => {
    const doc = planDoc();
    const m = new Map(suggestLayerMappings(doc, 'm').map((x) => [x.layer, x]));

    expect(m.get(PLAN_LAYERS.columns)!.suggested).toBe('column');
    expect(m.get(PLAN_LAYERS.columns)!.confidence).toBe('high');
    expect(m.get(PLAN_LAYERS.beams)!.suggested).toBe('beam');
    expect(m.get(PLAN_LAYERS.walls)!.suggested).toBe('wall');
    expect(m.get(PLAN_LAYERS.slabs)!.suggested).toBe('slab');
    expect(m.get(PLAN_LAYERS.grid)!.suggested).toBe('grid');
    expect(m.get(PLAN_LAYERS.text)!.suggested).toBe('text');
    expect(m.get(PLAN_LAYERS.openings)!.suggested).toBe('opening');
  });

  it('defaults unknown layers to ignore (never guessed into the structure)', () => {
    const doc = planDoc();
    const m = new Map(suggestLayerMappings(doc, 'm').map((x) => [x.layer, x]));
    expect(m.get(PLAN_LAYERS.mystery)!.suggested).toBe('ignore');
    expect(m.get(PLAN_LAYERS.mystery)!.role).toBe('ignore');
  });

  it('uses geometry hints (small closed rects → column, medium confidence)', () => {
    const dxf = buildDxf({
      entities: [
        dxfLwPolyline('X1', [[0, 0], [0.3, 0], [0.3, 0.3], [0, 0.3]], true),
        dxfLwPolyline('X1', [[5, 5], [5.4, 5], [5.4, 5.4], [5, 5.4]], true),
      ].join('\n'),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const m = suggestLayerMappings(doc, 'm').find((x) => x.layer === 'X1')!;
    expect(m.suggested).toBe('column');
    expect(m.confidence).toBe('medium');
  });
});

describe('extractArchPlan', () => {
  it('extracts columns, beams, double-line walls, slabs, and openings from the fixture', () => {
    const doc = planDoc();
    const mappings = suggestLayerMappings(doc, 'm');
    const plan = extractArchPlan(doc, mappings, 'm');

    // 4 rect columns + 1 insert column
    expect(plan.columns.length).toBe(5);
    const rects = plan.columns.filter((c) => c.sizeSource === 'rect');
    expect(rects.length).toBe(4);
    for (const c of rects) {
      expect(c.b).toBeCloseTo(0.3, 6);
      expect(c.h).toBeCloseTo(0.3, 6);
    }
    const ins = plan.columns.find((c) => c.sizeSource === 'insert')!;
    expect(ins.at.x).toBeCloseTo(3, 6);
    expect(ins.b).toBeCloseTo(0.4, 6);

    // 4 perimeter beams; the arc is skipped with a curved warning.
    expect(plan.beams.length).toBe(4);
    expect(plan.skipped.some((s) => s.kind === 'arc' && s.reason === 'curvedNotConverted')).toBe(true);

    // Double-line tabique paired into one centerline with thickness 0.2.
    expect(plan.walls.length).toBe(1);
    expect(plan.walls[0].thicknessSource).toBe('paired');
    expect(plan.walls[0].thickness).toBeCloseTo(0.2, 6);
    const wy = (plan.walls[0].a.y + plan.walls[0].b.y) / 2;
    expect(wy).toBeCloseTo(2.1, 6);

    // One quad slab.
    expect(plan.slabs.length).toBe(1);
    expect(plan.slabs[0].isQuad).toBe(true);
    expect(plan.slabs[0].isRectilinear).toBe(true);

    // Opening captured, with the not-subtracted warning.
    expect(plan.openings.length).toBe(1);
    expect(plan.warnings).toContain('openingsNotSubtracted');

    // Grid lines preview-only.
    expect(plan.gridLines.length).toBe(2);
  });

  it('scales geometry by the chosen unit', () => {
    const dxf = buildDxf({
      insunits: 4,
      entities: dxfLine('VIGAS', 0, 0, 6000, 0),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'mm'), 'mm');
    expect(plan.beams.length).toBe(1);
    expect(plan.beams[0].b.x).toBeCloseTo(6, 9);
  });

  it('keeps unpaired wall lines as centerlines with default thickness', () => {
    const dxf = buildDxf({ entities: dxfLine('MUROS', 0, 0, 4, 0) });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.walls.length).toBe(1);
    expect(plan.walls[0].thicknessSource).toBe('default');
  });

  it('skips open polylines on slab layers with a reason', () => {
    const dxf = buildDxf({
      entities: dxfLwPolyline('LOSAS', [[0, 0], [4, 0], [4, 3]], false),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.slabs.length).toBe(0);
    expect(plan.skipped.some((s) => s.reason === 'slabNotClosed')).toBe(true);
  });

  it('approximates circular columns as equal-area squares (flagged)', () => {
    const dxf = buildDxf({ entities: dxfCircle('PILARES', 1, 1, 0.2) });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.columns.length).toBe(1);
    expect(plan.columns[0].sizeSource).toBe('circle');
    const side = plan.columns[0].b!;
    expect(side * side).toBeCloseTo(Math.PI * 0.2 * 0.2, 6);
  });

  it('chains column rectangles drawn as bare LINEs into columns', () => {
    // Two 0.2×0.4 column rects drawn line-by-line + one stray line.
    const rect = (x: number, y: number) => [
      dxfLine('PILARES', x, y, x + 0.2, y),
      dxfLine('PILARES', x + 0.2, y, x + 0.2, y + 0.4),
      dxfLine('PILARES', x + 0.2, y + 0.4, x, y + 0.4),
      dxfLine('PILARES', x, y + 0.4, x, y),
    ].join('\n');
    const dxf = buildDxf({
      entities: [rect(0, 0), rect(5, 0), dxfLine('PILARES', 9, 9, 9.4, 9)].join('\n'),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.columns.length).toBe(2);
    expect(plan.columns[0].b).toBeCloseTo(0.2, 9);
    expect(plan.columns[0].h).toBeCloseTo(0.4, 9);
    expect(plan.columns[0].at.x).toBeCloseTo(0.1, 9);
    expect(plan.skipped.filter((s) => s.reason === 'columnLinesUnchained').length).toBe(1);
  });

  it('pairs beam face lines into centerlines with mixed-pairing warning', () => {
    const dxf = buildDxf({
      entities: [
        dxfLine('VIGAS', 0, 0.0, 6, 0.0),   // face A
        dxfLine('VIGAS', 0, 0.2, 6, 0.2),   // face B → centerline y=0.1
        dxfLine('VIGAS', 10, 0, 10, 5),     // single-line beam axis
      ].join('\n'),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.beams.length).toBe(2);
    const horizontal = plan.beams.find((b) => Math.abs(b.a.y - b.b.y) < 1e-9)!;
    expect(horizontal.a.y).toBeCloseTo(0.1, 9);
    expect(plan.warnings).toContain('beamsMixedPairing');
  });

  it('beam tag texts on beam layers are not geometry and produce no skip noise', () => {
    const dxf = buildDxf({
      entities: [dxfLine('VIGAS', 0, 0, 6, 0), dxfText('VIGAS', 3, 0.1, 'V-101: 15x40')].join('\n'),
    });
    const doc = parseCadDxf(dxf, 'x.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    expect(plan.beams.length).toBe(1);
    expect(plan.skipped.length).toBe(0);
  });

  it('user overrides win: remapping a layer to ignore drops its entities', () => {
    const doc = planDoc();
    const mappings: LayerMapping[] = suggestLayerMappings(doc, 'm').map((m) =>
      m.layer === PLAN_LAYERS.walls ? { ...m, role: 'ignore' as const } : m,
    );
    const plan = extractArchPlan(doc, mappings, 'm');
    expect(plan.walls.length).toBe(0);
  });
});
