/**
 * A saved beam line that no longer stands for its members is neither applied nor silently
 * dropped: it is listed with why, offered in the frame editor, and let go only on request.
 *
 * Before: `storedLine` compared only the members' bars. A line whose members were redesigned was
 * dropped without a word (the editor read the members again, the person's cuts and laps gone from
 * view), and a line whose members kept their bars while a node moved was APPLIED: the detailing cut
 * the bars at positions measured along the old geometry.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { placeFrame } from '../../model/building/build-on-grid';
import { modelBeamLines } from '../frame-equalize';
import { discardLine, openLine, reinforcementForVerification, saveLine, savedMemberCuts, staleLines } from '../beam-line-store';
import { cutBar } from '../../engine/design/beam-line';
import { applyPatch } from '../../engine/design/rebar-batch';
import { rebarHash } from '../../engine/design/rebar-hash';
import { setStirrups } from '../rebar-edit';
import type { ProvidedReinforcement, StirrupDef } from '../../design-contract/reinforcement';
import { lineKey } from '../../design-contract/beam-line';
import { storedDecisions } from '../design-decisions';
import type { StructuralGrid } from '../../model/grid';
import * as wasmSolver from '../../engine/wasm-solver';
import { applySeismicDetailing, runSeismicChecks, setSeismicRole } from '../seismic-design.svelte';
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

function solveAndDesign() {
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
}

/** The two-bay frame of `beam-line.test.ts`, designed, with its first line edited and saved. */
function savedEditedLine() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  stateSuiteLateral();
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y0'], levels: ['N0', 'N2'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: beam, materialId: conc }, beamsY: null }, { fixBase: true });
  const beams = [...modelStore.elements.values()].filter((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6; });
  for (const e of beams) modelStore.addDistributedLoad3D(e.id, 0, 0, -25, -25, undefined, undefined, 1);
  solveAndDesign();
  expect(designRunStore.autoDesign([...verificationStore.contexts.keys()]).ok).toBe(true);
  const line = modelBeamLines()[0]!;
  const open = openLine(line.members[0]!)!;
  // The person cuts the bottom bar of the first span at 2,5 m with a 0,6 m lap.
  const bottom = open.model.bars.find((b) => b.face === 'bottom' && b.from < 1)!;
  saveLine(line, cutBar(open.model, bottom.id, 2.5, 0.6));
  return line;
}

