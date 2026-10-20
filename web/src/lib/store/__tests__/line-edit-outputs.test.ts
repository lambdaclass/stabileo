/**
 * An edit made in the frame editor reaches the sheet, the bar schedule and the 3-D view as the
 * same bars, and survives a regeneration.
 *
 * The three outputs read one object, the issued document (`buildDocument`): the beam sheets draw
 * its marks, the bending schedule tabulates them, the 3-D view builds its scene from its bars. So
 * the test follows the edited bars through that object and through each reader, before and after
 * the detailing is laid again.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { detailingStore } from '../detailing.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { modelBeamLines } from '../frame-equalize';
import { openLine, saveLine } from '../beam-line-store';
import { addCut, cutBar, updateBar } from '../../engine/design/beam-line';
import { renderDrawings } from '../../engine/detailing/document-render';
import { sheetMembers } from '../detailing-sheet-inputs';
import { saveEntry } from '../special-elements';
import { setColumnLap, columnLapOf, modelColumnStacks } from '../column-stack-store';
import { buildSchedule } from '../../engine/detailing/drawings';
import { buildSceneModel } from '../../engine/detailing/scene-model';
import type { DocumentModel } from '../../engine/detailing/document-model';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'x2', name: '3', axis: 'x', at: 9 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

function designedFrame() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
}

/** What each output says about the bars laid from one line bar: [bar id, cutting length m, mark, schedule row length, in the 3-D scene]. */
function outputsOf(doc: DocumentModel, lineBarId: string): Array<[string, number, string, number, boolean]> {
  const scene = new Set(buildSceneModel(doc).bars.map((b) => b.barId));
  const out: Array<[string, number, string, number, boolean]> = [];
  for (const a of doc.assemblies) {
    const rows = buildSchedule(a.source.marks).rows;
    for (const b of a.bars) {
      if (!b.id.split('+').some((p) => p.includes(`-line-${lineBarId}-`))) continue;
      const mark = a.source.marks.find((m) => m.barIds.includes(b.id))!;
      const row = rows.find((r) => r.mark === mark.mark)!;
      out.push([b.id, +b.cuttingLength.toFixed(3), mark.mark, +mark.cuttingLength.toFixed(3), scene.has(b.id) && !!row]);
    }
  }
  return out.sort((p, q) => p[0].localeCompare(q[0]));
}

const issue = () => detailingStore.buildDocument({ author: 'QA', at: '2026-10-19T12:00:00Z' })!;

