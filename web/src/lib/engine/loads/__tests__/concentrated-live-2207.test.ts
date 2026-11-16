import { expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { designData } from '../../../store/design-data';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { OCCUPANCY_TABLE_2025 } from '../../../codes/cirsoc101/live-loads';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2207' ? it : it.skip;

export function beamModel(parts = 1, angle = 0, mirrored = false): LoadModelData {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  for (let k = 0; k <= parts; k++) {
    const s = 2 * k / parts;
    nodes.set(k + 1, { id: k + 1, x: s * Math.cos(angle), y: (mirrored ? -1 : 1) * s * Math.sin(angle), z: 3 });
    if (k > 0) elements.set(k, { id: k, nodeI: k, nodeJ: k + 1, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 0 }]]), loadCases: [] };
}

export function liveInput(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
  const regulations = Object.fromEntries(Object.entries(defaultRegulations()).map(([key, value]) =>
    [key, value.adapterId ? { ...value, configComplete: true, state: 'applied' } : value])) as ProjectRegulations;
  return {
    regulations, model: beamModel(), dead: [], occupancyKey: 'oficina', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false,
    generateCombinations: false, ...over,
  };
}

function liveMidspanMoment(p: ReturnType<typeof buildLoadPlan>): number {
  const cases = p.cases.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'L');
  return Math.max(0, ...cases.map(({ i }) => {
    let moment = 0;
    for (const d of p.distributed.filter(d => d.caseType === 'L' && (d.caseIndex === undefined || d.caseIndex === i))) {
      const a = d.a ?? 0, b = d.b ?? 2;
      const q0 = -d.q, slope = (-(d.qJ ?? d.q) - q0) / (b - a);
      for (const [lo, hi, right] of [[a, Math.min(b, 1), false], [Math.max(a, 1), b, true]] as const) {
        if (hi <= lo) continue;
        const v = (s: number) => right
          ? ((q0 - slope * a) * (2 * s - s * s / 2) + slope * (s * s - s ** 3 / 3)) / 2
          : ((q0 - slope * a) * s * s / 2 + slope * s ** 3 / 3) / 2;
        moment += v(hi) - v(lo);
      }
    }
    for (const n of p.nodal.filter(n => n.caseType === 'L' && (n.caseIndex === undefined || n.caseIndex === i))) {
      const s = n.nodeId === 1 ? 0 : 2;
      moment += -n.fz * Math.min(s, 2 - s) / 2;
    }
    return moment;
  }));
}

knownWrong('known wrong result: #2207 office beam must cover the governing patch effect or refuse', () => {
  const p = buildLoadPlan(liveInput());
  if (p.outcome === 'BLOCKED') {
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
    return;
  }
  expect(liveMidspanMoment(p)).toBeGreaterThanOrEqual(9 * 2 / 4 - 9 * 0.75 / 8);
});

knownWrong('known wrong result: #2207 every concentrated occupancy refuses an unevaluated placement', () => {
  const rows = OCCUPANCY_TABLE_2025.filter(o => o.concentratedKN !== null);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    const p = buildLoadPlan(liveInput({ occupancyKey: row.key }));
    expect(p.outcome, row.key).toBe('BLOCKED');
    expect(p.blockedKeys.length, row.key).toBeGreaterThan(0);
  }
});

knownWrong('known wrong result: #2207 maintenance and occupied roofs require concentrated checks', () => {
  for (const use of ['maintenance', 'occupancy'] as const) {
    const p = buildLoadPlan(liveInput({ occupancyKey: 'vivienda', roof: { use, occupancyKey: 'oficina', dead: 0, slopeDeg: 0 } }));
    expect(p.outcome, use).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedRoof' || m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
  }
});

knownWrong('known wrong result: #2207 rotation mirroring and member subdivision cannot bypass refusal', () => {
  for (const parts of [1, 2, 7]) for (const angle of [0, Math.PI / 6, Math.PI / 2]) for (const mirrored of [false, true]) {
    const p = buildLoadPlan(liveInput({ model: beamModel(parts, angle, mirrored) }));
    expect(p.outcome, `${parts}/${angle}/${mirrored}`).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
  }
});

knownWrong('known wrong result: #2207 shell floors and reduced live cases cannot bypass concentrated checks', () => {
  for (const applyLiveReduction of [false, true]) {
    const model = beamModel();
    model.nodes.set(3, { id: 3, x: 2, y: 1, z: 3 });
    model.nodes.set(4, { id: 4, x: 0, y: 1, z: 3 });
    model.quads = new Map([[1, { id: 1, nodes: [1, 2, 3, 4] }]]);
    model.loadCases = [{ id: 1, type: 'L', name: 'Reduced manually', reduction: { ratio: 0.5 } }];
    const p = buildLoadPlan(liveInput({ model, applyLiveReduction, tributaryWidth: 10, gravity: { mode: 'panels' } }));
    expect(p.outcome).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
  }
});

knownWrong('known wrong result: #2207 direct application cannot write a blocked load plan', () => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(2, 0, 3);
  modelStore.addElement(a, b);
  const p = buildLoadPlan(liveInput({ model: {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never,
    sections: modelStore.model.sections as never, materials: modelStore.model.materials as never,
    loadCases: modelStore.model.loadCases,
  } }));
  const snapshot = () => JSON.stringify({ loads: modelStore.loads, cases: modelStore.model.loadCases,
    combinations: modelStore.model.combinations, design: designData() });
  const before = snapshot();
  applyLoadPlan({ ...p, outcome: 'BLOCKED' }, { clearExisting: true, bothSenses: true, nameOf: key => key });
  expect(snapshot()).toBe(before);
});