describe('a saved line its members no longer match', () => {
  it('applies while the members are as saved', () => {
    const line = savedEditedLine();
    expect(openLine(line.members[0]!)!.saved).toBe(true);
    expect(staleLines()).toEqual([]);
    expect(savedMemberCuts().size).toBeGreaterThan(0);
  });

  it('a redesign: not applied, listed as redesigned, offered to be taken up', () => {
    const line = savedEditedLine();
    const id = line.members[0]!;
    // Another arrangement written over the member, as «Size…» with overwrite would.
    const r = JSON.parse(JSON.stringify(modelStore.elements.get(id)!.reinforcement!));
    r.regions.stirrupsSpan = { ...(r.regions.stirrupsSpan ?? { diameter: 8, legs: 2 }), spacing: 0.1 };
    modelStore.reinforcementTransaction((api) => api.setReinforcement(id, r));
    const st = staleLines();
    expect(st.map((s) => [s.key, s.reason, s.changed.map((c) => c.id)])).toEqual([[lineKey(line.members), 'redesigned', [id]]]);
    const o = openLine(id)!;
    expect(o.saved).toBe(false);
    expect(o.stale?.reason).toBe('redesigned');
    // The detailing reads the members, not the stale cuts.
    expect(savedMemberCuts().has(id)).toBe(false);
    // The record stays until someone lets it go.
    expect(storedDecisions().lines?.[lineKey(line.members)]).toBeDefined();
  });

  it('a moved node: not applied, listed with the lengths before and after, never rescaled', () => {
    const line = savedEditedLine();
    // The middle column moves 0,4 m: the first span grows from 5 to 5,4 m, the second shrinks to 3,6.
    const first = modelStore.elements.get(line.members[0]!)!;
    const mid = [first.nodeI, first.nodeJ].map((id) => modelStore.nodes.get(id)!).find((n) => Math.abs(n.x - 5) < 1e-6)!;
    modelStore.updateNode(mid.id, 5.4, mid.y, mid.z);
    solveAndDesign();
    const st = staleLines().find((s) => s.key === lineKey(line.members))!;
    expect(st.reason).toBe('geometry');
    expect(st.changed.map((c) => [+(c.was ?? 0).toFixed(3), +(c.now ?? 0).toFixed(3)])).toEqual([[5, 5.4], [4, 3.6]]);
    expect(savedMemberCuts().size).toBe(0);
    expect(openLine(line.members[0]!)!.stale?.reason).toBe('geometry');
    for (const id of line.members) {
      expect(verificationStore.providedFor(id)?.checks).toContainEqual(expect.objectContaining({
        category: 'Stirrup zone geometry', limiting: 'unsupportedCheck', status: 'fail',
      }));
    }
  });

  it('is let go on request, as one undo step', () => {
    const line = savedEditedLine();
    const id = line.members[0]!;
    const r = JSON.parse(JSON.stringify(modelStore.elements.get(id)!.reinforcement!));
    r.regions.stirrupsSpan = { ...(r.regions.stirrupsSpan ?? { diameter: 8, legs: 2 }), spacing: 0.1 };
    modelStore.reinforcementTransaction((api) => api.setReinforcement(id, r));
    discardLine(lineKey(line.members));
    expect(storedDecisions().lines?.[lineKey(line.members)]).toBeUndefined();
    expect(staleLines()).toEqual([]);
    historyStore.undo();
    expect(storedDecisions().lines?.[lineKey(line.members)]).toBeDefined();
  });
});

it('#2171 round 4 resizes saved hoop zones during seismic detailing', () => {
  const line = savedEditedLine();
  const id = line.members[0]!;
  const ctx = verificationStore.contextFor(id)!;
  const rebar = reinforcementForVerification(id)!;
  const regions = rebar.regions!;
  const layout = regions.stirrupZones!;
  const wide = { diameter: 8, legs: 2, spacing: 0.2 };
  expect(layout.startSupportEnd).toBeLessThan(2 * ctx.section.h);
  modelStore.reinforcementTransaction(api => api.setReinforcement(id, { ...rebar, regions: {
    ...regions, regionT: 0.05, stirrupsSupport: wide, stirrupsSpan: wide,
    stirrupZones: { ...layout, zones: [{ from: 0, to: ctx.L, stirrup: wide }] },
  } }));
  setSeismicRole([id], 'primary');
  solveAndDesign();
  const check = runSeismicChecks().members.find(m => m.id === id)!.beam!;
  expect(check.hoops.lengthOk).toBe(false);
  expect(applySeismicDetailing().beams).toBeGreaterThan(0);
  const edited = reinforcementForVerification(id)!.regions!;
  const zones = edited.stirrupZones!;
  expect(zones.startSupportEnd).toBeCloseTo(check.hoops.length, 12);
  expect(zones.endSupportStart).toBeCloseTo(ctx.L - check.hoops.length, 12);
  expect(zones.zones).toEqual([
    { from: 0, to: zones.startSupportEnd, stirrup: edited.stirrupsSupport },
    { from: zones.startSupportEnd, to: zones.endSupportStart, stirrup: wide },
    { from: zones.endSupportStart, to: ctx.L, stirrup: edited.stirrupsSupport },
  ]);
  expect(edited.stirrupsSupport!.spacing).toBeLessThan(wide.spacing);
});

const round5Reproducer = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;

