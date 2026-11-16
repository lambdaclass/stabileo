import { expect, it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { codeToModel } from '../../../model/code/format';
import { floorLoad } from '../floor-loads';
import { beamLike, gravityLayout } from '../plan-gravity';
import { planAreaLoads } from '../plan-area-loads';
import { assertRegionInvariant, regionModel, expectResultant, loadResultant, regionVariant, type RegionModel, type Resultant } from './physical-region-invariance';

const fixtureDir = new URL('../../../templates/fixtures/', import.meta.url);
const codeDir = new URL('../../../templates/examples/', import.meta.url);
const examples = [
  ...readdirSync(fixtureDir).filter(f => f.endsWith('.json')).map(file => ({ id: file.slice(0, -5), file: new URL(file, fixtureDir), code: false })),
  ...readdirSync(codeDir).filter(f => f.endsWith('.stabileo.txt')).map(file => ({ id: file.slice(0, -13), file: new URL(file, codeDir), code: true })),
];
const captured: Record<string, Resultant> = {};
const capture = process.env.REGION_CAPTURE;
const controlFile = new URL('./physical-region-example-controls.json', import.meta.url);
const controls: Record<string, Resultant> = existsSync(controlFile) ? JSON.parse(readFileSync(controlFile, 'utf8')) : {};
for (const example of examples) it(`physical gravity region invariance: ${example.id}`, () => {
  const text = readFileSync(example.file, 'utf8');
  const data = example.code ? codeToModel(text).snapshot! : JSON.parse(text);
  const entries = (items: unknown[] = []): Array<[number, unknown]> => items.map((v, i) => Array.isArray(v) ? [v[0] as number, v[1]] : [(v as { id?: number }).id ?? i + 1, v]);
  const m = { nodes: new Map(entries(data.nodes)), elements: new Map(entries(data.elements)), quads: new Map(entries(data.quads)),
    sections: new Map(entries(data.sections)), materials: new Map(entries(data.materials)), loadCases: data.loadCases ?? [] } as unknown as RegionModel;
  const generate = (model: RegionModel) => {
    const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true });
    return loadResultant(model, planAreaLoads({ layout, tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
  };
  if (capture || controls[example.id]) {
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
    regions.push([[a.x + nx, a.y + ny], [b.x + nx, b.y + ny], [b.x - nx, b.y - ny], [a.x - nx, a.y - ny]]);
  }
  for (const elements of levels.values()) {
    const floor = floorLoad({ nodes: m.nodes, beams: [...elements.values()].map(e => ({ ...e, type: e.type === 'truss' ? 'truss' as const : 'frame' as const })), q: 1, distribution: 'twoWay', outlineOnly: true });
    regions.push(...floor.panels.filter(p => p.reason !== 'crossing').map(p => p.polygon));
  }
  for (const q of m.quads.values()) {
    const points = q.nodes.map(id => m.nodes.get(id)!);
    if (points.some(p => !p)) continue;
    const polygon = points.map(n => [n.x, n.y] as [number, number]);
    let area = 0; polygon.forEach((p, i) => { const b = polygon[(i + 1) % polygon.length]!; area += p[0] * b[1] - b[0] * p[1]; });
    if (area !== 0) regions.push(polygon);
  }
  for (const region of regions) assertRegionInvariant(regionModel([region]), generate);
});

const forceInvariant = process.env.RUN_KNOWN_WRONG === '2254' ? it : it.skip;
const firstMomentInvariant = process.env.RUN_KNOWN_WRONG === '2255' ? it : it.skip;
const knownWrongForceVariants = new Set([
  'cad-arch-structure-dxf, remesh',
  'full-stadium, remesh',
  'geodesic-dome, rotate',
  'geodesic-dome, mirror',
  'geodesic-dome, remesh',
  'la-bombonera, remesh',
]);

for (const example of examples) for (const variant of ['rotate', 'mirror', 'remesh', 'ids'] as const) {
  const check = () => {
    const text = readFileSync(example.file, 'utf8');
    const data = example.code ? codeToModel(text).snapshot! : JSON.parse(text);
    const entries = (items: unknown[] = []): Array<[number, unknown]> => items.map((v, i) => Array.isArray(v) ? [v[0] as number, v[1]] : [(v as { id?: number }).id ?? i + 1, v]);
    const model = { nodes: new Map(entries(data.nodes)), elements: new Map(entries(data.elements)), quads: new Map(entries(data.quads)),
      sections: new Map(entries(data.sections)), materials: new Map(entries(data.materials)), loadCases: data.loadCases ?? [] } as unknown as RegionModel;
    const generate = (m: RegionModel) => loadResultant(m, planAreaLoads({ layout: gravityLayout(m, { mode: 'panels', tributaryWidth: 1, loadEveryPanel: true }), tributaryWidth: 1, floor: { dead: 1, lo: 0, liveOf: () => 0 } }));
    const expected = generate(model), changed = regionVariant(model, variant);
    expect(expected.every(Number.isFinite)).toBe(true);
    expectResultant(changed.back(generate(changed.model)), expected, `${example.id} ${variant}`);
  };
  if (knownWrongForceVariants.has(`${example.id}, ${variant}`)) {
    forceInvariant(`known wrong result: #2254 complete physical gravity fixture: ${example.id}, ${variant}`, check);
  } else if (example.id === 'suspension-bridge' && variant === 'mirror') {
    firstMomentInvariant(`known wrong result: #2255 complete physical gravity fixture: ${example.id}, ${variant}`, check);
  } else {
    it(`complete physical gravity fixture: ${example.id}, ${variant}`, check);
  }
}
