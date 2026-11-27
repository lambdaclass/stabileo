import { expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { applyLoadPlan } from '../../../store/apply-load-plan';
import { designData } from '../../../store/design-data';
import { buildLoadPlan, type LoadModelData, type LoadPlanInput } from '../load-plan';
import { defaultRegulations, type ProjectRegulations } from '../../../codes/roles';
import { OCCUPANCY_TABLE_2025 } from '../../../codes/cirsoc101/live-loads';

function beamModel(parts = 1, angle = 0, mirrored = false): LoadModelData {
  const nodes: LoadModelData['nodes'] = new Map();
  const elements: LoadModelData['elements'] = new Map();
  for (let k = 0; k <= parts; k++) {
    const s = 2 * k / parts;
    nodes.set(k + 1, { id: k + 1, x: s * Math.cos(angle), y: (mirrored ? -1 : 1) * s * Math.sin(angle), z: 3 });
    if (k > 0) elements.set(k, { id: k, nodeI: k, nodeJ: k + 1, sectionId: 1, materialId: 1 });
  }
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 0 }]]), loadCases: [] };
}

function liveInput(over: Partial<LoadPlanInput> = {}): LoadPlanInput {
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

it('#2207 office beam must cover the governing patch effect or refuse', () => {
  const p = buildLoadPlan(liveInput());
  if (p.outcome === 'BLOCKED') {
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
    return;
  }
  expect(liveMidspanMoment(p)).toBeGreaterThanOrEqual(9 * 2 / 4 - 9 * 0.75 / 8);
});

it('#2207 every concentrated occupancy refuses an unevaluated placement', () => {
  const rows = OCCUPANCY_TABLE_2025.filter(o => o.concentratedKN !== null);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) for (const site of ['floor', 'roof']) {
    const p = buildLoadPlan(liveInput(site === 'floor' ? { occupancyKey: row.key }
      : { occupancyKey: 'vivienda', roof: { use: 'occupancy', occupancyKey: row.key, dead: 0, slopeDeg: 0 } }));
    expect(p.outcome, `${row.key}/${site}`).toBe('BLOCKED');
    expect(p.blockedKeys.length, `${row.key}/${site}`).toBeGreaterThan(0);
    if (row.uniformKNm2 !== null) {
      expect(p.blockedKeys.find(m => m.key === 'loadPlan.blocked.concentratedLive')?.params?.force).toBe(row.concentratedKN);
      expect(p.refs.some(r => r.clause === '4.4')).toBe(true);
    }
  }
});

it('#2207 maintenance and occupied roofs require concentrated checks', () => {
  for (const use of ['maintenance', 'occupancy'] as const) {
    const p = buildLoadPlan(liveInput({ occupancyKey: 'vivienda', roof: { use, occupancyKey: 'oficina', dead: 0, slopeDeg: 0 } }));
    expect(p.outcome, use).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedRoof' || m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
  }
  for (const row of OCCUPANCY_TABLE_2025.filter(o => o.category === 'roof')) {
    const p = buildLoadPlan(liveInput({ occupancyKey: row.key }));
    expect(p.outcome, row.key).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedRoof')).toBe(true);
  }
});

