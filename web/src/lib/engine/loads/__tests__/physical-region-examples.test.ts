import { expect, it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { codeToModel } from '../../../model/code/format';
import { buildLoadPlan } from '../load-plan';
import { defaultRegulations } from '../../../codes/roles';
import { floorLoad } from '../floor-loads';
import { beamLike, gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { assertRegionInvariant, expectGravityAnswerOrRefusal, expectPlanSpanRefusal, regionModel, expectResultant, loadResultant, regionVariant, type RegionModel, type Resultant } from './physical-region-invariance';

const fixtureDir = new URL('../../../templates/fixtures/', import.meta.url);
const codeDir = new URL('../../../templates/examples/', import.meta.url);
const examples = [
  ...readdirSync(fixtureDir).filter(f => f.endsWith('.json')).map(file => ({ id: file.slice(0, -5), file: new URL(file, fixtureDir), code: false })),
  ...readdirSync(codeDir).filter(f => f.endsWith('.stabileo.txt')).map(file => ({ id: file.slice(0, -13), file: new URL(file, codeDir), code: true })),
];
const refusalReasons: Record<string, string> = {
  'cad-arch-structure-dxf': 'partial member shell coverage',
  'full-stadium': 'nonplanar shell',
  'geodesic-dome': 'area-load slope boundary',
  'la-bombonera': 'nonplanar shell',
  'suspension-bridge': 'first-moment precision',
};

function plan(model: RegionModel) {
  const regulations = defaultRegulations();
  for (const binding of Object.values(regulations)) if (binding.adapterId) Object.assign(binding, { configComplete: true, state: 'applied' });
  return buildLoadPlan({ model, regulations, dead: [{ labelKey: 'test', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false, gravity: { mode: 'panels', loadEveryPanel: true } });
}

const captured: Record<string, Resultant> = {};
const capture = process.env.REGION_CAPTURE;
const controlFile = new URL('./physical-region-example-controls.json', import.meta.url);
const controls: Record<string, Resultant> = existsSync(controlFile) ? JSON.parse(readFileSync(controlFile, 'utf8')) : {};
for (const example of examples) for (const variant of ['rotate', 'mirror', 'remesh', 'ids'] as const) for (const source of ['members', 'panels', 'shells'] as const) it(`physical gravity region invariance: ${example.id}, ${variant}, ${source}`, () => expectGravityAnswerOrRefusal(() => {
  const text = readFileSync(example.file, 'utf8');
  const data = example.code ? codeToModel(text).snapshot! : JSON.parse(text);
  const entries = (items: unknown[] = []): Array<[number, unknown]> => items.map((v, i) => Array.isArray(v) ? [v[0] as number, v[1]] : [(v as { id?: number }).id ?? i + 1, v]);
  const m = { nodes: new Map(entries(data.nodes)), elements: new Map(entries(data.elements)), quads: new Map(entries(data.quads)),
    sections: new Map(entries(data.sections)), materials: new Map(entries(data.materials)), loadCases: data.loadCases ?? [] } as unknown as RegionModel;
  const generate = (model: RegionModel) => {
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    return loadResultant(model, planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
  };
  if (source === 'members' && (capture || controls[example.id]) && refusalReasons[example.id]) {
    const out = plan(m);
    expect(out.outcome).toBe('BLOCKED');
    if (String(out.blockedKeys[0]?.params?.message).includes(refusalReasons[example.id]!)) expect(out.blockedKeys).toContainEqual({ key: 'engine.failedWith', params: { message: expect.stringContaining(refusalReasons[example.id]!) } });
    else expectPlanSpanRefusal(out);
  }
  if (source === 'members' && (capture || controls[example.id]) && !refusalReasons[example.id]) {
    const base = generate(m);
    expect(base.every(Number.isFinite)).toBe(true);
    if (capture) { captured[example.id] = base; writeFileSync(capture, JSON.stringify(captured, null, 2) + '\n'); return; }
    expectResultant(base, controls[example.id]!);
  }
  const regions: Array<Array<[number, number]>> = [];
  const levels = new Map<number, typeof m.elements>();
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
    if (!a || !b) continue;
    if (Math.abs((a.z ?? 0) - (b.z ?? 0)) <= 1e-3) {
      const key = Math.round((a.z ?? 0) * 1000);
      const group = levels.get(key) ?? new Map(); group.set(e.id, e); levels.set(key, group);
    }
    if (!beamLike(m, e).ok) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L === 0) continue;
    const nx = -(b.y - a.y) / L / 2, ny = (b.x - a.x) / L / 2;
    if (source === 'members') regions.push([[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]]);
  }
  for (const elements of source === 'panels' ? levels.values() : []) {
    const floor = floorLoad({ nodes: m.nodes, beams: [...elements.values()].map(e => ({ ...e, type: e.type === 'truss' ? 'truss' as const : 'frame' as const })), q: 1, distribution: 'twoWay', outlineOnly: true });
    regions.push(...floor.panels.filter(p => p.reason !== 'crossing').map(p => p.polygon));
  }
  for (const q of source === 'shells' ? m.quads.values() : []) {
    const points = q.nodes.map(id => m.nodes.get(id)!);
    if (points.some(p => !p)) continue;
    const polygon = points.map(n => [n.x, n.y] as [number, number]);
    let area = 0; polygon.forEach((p, i) => { const b = polygon[(i + 1) % polygon.length]!; area += p[0] * b[1] - b[0] * p[1]; });
    if (area !== 0) regions.push(polygon);
  }
  for (const region of regions) assertRegionInvariant(regionModel([region]), generate, undefined, [variant]);
}));

const refusalRegression = it;
const knownWrongForceVariants = new Set([
  'cad-arch-structure-dxf, remesh',
  'full-stadium, remesh',
  'geodesic-dome, rotate',
  'geodesic-dome, mirror',
  'geodesic-dome, remesh',
  'la-bombonera, remesh',
]);

for (const example of examples) for (const variant of ['rotate', 'mirror', 'remesh', 'ids'] as const) {
  const check = () => expectGravityAnswerOrRefusal(() => {
    const text = readFileSync(example.file, 'utf8');
    const data = example.code ? codeToModel(text).snapshot! : JSON.parse(text);
    const entries = (items: unknown[] = []): Array<[number, unknown]> => items.map((v, i) => Array.isArray(v) ? [v[0] as number, v[1]] : [(v as { id?: number }).id ?? i + 1, v]);
    const model = { nodes: new Map(entries(data.nodes)), elements: new Map(entries(data.elements)), quads: new Map(entries(data.quads)),
      sections: new Map(entries(data.sections)), materials: new Map(entries(data.materials)), loadCases: data.loadCases ?? [] } as unknown as RegionModel;
    const generate = (m: RegionModel) => loadResultant(m, planAreaLoads({ layout: gravityLayout(m, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true }), tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
    const changed = regionVariant(model, variant);
    if (refusalReasons[example.id]) {
      for (const m of [model, changed.model]) {
        const result = plan(m);
        expect(result.outcome).toBe('BLOCKED');
        if (String(result.blockedKeys[0]?.params?.message).includes(refusalReasons[example.id]!)) expect(result.blockedKeys).toContainEqual({ key: 'engine.failedWith', params: { message: expect.stringContaining(refusalReasons[example.id]!) } });
        else expectPlanSpanRefusal(result);
        for (const loads of [result.distributed, result.nodal, result.surface]) expect(loads).toEqual([]);
      }
      return;
    }
    const expected = generate(model);
    expect(expected.every(Number.isFinite)).toBe(true);
    expectResultant(changed.back(generate(changed.model)), expected, `${example.id} ${variant}`);
  });
  if (knownWrongForceVariants.has(`${example.id}, ${variant}`)) {
    refusalRegression(`known wrong result: #2254 complete physical gravity fixture: ${example.id}, ${variant}`, check);
  } else if (example.id === 'suspension-bridge' && variant === 'mirror') {
    refusalRegression(`known wrong result: #2255 complete physical gravity fixture: ${example.id}, ${variant}`, check);
  } else if (refusalReasons[example.id]) {
    refusalRegression(`known wrong result: #2219 unsupported physical gravity fixture: ${example.id}, ${variant}`, check);
  } else {
    it(`complete physical gravity fixture: ${example.id}, ${variant}`, check);
  }
}
