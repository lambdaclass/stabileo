/**
 * Hooks where a straight bar does not anchor (§25.4.3). A 20×50 beam between 50×50 columns: the
 * region over each support is the column's half (0.25 m) plus d ≈ 0.45 m, about 0.70 m, against an
 * ld of a Ø20 bottom bar near 1 m and an ldh of 0.24·420·0.020/√25 = 0.40 m. The bars anchor only
 * hooked: the verifier says so, the design hooks them, and the detailing bends them.
 *
 * The columns were 30×30. The design now also checks the top bars' hooks in the columns as the
 * detailing builds them (`end-support-anchorage.ts`), and with the columns not designed it reads
 * them at the project's largest bar (Ø32): a 30 cm column leaves a hook 18,7 cm past its face,
 * short of ℓdh of any bar at H-25, so no arrangement anchors there. 50×50 leaves 38,7 cm.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import { cirsoc201Adapter } from '../adapters/cirsoc201-adapter';
import { hooksAsked, withHooks } from '../anchorage-hooks';
import { generateBeamBars, type BeamGenerationInput } from '../../detailing/generate-beam';
import * as wasmSolver from '../../wasm-solver';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function beamOnColumns() {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '50×50', a: 0.25, iy: 0.5 ** 4 / 12, iz: 0.5 ** 4 / 12, j: 0.1406 * 0.5 ** 4, b: 0.5, h: 0.5, shape: 'rect' } as never);
  const sec = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3), modelStore.addNode(6, 0, 0)];
  modelStore.addSupport(n[0]!, 'fixed3d' as never); modelStore.addSupport(n[3]!, 'fixed3d' as never);
  for (const [a, b] of [[0, 1], [3, 2]] as const) { const c = modelStore.addElement(n[a]!, n[b]!, 'frame'); modelStore.updateElementMaterial(c, mat); modelStore.updateElementSection(c, col); }
  const beam = modelStore.addElement(n[1]!, n[2]!, 'frame');
  modelStore.updateElementMaterial(beam, mat); modelStore.updateElementSection(beam, sec);
  modelStore.addDistributedLoad3D(beam, 0, 0, -25, -25, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  return beam;
}

const bars = {
  regions: {
    bottomSpanLayers: [{ count: 3, diameter: 20, row: 0 }], bottomSpan: { count: 3, diameter: 20 },
    topStartLayers: [{ count: 3, diameter: 16, row: 0 }], topStart: { count: 3, diameter: 16 },
    topEndLayers: [{ count: 3, diameter: 16, row: 0 }], topEnd: { count: 3, diameter: 16 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
};

describe('hooks where a straight bar does not anchor', () => {
  it('the verifier names the group and the end; hooked, the warning goes', () => {
    const beam = beamOnColumns();
    const ctx = verificationStore.contextFor(beam)!;
    const straight = cirsoc201Adapter.verify(ctx, bars as never);
    const asked = hooksAsked(straight.checks);
    expect(asked).toEqual([{ face: 'bottom', toward: 'start', group: 0 }, { face: 'bottom', toward: 'end', group: 0 }]);
    const hooked = withHooks(bars as never, asked)!;
    expect(hooked.regions?.bottomGroups).toEqual([{ layers: [{ count: 3, diameter: 20, row: 0 }], label: 'all', continueStart: true, continueEnd: true, anchorageStart: 'hook', anchorageEnd: 'hook' }]);
    const after = cirsoc201Adapter.verify(ctx, hooked);
    expect(after.checks.filter((c) => c.category === 'Anchorage')).toEqual([]);
    expect(withHooks(hooked, hooksAsked(after.checks))).toBeNull();
  });

  it('the design writes the hooks it needs', () => {
    const beam = beamOnColumns();
    expect(designRunStore.autoDesign([beam]).ok).toBe(true);
    const r = modelStore.elements.get(beam)!.reinforcement!;
    const left = verificationStore.providedFor(beam)!.checks.filter((c) => c.category === 'Anchorage' && c.anchorHook);
    expect(left).toEqual([]);
    // Either the bars anchor straight, or they carry the hooks they need.
    const groups = r.regions?.bottomGroups;
    if (groups) expect(groups.some((g) => g.anchorageStart === 'hook' || g.anchorageEnd === 'hook')).toBe(true);
  });

  it('the detailing bends the hooked bottom bars up into the support', () => {
    const input: BeamGenerationInput = {
      elementId: 9, L: 6, b: 0.2, h: 0.5, d: 0.45, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
      stations: Array.from({ length: 11 }, (_, i) => ({ x: 0.6 * i, mPos: 100 * 4 * (i / 10) * (1 - i / 10), mNeg: 0, v: 80 * Math.abs(1 - i / 5) })),
      supportI: 'continuous', supportJ: 'continuous', vn: 200,
      bottom: { count: 3, diameterMm: 20 }, topStart: { count: 2, diameterMm: 12 }, topEnd: { count: 2, diameterMm: 12 },
      lateralSystem: false, ld: (d) => 0.05 * d,
      origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
      bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
    };
    const straight = generateBeamBars(input).bars.filter((b) => b.id.includes('-bot-cont-'));
    const hooked = generateBeamBars({ ...input, bottomHooks: { start: true, end: false } }).bars.filter((b) => b.id.includes('-bot-cont-'));
    expect(straight.every((b) => b.startTreatment.kind === 'straight' && b.endTreatment.kind === 'straight')).toBe(true);
    expect(hooked.length).toBeGreaterThan(0);
    expect(hooked.every((b) => b.startTreatment.kind === 'hook' && b.endTreatment.kind === 'straight')).toBe(true);
  });
});

describe('hooks survive an edit of the bars', () => {
  it('a hooked face edited keeps its hooks, and the editor sets and clears them', async () => {
    const { regroupBars } = await import('../rebar-groups');
    const hooked = [{ layers: [{ count: 3, diameter: 20, row: 0 }], label: 'all', continueStart: true, continueEnd: true, anchorageStart: 'hook' as const }];
    expect(regroupBars(hooked, [{ count: 4, diameter: 16, row: 0 }])).toEqual([{ layers: [{ count: 4, diameter: 16, row: 0 }], label: 'all', continueStart: true, continueEnd: true, anchorageStart: 'hook' }]);
    expect(regroupBars([{ ...hooked[0]!, anchorageStart: undefined }], [{ count: 4, diameter: 16, row: 0 }])).toBeNull();

    const { getBottomHooks, setBottomHook, updateLayer } = await import('../../../store/rebar-edit');
    const beam = beamOnColumns();
    modelStore.reinforcementTransaction((api) => api.setReinforcement(beam, structuredClone(bars) as never));
    setBottomHook(beam, 'end', true);
    expect(getBottomHooks(beam)).toEqual({ start: false, end: true });
    updateLayer(beam, 'bottomSpanLayers', 0, 'count', 4);
    expect(getBottomHooks(beam)).toEqual({ start: false, end: true });
    expect(modelStore.elements.get(beam)!.reinforcement!.regions!.bottomGroups![0]!.layers[0]!.count).toBe(4);
    setBottomHook(beam, 'end', false);
    expect(getBottomHooks(beam)).toEqual({ start: false, end: false });
    expect(modelStore.elements.get(beam)!.reinforcement!.regions!.bottomGroups).toBeUndefined();
  });
});