it('#2207 rotation mirroring and member subdivision cannot bypass refusal', () => {
  for (const parts of [1, 2, 7]) for (const angle of [0, Math.PI / 6, Math.PI / 2]) for (const mirrored of [false, true]) {
    const p = buildLoadPlan(liveInput({ model: beamModel(parts, angle, mirrored) }));
    expect(p.outcome, `${parts}/${angle}/${mirrored}`).toBe('BLOCKED');
    expect(p.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(true);
  }
});

it('#2207 shell floors and reduced live cases cannot bypass concentrated checks', () => {
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

it('#2207 direct application cannot write a blocked load plan', () => {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(2, 0, 3);
  modelStore.addElement(a, b);
  const supported = buildLoadPlan(liveInput({ occupancyKey: 'vivienda', generateCombinations: true, model: {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never,
    sections: modelStore.model.sections as never, materials: modelStore.model.materials as never,
    loadCases: modelStore.model.loadCases,
  } }));
  expect(supported.outcome).toBe('READY');
  applyLoadPlan(supported, { clearExisting: false, bothSenses: true, nameOf: key => key });
  expect(modelStore.loads.length).toBeGreaterThan(0);
  expect(modelStore.model.loadCases.length).toBeGreaterThan(0);
  expect(modelStore.model.combinations.length).toBeGreaterThan(0);
  expect(designData().loadBasis).toBeDefined();
  const p = buildLoadPlan(liveInput({ model: {
    nodes: modelStore.nodes as never, elements: modelStore.elements as never,
    sections: modelStore.model.sections as never, materials: modelStore.model.materials as never,
    loadCases: modelStore.model.loadCases,
  } }));
  expect(p.blockedKeys.length).toBeGreaterThan(0);
  const snapshot = () => JSON.stringify({ loads: modelStore.loads, cases: modelStore.model.loadCases,
    combinations: modelStore.model.combinations, design: designData() });
  const before = snapshot();
  for (const [outcome, blockedKeys] of [
    ['READY', p.blockedKeys], ['BLOCKED', p.blockedKeys], ['BLOCKED', []],
  ] as const) for (const clearExisting of [false, true]) {
    applyLoadPlan({ ...p, outcome, blockedKeys: [...blockedKeys] }, { clearExisting, bothSenses: true, nameOf: key => key });
    expect(snapshot()).toBe(before);
  }
});

it('#2207 every shipped locale explains both refusals without fallback', async () => {
  const { ALL_DICTS } = await import('../../../i18n/locales/all');
  for (const [locale, dict] of Object.entries(ALL_DICTS)) {
    const live = dict['loadPlan.blocked.concentratedLive'];
    const roof = dict['loadPlan.blocked.concentratedRoof'];
    const rule = dict['loadPlan.blocked.concentratedRule'];
    expect(rule, locale).toContain('{occupancy}');
    expect(rule, locale).toContain('{article}');
    expect(live, locale).toContain('§4.4');
    expect(live, locale).toContain('{occupancy}');
    expect(live, locale).toContain('{force}');
    expect(roof, locale).toContain('§4.4');
    expect(roof, locale).toContain('§4.8');
  }
});

it('#2207 the repository clause requires alternatives, a square patch and separate roof actions', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../../../../../../docs/codes/CIRSOC/markdown/cirsoc-101-2025/capitulo-4-sobrecargas-de-diseno.md', import.meta.url), 'utf8');
  const start = text.indexOf('### 4.4 CARGAS CONCENTRADAS');
  const clause = text.slice(start, text.indexOf('### 4.5', start)).split('\n').map(line => line.slice(0, 54)).join(' ').replace(/\s+/g, ' ');
  expect(clause).toContain('de ambas la que produzca las mayores solicitaciones');
  expect(clause).toContain('un área cuadrada de 0,75 m de lado');
  expect(clause).toContain('los máximos efectos de carga');
  expect(clause).toContain('posición más desfavorable');
  expect(clause).toContain('no actúan simultáneamente');
});

it('#2207 zero or absent concentrated action permits generation while any positive action blocks', async () => {
  const { CIRSOC101_LOADS } = await import('../../../codes/families/cirsoc');
  const row = OCCUPANCY_TABLE_2025.find(o => o.key === 'oficina')!;
  for (const concentratedKN of [null, 0, Number.MIN_VALUE, 9]) {
    const limits = CIRSOC101_LOADS.generationBlockers({ occupancies: [{ ...row, concentratedKN }], roof: false });
    expect(limits.messages.length).toBe(concentratedKN !== null && concentratedKN > 0 ? 1 : 0);
  }
  const supported = buildLoadPlan(liveInput({ occupancyKey: 'vivienda' }));
  expect(supported.outcome).toBe('READY');
  expect(supported.blockedKeys).toEqual([]);
  expect(liveMidspanMoment(supported)).toBeCloseTo(2 * 2 ** 2 / 8, 12);
});

for (const dimension of [2, 3]) for (const nonlinear of [false, true]) {
  it(`#2207 governing patch and supported uniform load retain member effects dimension=${dimension} nonlinear=${nonlinear}`, async () => {
    const { solve, solve3D, solvePDelta, solvePDelta3D } = await import('../../wasm-solver');
    const { computeDiagramValueAt } = await import('../../diagrams');
    const { evaluateDiagramAt } = await import('../../diagrams-3d');
    const { buildSolverLoads3D } = await import('../../solver-service');
    for (const concentrated of [false, true]) for (const split of [1, 2, 5]) for (const angle of dimension === 2 ? [0] : [0, 0.37]) for (const mirror of [-1, 1]) {
      const n = 2 * split, length = 2, patch = concentrated ? 0.75 : 2, force = concentrated ? 9 : 4, ei = 1000;
      const generated = buildLoadPlan(liveInput({ model: beamModel(n, angle, mirror < 0), occupancyKey: concentrated ? 'oficina' : 'vivienda' }));
      expect(generated.outcome).toBe(concentrated ? 'BLOCKED' : 'READY');
      expect(generated.blockedKeys.some(m => m.key === 'loadPlan.blocked.concentratedLive')).toBe(concentrated);
      const lo = (length - patch) / 2, hi = (length + patch) / 2;
      const nodes = new Map(Array.from({ length: n + 1 }, (_, k) => [k, { id: k, x: k * length / n * Math.cos(angle), y: mirror * k * length / n * Math.sin(angle), z: 0 }]));
      const elements = new Map(Array.from({ length: n }, (_, k) => [k + 1, { id: k + 1, type: 'frame', nodeI: k, nodeJ: k + 1, materialId: 1, sectionId: 1 }]));
      const loads = [...elements.values()].flatMap(e => {
        const start = (e.id - 1) * length / n;
        const q = concentrated ? -force / patch : generated.distributed.find(d => d.caseType === 'L' && d.elementId === e.id)!.q;
        expect(q).toBeCloseTo(-force / patch, 12);
        const a = Math.max(0, lo - start), b = Math.min(length / n, hi - start);
        if (b <= a) return [];
        return [{ type: 'distributed', data: dimension === 2
          ? { elementId: e.id, qI: q, qJ: q, a, b }
          : { elementId: e.id, qYI: 0, qYJ: 0, qZI: q, qZJ: q, frame: 'global', a, b } }];
      });
      const supports = new Map([0, n].map(k => [k, dimension === 2 ? { id: k, nodeId: k, type: 'pinned' }
        : { nodeId: k, rx: true, ry: true, rz: true, rrx: k === 0, rry: false, rrz: false }]));
      const model = { nodes: dimension === 2 ? new Map([...nodes].map(([id, node]) => [id, { id, x: node.x, z: node.z }])) : nodes, elements, supports, loads, materials: new Map([[1, { id: 1, e: 1000, nu: 0.3 }]]),
        sections: new Map([[1, { id: 1, a: 0.01, iy: 0.001, iz: 0.001, j: 0.001 }]]) };
      const check = (ef: { elementId: number }, shear: (t: number) => number, moment: (t: number) => number, torsion?: (t: number) => number) => {
        for (const t of [0.1, 0.5, 0.9]) {
          const x = (ef.elementId - 1 + t) * length / n;
          const u = Math.max(0, Math.min(patch, x - lo));
          const v = force / 2 - force / patch * u;
          const m = force / 2 * x - force / patch * (Math.max(0, x - lo) ** 2 - Math.max(0, x - hi) ** 2) / 2;
          expect(shear(t)).toBeCloseTo(v, 9);
          expect(moment(t)).toBeCloseTo(m, 9);
          if (torsion) expect(torsion(t)).toBeCloseTo(0, 12);
        }
      };
      const deflection = -force * (8 * length ** 3 - 4 * length * patch ** 2 + patch ** 3) / (384 * ei);
      if (dimension === 2) {
        const input = model as unknown as import('../../types').SolverInput;
        const advanced = nonlinear ? solvePDelta(input, 20, 1e-10) : null;
        if (advanced) { expect(advanced.converged).toBe(true); expect(advanced.isStable).toBe(true); }
        const result: import('../../types').AnalysisResults = nonlinear ? advanced.results : solve(input);
        expect(result.elementForces).toHaveLength(n);
        for (const ef of result.elementForces) check(ef, t => computeDiagramValueAt('shear', t, ef), t => -computeDiagramValueAt('moment', t, ef));
        expect(result.displacements.find(d => d.nodeId === split)!.uz).toBeCloseTo(deflection, 12);
      } else {
        const authoredLoads = loads.map(({ data }, index) => ({
          type: 'distributed3d', data: { ...data, id: index + 1, caseId: 1 },
        })) as import('../../../store/model.svelte').Load[];
        const solver = model as unknown as import('../../types-3d').SolverInput3D;
        const authoredModel = { ...model, loads: authoredLoads } as unknown as import('../../solver-service').ModelData;
        const input = { ...solver, loads: buildSolverLoads3D(authoredModel, authoredLoads, false, false) };
        const advanced = nonlinear ? solvePDelta3D(input, 20, 1e-10) : null;
        if (advanced) { expect(advanced.converged).toBe(true); expect(advanced.isStable).toBe(true); }
        const result: import('../../types-3d').AnalysisResults3D = nonlinear ? advanced.results : solve3D(input);
        expect(result.elementForces).toHaveLength(n);
        for (const ef of result.elementForces) {
          check(ef, t => evaluateDiagramAt(ef, 'shearZ', t), t => evaluateDiagramAt(ef, 'momentY', t), t => evaluateDiagramAt(ef, 'torsion', t));
          for (const t of [0.1, 0.5, 0.9]) {
            expect(evaluateDiagramAt(ef, 'shearY', t)).toBeCloseTo(0, 12);
            expect(evaluateDiagramAt(ef, 'momentZ', t)).toBeCloseTo(0, 12);
          }
        }
        expect(result.displacements.find(d => d.nodeId === split)!.uz).toBeCloseTo(deflection, 12);
      }
    }
  });
}
