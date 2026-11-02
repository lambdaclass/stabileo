import { describe, it, expect } from 'vitest';
import { gravityLayout, MAX_DECK_SPAN, MIN_STOREY_HEADROOM, type GravityModel } from '../plan-gravity';
import { generateShed, DEFAULT_SHED_PARAMS } from '../../generators/shed';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../generators/emit';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 100'), post: defaultProfileSpec('L 50x50x5'), diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 200'), column: defaultProfileSpec('HEB 160'), beam: defaultProfileSpec('IPE 200'),
  purlin: defaultProfileSpec('UPN 100'), bracing: defaultProfileSpec('L 50x50x5'),
};

function shed(params: Parameters<typeof generateShed>[0]): GravityModel {
  const json = emitModel(generateShed(params), { name: 'Nave', profiles: PROFILES }).json as unknown as {
    nodes: Array<{ id: number; x: number; y: number; z: number }>;
    elements: Array<{ id: number; nodeI: number; nodeJ: number; type?: 'frame' | 'truss' }>;
  };
  return {
    nodes: new Map(json.nodes.map((n) => [n.id, n])),
    elements: new Map(json.elements.map((e) => [e.id, e])),
  };
}

/** Two storeys of 2 × 2 bays of 5 m, 3 m high, columns and beams only. */
function building(): GravityModel {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number }>();
  const at = (i: number, j: number, k: number) => k * 9 + j * 3 + i + 1;
  for (let k = 0; k <= 2; k++) for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) nodes.set(at(i, j, k), { id: at(i, j, k), x: 5 * i, y: 5 * j, z: 3 * k });
  let e = 1;
  for (let k = 0; k < 2; k++) for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) elements.set(e, { id: e++, nodeI: at(i, j, k), nodeJ: at(i, j, k + 1) });
  for (let k = 1; k <= 2; k++) for (let j = 0; j <= 2; j++) for (let i = 0; i < 2; i++) elements.set(e, { id: e++, nodeI: at(i, j, k), nodeJ: at(i + 1, j, k) });
  for (let k = 1; k <= 2; k++) for (let i = 0; i <= 2; i++) for (let j = 0; j < 2; j++) elements.set(e, { id: e++, nodeI: at(i, j, k), nodeJ: at(i, j + 1, k) });
  return { nodes, elements };
}

const eaveZ = (m: GravityModel) => {
  const zs = [...m.nodes.values()].map((n) => n.z ?? 0);
  return [...new Set(zs.map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b);
};

describe('a trussed shed has no floor at its eaves', () => {
  const nave = shed({ ...DEFAULT_SHED_PARAMS, longitudinalBeams: true, roofBracing: true, wallBracing: true, trussBracing: true });

  it('loads no panel of the eave level as a floor, by panels', () => {
    const layout = gravityLayout(nave, { mode: 'panels', tributaryWidth: 3 });
    const floorArea = [...layout.areaOf.values()].reduce((s, a) => s + a, 0);
    expect(floorArea).toBe(0);
    expect(layout.notes.some((n) => n.key === 'loadPlan.gravity.lowHeadroom')).toBe(true);
    expect(layout.roofAreaOf.size).toBeGreaterThan(0);
  });

  it('nor by width', () => {
    const layout = gravityLayout(nave, { mode: 'width', tributaryWidth: 3 });
    expect([...layout.areaOf.values()].reduce((s, a) => s + a, 0)).toBe(0);
    expect(layout.notes.some((n) => n.key === 'loadPlan.gravity.membersLowHeadroom')).toBe(true);
  });

  it('loads it as a floor when asked, an attic floor', () => {
    const layout = gravityLayout(nave, { mode: 'panels', tributaryWidth: 3, loadEveryPanel: true });
    expect([...layout.areaOf.values()].reduce((s, a) => s + a, 0)).toBeGreaterThan(0);
  });

  it('the threshold is a storey nobody stands in', () => {
    expect(MIN_STOREY_HEADROOM).toBe(2.2);
    expect(eaveZ(nave).length).toBeGreaterThan(2);
  });
});

describe('the industrial hall and the stadium of the examples', () => {
  const fixture = async (id: string): Promise<GravityModel> => {
    const f = (await import(`../../../templates/fixtures/${id}.json`)).default as {
      nodes: Array<{ id: number; x: number; y: number; z?: number }>;
      elements: Array<{ id: number; nodeI: number; nodeJ: number; type?: string }>;
      quads?: Array<{ id: number; nodes: number[] }>;
    };
    return {
      nodes: new Map(f.nodes.map((n) => [n.id, n])),
      elements: new Map(f.elements.map((e) => [e.id, { ...e, type: e.type === 'truss' ? 'truss' as const : 'frame' as const }])),
      quads: new Map((f.quads ?? []).map((q) => [q.id, q])),
    };
  };

  it('the hall: its girt rings and the panels under its trusses carry no floor, its roof is loaded', async () => {
    const g = gravityLayout(await fixture('3d-nave-industrial'), { mode: 'panels', tributaryWidth: 3 });
    expect([...g.areaOf.values()].reduce((s, a) => s + a, 0)).toBe(0);
    expect(g.notes.map((n) => n.key)).toEqual(expect.arrayContaining(['loadPlan.gravity.lowHeadroom', 'loadPlan.gravity.widePanels']));
    expect([...g.roofAreaOf.values()].reduce((s, a) => s + a, 0)).toBeGreaterThan(0);
  });

  it('the stadium: no area load on rings of a hundred metres', async () => {
    const g = gravityLayout(await fixture('full-stadium'), { mode: 'panels', tributaryWidth: 3 });
    expect(g.panels.every((p) => {
      const xs = p.polygon.map((q) => q[0]), ys = p.polygon.map((q) => q[1]);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) <= MAX_DECK_SPAN;
    })).toBe(true);
    expect(g.notes.some((n) => n.key === 'loadPlan.gravity.widePanels')).toBe(true);
  });

  it('the pipe rack keeps its tiers', async () => {
    const all = gravityLayout(await fixture('pipe-rack'), { mode: 'panels', tributaryWidth: 3, loadEveryPanel: true });
    const g = gravityLayout(await fixture('pipe-rack'), { mode: 'panels', tributaryWidth: 3 });
    expect(g.panels.length).toBe(all.panels.length);
  });
});

