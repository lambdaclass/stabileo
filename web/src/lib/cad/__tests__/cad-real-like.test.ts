// A plan the way a client's DXF arrives, built here so it always runs: layer names of the
// author's own ("EST-COL HºAº", not "PILARES"), columns as INSERTs of blocks, a title block
// far from the structure, and a header that says millimetres while the drawing is in metres.
//
// It walks the same shipped path as cad-real-dxf.test.ts (which needs the client files, kept
// out of the repo): the header unit gives a degenerate model that the diagnostics catch; the
// unit read from the extent, a crop and the role of each layer give a connected draft.
import { describe, it, expect } from 'vitest';
import { parseCadDxf, suggestUnitFromExtent } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { cropDoc } from '../infer';
import { buildDraft } from '../draft-build';
import { diagnoseDraft } from '../diagnostics';
import type { LayerMapping, RcDraftAssumptions } from '../types';
import { buildDxf, dxfLine, dxfLwPolyline, dxfInsert, dxfText, columnBlock } from './dxf-fixture';

const L = {
  columns: 'EST-COL HºAº',
  beams: 'EST-VIG 20x50',
  walls: 'ARQ-MUROS',
  rooms: 'ARQ-TXT LOCALES',
  dims: 'R&S COTAS',
  frame: 'ROTULO',
  junk: 'Defpoints',
};

/** Two bays by two of 5 m: nine columns, each an INSERT of one of two blocks. */
function realLikePlan(): string {
  const xs = [0, 5, 10], ys = [0, 5, 10];
  const ents: string[] = [];
  let k = 0;
  for (const x of xs) for (const y of ys) ents.push(dxfInsert(L.columns, k++ % 2 ? 'COL 40x40' : 'C-HA-1', x, y));
  for (const y of ys) for (let i = 0; i < xs.length - 1; i++) ents.push(dxfLine(L.beams, xs[i]!, y, xs[i + 1]!, y));
  for (const x of xs) for (let i = 0; i < ys.length - 1; i++) ents.push(dxfLine(L.beams, x, ys[i]!, x, ys[i + 1]!));
  ents.push(dxfLine(L.walls, 0, 2.5, 10, 2.5), dxfLine(L.walls, 0, 2.7, 10, 2.7));
  ents.push(dxfText(L.rooms, 2, 7, 'ESTAR'), dxfText(L.rooms, 7, 7, 'COCINA'));
  ents.push(dxfLine(L.dims, 0, -1, 10, -1), dxfText(L.dims, 5, -1.2, '10.00'));
  // The sheet's frame and title block, far to the right as on a printed layout.
  ents.push(dxfLwPolyline(L.frame, [[60, -20], [120, -20], [120, 30], [60, 30]], true), dxfText(L.frame, 100, -15, 'PLANTA ESTRUCTURA'));
  ents.push(dxfLine(L.junk, 0, 0, 0.001, 0.001));
  return buildDxf({
    insunits: 4, // millimetres, while every coordinate is in metres
    layers: Object.values(L).concat('0'),
    blocks: [columnBlock('C-HA-1'), columnBlock('COL 40x40')].join('\n'),
    entities: ents.join('\n'),
  });
}

function assumptions(): RcDraftAssumptions {
  return {
    nFloors: 1, storyHeights: [3], concreteGrade: 'H-30',
    columnSection: { b: 0.4, h: 0.4 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 7, liveLoad: 2, generateCombos: true, meshSlabs: true,
    meshMode: 'targetSize', meshTargetSize: 1.25, meshDivisions: 2,
    splitBeams: true, snapTolerance: 0.03, detectOffsets: true, offsetTolerance: 0.03,
  };
}
const roles = (mappings: LayerMapping[], by: Record<string, LayerMapping['role']>) => mappings.map((m) => (by[m.layer] ? { ...m, role: by[m.layer]! } : m));
const source = { fileName: 'cliente.dxf', importedAtIso: '2026-10-05T00:00:00Z' };

describe('a client-like DXF: author layer names, block columns, a wrong $INSUNITS', () => {
  const doc = parseCadDxf(realLikePlan(), 'cliente.dxf');

  it('reads the author layers and expands the column blocks', () => {
    for (const name of [L.columns, L.beams, L.frame]) expect(doc.layers.map((l) => l.name)).toContain(name);
    expect(doc.entities.length).toBeGreaterThan(25);
  });

  it('the extent says metres where the header says millimetres', () => {
    const s = suggestUnitFromExtent(doc.bbox, 'mm');
    expect(s).not.toBeNull();
    expect(s!.suggested).toBe('m');
  });

  it('taken in the header unit, the model is degenerate and the diagnostics say so', () => {
    const mappings = suggestLayerMappings(doc, 'mm');
    const plan = extractArchPlan(doc, mappings, 'mm');
    const d = diagnoseDraft(buildDraft({ plan, assumptions: assumptions(), source }));
    expect(d.level).not.toBe('ok');
  });

  it('in metres, cropped to the structure, with the layers named: nine columns and a connected frame', () => {
    const cropped = cropDoc(doc, { x0: -1, x1: 11, y0: -0.5, y1: 11 });
    const mappings = roles(suggestLayerMappings(cropped, 'm'), {
      [L.columns]: 'column', [L.beams]: 'beam', [L.walls]: 'ignore', [L.rooms]: 'ignore',
      [L.dims]: 'ignore', [L.frame]: 'ignore', [L.junk]: 'ignore',
    });
    const plan = extractArchPlan(cropped, mappings, 'm');
    expect(plan.columns.length).toBe(9);
    const draft = buildDraft({
      plan, assumptions: assumptions(), source,
      inference: { pruneDisconnectedBeams: true, inferSlabPanels: true, snapPanelsToColumns: true, pruneFloatingMembers: true },
    });
    const d = diagnoseDraft(draft);
    expect(d.checks.some((c) => c.id === 'disconnected')).toBe(false);
    expect(d.solvableShape).toBe(true);
    // Twelve beams between nine columns, nine columns: the frame as drawn.
    expect(draft.counts.columns).toBe(9);
    expect(draft.counts.beams).toBeGreaterThanOrEqual(12);
  });
});