for (const entry of ['batch', 'member'] as const) {
  round5Reproducer(`known wrong result: #2171 round 5 spacing edits preserve each local cage (${entry})`, () => {
    const id = savedEditedLine().members[0]!;
    const rebar = reinforcementForVerification(id)!;
    const { length, startSupportEnd, endSupportStart } = rebar.regions!.stirrupZones!;
    const start: StirrupDef = { diameter: 8, legs: 2, spacing: 0.1, shape: 'closedRectangular', secondaryCrossties: 1 };
    const end: StirrupDef = { diameter: 10, legs: 4, spacing: 0.1, shape: 'unknown', secondaryCrossties: null };
    const span: StirrupDef = { diameter: 8, legs: 2, spacing: 0.15 };
    const zones = [
      { from: 0, to: startSupportEnd / 2, stirrup: start },
      { from: startSupportEnd, to: endSupportStart, stirrup: span },
      { from: endSupportStart, to: length, stirrup: end },
    ];
    rebar.regions = {
      ...rebar.regions, stirrupsSupport: start, stirrupsSpan: span,
      stirrupsBySupport: { atStart: start, atEnd: end },
      stirrupZones: { length, startSupportEnd, endSupportStart, zones },
    };
    const patch = { spacing: 0.075 };
    const ctx = verificationStore.contextFor(id)!;
    const updated = entry === 'batch'
      ? applyPatch(ctx, rebar, { stirrupsSupport: patch }).candidate
      : (() => {
          modelStore.reinforcementTransaction(api => api.setReinforcement(id, rebar));
          setStirrups(id, 'stirrupsSupport', patch);
          return reinforcementForVerification(id);
        })();
    expect(updated?.regions?.stirrupZones?.zones).toEqual([
      { ...zones[0], stirrup: { ...start, ...patch } },
      zones[1],
      { ...zones[2], stirrup: { ...end, ...patch } },
    ]);
    expect(updated?.regions?.stirrupsBySupport).toEqual({
      atStart: { ...start, ...patch }, atEnd: { ...end, ...patch },
    });
    expect(rebar.regions.stirrupZones.zones).toEqual(zones);
  });
}

round5Reproducer('known wrong result: #2171 round 5 refuses a legacy stirrup layout after regrouping', () => {
  const line = savedEditedLine();
  expect(line.members).toHaveLength(2);
  const id = line.members[0]!, other = line.members[1]!;
  const key = lineKey(line.members);
  const decisions = storedDecisions();
  const record = decisions.lines![key]!;
  const rebar: ProvidedReinforcement = JSON.parse(JSON.stringify(reinforcementForVerification(id)!));
  delete rebar.regions!.stirrupZones;
  delete rebar.regions!.stirrupsBySupport;
  modelStore.reinforcementTransaction(api => {
    api.setReinforcement(id, rebar);
    api.setDecisions({ ...decisions, lines: { ...decisions.lines, [key]: {
      ...record, memberHashes: { ...record.memberHashes, [id]: rebarHash(rebar) },
    } } });
  });
  const heldRow = expect.objectContaining({ category: 'Stirrup zone geometry', limiting: 'unsupportedCheck', status: 'fail' });
  expect(reinforcementForVerification(id)?.regions?.stirrupZones?.length).toBe(record.lengths[0]);
  expect(verificationStore.providedFor(id)?.checks).not.toContainEqual(heldRow);

  modelStore.removeElement(other);
  solveAndDesign();
  expect(storedDecisions().lines?.[key]).toBeDefined();
  expect(modelBeamLines().find(candidate => candidate.members.includes(id))?.members).toEqual([id]);
  expect(verificationStore.providedFor(id)?.checks).toContainEqual(heldRow);
  expect(verificationStore.reverifyAtFinalDepth(id, { bottomRaise: 0, topLower: 0, depthTolerance: 0 })).toBe('fail');

  const redesigned = { ...rebar, regions: { ...rebar.regions, stirrupsSpan: { ...rebar.regions!.stirrupsSpan!, spacing: 0.075 } } };
  modelStore.reinforcementTransaction(api => api.setReinforcement(id, redesigned));
  expect(verificationStore.providedFor(id)?.checks).not.toContainEqual(heldRow);
  modelStore.reinforcementTransaction(api => api.setReinforcement(id, rebar));
  discardLine(key);
  expect(verificationStore.providedFor(id)?.checks).not.toContainEqual(heldRow);
});