describe('a building of beams keeps its floors', () => {
  it('loads the lower floor as a floor and the top as a roof', () => {
    const layout = gravityLayout(building(), { mode: 'panels', tributaryWidth: 3 });
    expect([...layout.areaOf.values()].reduce((s, a) => s + a, 0)).toBeCloseTo(100, 6);
    expect([...layout.roofAreaOf.values()].reduce((s, a) => s + a, 0)).toBeCloseTo(100, 6);
    expect(layout.notes.some((n) => n.key === 'loadPlan.gravity.lowHeadroom')).toBe(false);
  });
});

describe('the load plan of a trussed shed', () => {
  it('has no floor live load case and no floor finishes, only the roof\'s', async () => {
    const { buildLoadPlan } = await import('../load-plan');
    const { defaultRegulations } = await import('../../../codes/roles');
    const reg = defaultRegulations();
    for (const k of Object.keys(reg) as Array<keyof typeof reg>) if (reg[k].adapterId) reg[k] = { ...reg[k], configComplete: true, state: 'applied' };
    const nave = shed({ ...DEFAULT_SHED_PARAMS, longitudinalBeams: true, roofBracing: true, wallBracing: true, trussBracing: true });
    const sections = new Map([...new Set([...nave.elements.values()].map(() => 1))].map((id) => [id, { id, a: 0.002 }]));
    const p = buildLoadPlan({
      regulations: reg,
      model: {
        nodes: nave.nodes as never, sections, materials: new Map([[1, { id: 1, rho: 78.5 }]]),
        elements: new Map([...nave.elements].map(([id, e]) => [id, { ...e, sectionId: 1, materialId: 1 }])),
        loadCases: [{ id: 1, type: 'D', name: 'D' }],
      },
      dead: [{ labelKey: 'a', q: 1.2 }], occupancyKey: 'vivienda', tributaryWidth: 3,
      reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: true, generateCombinations: true,
      gravity: { mode: 'panels' },
      roof: { use: 'maintenance', dead: 0.15, slopeDeg: 10 },
    });
    expect(p.cases.some((c) => c.type === 'L')).toBe(false);
    expect(p.cases.some((c) => c.type === 'Lr')).toBe(true);
    const floorDead = p.distributed.filter((d) => d.caseType === 'D' && Math.abs(d.q) > 0.5);
    expect(floorDead.length).toBe(0);
  });
});

describe('a roof that would take the dead load of floors there are not', () => {
  it('blocks the plan and says to give the roof its own', async () => {
    const { buildLoadPlan } = await import('../load-plan');
    const { defaultRegulations } = await import('../../../codes/roles');
    const reg = defaultRegulations();
    for (const k of Object.keys(reg) as Array<keyof typeof reg>) if (reg[k].adapterId) reg[k] = { ...reg[k], configComplete: true, state: 'applied' };
    const nave = shed({ ...DEFAULT_SHED_PARAMS, longitudinalBeams: true });
    const input = (deadFromFloors: boolean) => ({
      regulations: reg,
      model: {
        nodes: nave.nodes as never, sections: new Map([[1, { id: 1, a: 0.002 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]),
        elements: new Map([...nave.elements].map(([id, e]) => [id, { ...e, sectionId: 1, materialId: 1 }])),
        loadCases: [{ id: 1, type: 'D', name: 'D' }],
      },
      dead: [{ labelKey: 'a', q: 1.8 }], occupancyKey: 'vivienda', tributaryWidth: 3,
      reductionElementKind: 'interiorBeam' as const, floorsSupported: 1, applyLiveReduction: true, generateCombinations: true,
      gravity: { mode: 'panels' as const },
      roof: { use: 'maintenance' as const, dead: 1.8, slopeDeg: 10, deadFromFloors },
    });
    const blocked = buildLoadPlan(input(true));
    expect(blocked.outcome).toBe('BLOCKED');
    expect(blocked.blockedKeys.map((b) => b.key)).toContain('loadPlan.blocked.roofDeadWithoutFloors');
    expect(buildLoadPlan(input(false)).outcome).not.toBe('BLOCKED');
  });
});