describe('an edit in the frame editor reaches every output', () => {
  it('the sheet, the schedule and the 3-D view show the edited bars, and a regeneration keeps them', () => {
    designedFrame();
    const line = modelBeamLines()[0]!;
    const open = openLine(line.members[0]!)!;
    const bottom = open.model.bars.find((b) => b.face === 'bottom' && b.from < 0.5 && b.to > 4)!;
    // In the frame editor: the bottom bar cut at 2,5 m with a 1,2 m lap, then the right bar's
    // start pulled back to 1,8 m (a 1,4 m lap), and saved.
    let next = cutBar(open.model, bottom.id, 2.5, 1.2);
    const right = next.bars.find((b) => b.face === 'bottom' && Math.abs(b.from - 1.9) < 1e-9)!;
    next = updateBar(next, right.id, { from: 1.8 });
    const left = next.bars.find((b) => b.face === 'bottom' && Math.abs(b.to - 3.1) < 1e-9)!;
    saveLine(line, next);
    detailingStore.generate();
    expect(detailingStore.lastError).toBeNull();

    const doc = issue();
    const L = outputsOf(doc, left.id), R = outputsOf(doc, right.id);
    expect(L).toHaveLength(bottom.count);
    expect(R).toHaveLength(bottom.count);
    // Every bar: its mark carries its cutting length to the schedule, and the 3-D scene has it.
    for (const [, cut, , markCut, seen] of [...L, ...R]) {
      expect(markCut).toBeCloseTo(cut, 3);
      expect(seen).toBe(true);
    }
    // Where the edit put them: the right bar starts at 1,8 m, the left one ends at 3,1 m.
    const xs = (id: string) => detailingStore.assemblies.flatMap((a) => a.bars).find((b) => b.id === id)!.segments.flatMap((s) => [s.start.x, s.end.x]);
    expect(Math.min(...xs(R[0]![0]))).toBeCloseTo(1.8, 3);
    expect(Math.max(...xs(L[0]![0]))).toBeCloseTo(3.1, 3);

    // A regeneration lays the same bars with the same marks and lengths.
    detailingStore.generate();
    const again = issue();
    expect(outputsOf(again, left.id)).toEqual(L);
    expect(outputsOf(again, right.id)).toEqual(R);
  });

  it('cross-sections placed on the line are drawn as sections on the beam sheets, and nowhere else', () => {
    designedFrame();
    const line = modelBeamLines()[0]!;
    const open = openLine(line.members[0]!)!;
    // Two sections placed with a click: at 1,0 m in the first span and at 7,0 m in the second.
    saveLine(line, addCut(addCut(open.model, 1.0), 7.0));
    detailingStore.generate();
    const doc = issue();
    expect(doc.sectionCuts?.map((c) => c.label)).toEqual(['A', 'B']);
    expect(doc.sectionCuts?.map((c) => +c.at.x.toFixed(3))).toEqual([1, 7]);
    const set = renderDrawings(doc, { locale: 'es', projectName: 'QA', members: sheetMembers() });
    const names = set.sheets.map((s) => s.name);
    expect(names.filter((n) => /-section-A$/.test(n))).toHaveLength(1);
    expect(names.filter((n) => /-section-B$/.test(n))).toHaveLength(1);
    // The assemblies with no placed cut keep their one section.
    expect(names.some((n) => /-section$/.test(n))).toBe(true);
    const a = set.sheets.find((s) => /-section-A$/.test(s.name))!;
    expect(a.caption).toMatch(/corte A/);
  });

  it('a web opening placed on a beam: no stirrup crosses it, and what its design asks is said', () => {
    designedFrame();
    const line = modelBeamLines()[0]!;
    const id = line.members[0]!;
    // A 0,40 m long opening centred 2,0 m from the member's i node.
    saveEntry('openings', { id: 'o1', elementId: id, x: 2.0, lo: 0.4, ho: 0.15 });
    const run = detailingStore.generate()!;
    const a = run.assemblies.find((x) => x.bars.some((b) => b.ownerElementIds.includes(id)))!;
    const e = modelStore.elements.get(id)!, ni = modelStore.nodes.get(e.nodeI)!;
    // The frame runs along x; the member's own position of a stirrup is its distance from the i node.
    const stirrupX = a.bars.filter((b) => b.role === 'transverse' && b.ownerElementIds.includes(id)).map((b) => Math.abs(b.segments[0]!.start.x - ni.x));
    expect(stirrupX.length).toBeGreaterThan(0);
    expect(stirrupX.filter((x) => x > 1.8 && x < 2.2)).toEqual([]);
    expect(JSON.stringify(a.unsupported)).toMatch(/Hueco en el alma en x = 1\.80–2\.20 m/);
  });

  it('a column lap set for a stack group is laid by the detailing, and one under the code\'s is reported', () => {
    designedFrame();
    const stack = modelColumnStacks().find((s) => s.lifts.length > 1)!;
    const lower = stack.lifts[0]!.id;
    const lapsOf = () => detailingStore.generate()!.assemblies.flatMap((a) => a.bars)
      .filter((b) => b.role === 'longitudinal' && b.ownerElementIds.includes(lower) && b.ownerElementIds.length === 1)
      .map((b) => { const zs = b.segments.flatMap((sg) => [sg.start.z, sg.end.z]); return Math.max(...zs); });
    const before = lapsOf();
    setColumnLap(lower, 1.5);
    expect(stack.lifts.every((l) => columnLapOf(l.id) === 1.5)).toBe(true);
    const longer = lapsOf();
    // The lower lift's bars now run 1,5 m past the end of their crank: above the 0,50 m beam
    // centred on the floor at 3 m (3,25 m) they turn inward by two Ø16 in contact over 6 × 16 mm
    // (§10.7.4.1), and the splice starts there.
    expect(Math.max(...longer)).toBeGreaterThan(Math.max(...before));
    expect(Math.max(...longer)).toBeCloseTo(3.25 + 0.096 + 1.5, 3);
    setColumnLap(lower, 0.2);
    const run = detailingStore.generate()!;
    expect(JSON.stringify(run.assemblies.map((a) => a.unsupported))).toMatch(/25\.5/);
    historyStore.undo();
    expect(columnLapOf(lower)).toBe(1.5);
  });
});
