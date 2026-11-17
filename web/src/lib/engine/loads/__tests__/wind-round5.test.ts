import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { planWind } from '../load-plan-wind';
import { levelsWithPlanArea, type LoadModelData, type LoadPlanInput, type PlanSink } from '../load-plan';


for (const service of [false, true]) it(`#2220 — the seven-storey wind preview completes all cases service=${service}`, () => {
  const fixture = JSON.parse(readFileSync('src/lib/templates/fixtures/pro-edificio-7p.json', 'utf8'));
  const model = Object.fromEntries(['nodes', 'elements', 'sections', 'materials', 'quads'].map(k => [k, new Map(fixture[k].map((p: { id: number }) => [p.id, p]))])) as unknown as LoadModelData;
  model.loadCases = fixture.loadCases;
  const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
  const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
  planWind({ model, tributaryWidth: 10, wind: { enabled: true, basicSpeed: 40, exposure: 'B', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x', '-x', '+y', '-y'], caseSet: 'all', service: { enabled: service, v50: 40, mri: 10 }, dynamics: { n1Source: 'typed', n1: { x: 0.8, y: 0.6 }, beta: 0.02, rigidG: 'default' } } } as LoadPlanInput, levels, sink);
  expect(sink.blockedKeys).toEqual([]);
  expect(sink.cases.filter(c => c.type === 'W')).toHaveLength(32);
  expect(sink.cases.filter(c => c.type === 'Wa')).toHaveLength(service ? 8 : 0);
  expect(sink.distributed.length).toBeGreaterThan(0);
});

import { otherStructureWind } from '../wind-other';
import { windHeightField, windHeightLoads } from '../wind-pressure-field';
import { mesh, windProject } from './wind-integration-fixture';

for (const split of [false, true]) for (const angle of [0, 0.37, Math.PI / 2]) for (const mirror of [1, -1]) it(`#2220 — a face diagonal leaves column tributaries intact split=${split} angle=${angle} mirror=${mirror}`, () => {
  const model = mesh([0, 2].flatMap(x => [-1, 1].map(y => [[x, y, 0], [x, y, 6]])));
  const brace = model.elements.size + 1;
  const first = model.elements.get(1)!, last = model.elements.get(2)!;
  model.elements.set(brace, { ...first, id: brace, nodeI: first.nodeI, nodeJ: last.nodeJ });
  if (split) for (const id of [1, brace]) {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const nodeId = model.nodes.size + 1, elementId = model.elements.size + 1;
    model.nodes.set(nodeId, { id: nodeId, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 3 });
    model.elements.set(id, { ...e, nodeJ: nodeId });
    model.elements.set(elementId, { ...e, id: elementId, nodeI: nodeId });
  }
  for (const n of model.nodes.values()) { const x = mirror * n.x, y = n.y; n.x = x * Math.cos(angle) - y * Math.sin(angle); n.y = x * Math.sin(angle) + y * Math.cos(angle); }
  const field = windHeightField({ model, axis: 'x', from: 0, to: 6, pressure: (_z, width) => 4 / width });
  const lines = windHeightLoads(field, 1, 0).distributed;
  const carriers = [...model.elements.values()].filter(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return a.x === b.x && a.y === b.y;
  });
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual(carriers.map(e => e.id).sort((a, b) => a - b));
  for (const e of carriers) {
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    const height = model.nodes.get(e.nodeJ)!.z! - model.nodes.get(e.nodeI)!.z!;
    expect(parts.reduce((sum, p) => sum + (p.qX + p.qXJ!) * (p.b - p.a) / 2, 0)).toBeCloseTo(height, 10);
    for (const p of parts) { expect(p.qX).toBeCloseTo(1, 10); expect(p.qXJ).toBeCloseTo(1, 10); }
  }
});

for (const entry of ['field', 'other', 'planner'] as const) it(`#2220 — braced square tower through ${entry}`, () => {
  const model = mesh([0, 2].flatMap(x => [-1, 1].map(y => [[x, y, 0], [x, y, 6]])));
  model.elements.set(5, { ...model.elements.get(1)!, id: 5, nodeI: 1, nodeJ: 4 });
  let lines: Array<{ elementId: number; a?: number; b?: number; qX?: number; qXJ?: number }>;
  let expected: number;
  if (entry === 'field') {
    lines = windHeightLoads(windHeightField({ model, axis: 'x', from: 0, to: 6, pressure: () => 1 }), 1, 0).distributed;
    expected = 0.5;
  } else if (entry === 'other') {
    const out = otherStructureWind({ model, structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 1, diagonal: false, width: 2 }, project: { ...windProject, basicSpeed: 1 }, directions: ['+x'], tributaryWidth: 1 });
    expect(out.notes).toEqual([]);
    expect(out.cases.length).toBeGreaterThan(0);
    lines = out.cases[0]!.distributed;
    expected = 0.4;
  } else {
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    planWind({ model, tributaryWidth: 1, wind: { enabled: true, basicSpeed: 1, exposure: 'C', enclosure: 'open', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], caseSet: 'case1', structure: { kind: 'latticeTower', section: 'square', round: false, solidity: 1, diagonal: false, width: 2 } } } as LoadPlanInput, levels, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect(sink.cases.length).toBeGreaterThan(0);
    lines = sink.distributed.filter(p => p.caseIndex === 0);
    expected = 0.4;
  }
  expect([...new Set(lines.map(p => p.elementId))].sort()).toEqual([1, 2, 3, 4]);
  for (const id of [1, 2, 3, 4]) {
    const parts = lines.filter(p => p.elementId === id);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((sum, p) => sum + (p.qX! + p.qXJ!) * (p.b! - p.a!) / 2, 0)).toBeCloseTo(expected * 6, 10);
    for (const p of parts) { expect(p.qX).toBeCloseTo(expected, 10); expect(p.qXJ).toBeCloseTo(expected, 10); }
  }
});

for (const [bottom, top] of [[0.03, 0.09], [0.03, 0.05], [0.03, 0.049], [0.051, 0.09]]) for (const split of [false, true]) it(`#2220 — taper uses one width interpretation bottom=${bottom} top=${top} split=${split}`, () => {
  const model = mesh([-1, 1].map(sign => [[0, sign * bottom! / 2, 0], [0, sign * top! / 2, 6]]));
  if (split) {
    const e = model.elements.get(1)!, nodeId = model.nodes.size + 1;
    model.nodes.set(nodeId, { id: nodeId, x: 0, y: -(bottom! + (top! - bottom!) / 3) / 2, z: 2 });
    model.elements.set(1, { ...e, nodeJ: nodeId }); model.elements.set(3, { ...e, id: 3, nodeI: nodeId });
  }
  const lines = windHeightLoads(windHeightField({ model, axis: 'x', from: 0, to: 6, width: top, pressure: () => 1 }), 1, 0).distributed;
  expect([...new Set(lines.map(p => p.elementId))].sort()).toEqual([...model.elements.keys()].sort());
  const physical = top! > 0.05;
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.y - a.y, b.z! - a.z!), scale = (b.z! - a.z!) / length;
    const density = (z: number) => (physical ? bottom! + (top! - bottom!) * z / 6 : top!) / 2;
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((sum, p) => sum + (p.qX + p.qXJ!) * (p.b - p.a) / 2, 0)).toBeCloseTo((density(a.z!) + density(b.z!)) * (b.z! - a.z!) / 2, 10);
    for (const p of parts) { expect(p.qX).toBeCloseTo(scale * density(a.z! + scale * p.a), 10); expect(p.qXJ).toBeCloseTo(scale * density(a.z! + scale * p.b), 10); }
  }
});

it('#2220 — crossed face braces and a partial height band keep the four columns', () => {
  const model = mesh([0, 2].flatMap(x => [-1, 1].flatMap(y => [[[x, y, 0], [x, y, 3]], [[x, y, 3], [x, y, 6]]])));
  model.elements.set(9, { ...model.elements.get(1)!, id: 9, nodeI: 1, nodeJ: 6 });
  model.elements.set(10, { ...model.elements.get(1)!, id: 10, nodeI: 4, nodeJ: 3 });
  const lines = windHeightLoads(windHeightField({ model, axis: 'x', from: 2, to: 4, pressure: () => 1 }), 1, 0).distributed;
  expect([...new Set(lines.map(p => p.elementId))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) expect(lines.filter(p => p.elementId === id).reduce((s, p) => s + (p.qX + p.qXJ!) * (p.b - p.a) / 2, 0)).toBeCloseTo(0.5, 10);
});

it('#2220 a sloping isolated carrier retains its declared physical load', () => {
  const model = mesh([[[0, 0, 0], [0, 2, 6]]]);
  const lines = windHeightLoads(windHeightField({ model, axis: 'x', from: 0, to: 6, width: 2, pressure: () => 1 }), 1, 0).distributed;
  expect(lines).toHaveLength(1);
  expect(lines[0]!.elementId).toBe(1);
  expect((lines[0]!.qX + lines[0]!.qXJ!) * (lines[0]!.b - lines[0]!.a) / 2).toBeCloseTo(12, 10);
});

for (const entry of ['building', 'chimney', 'diagonalChimney', 'latticeTower', 'openSign', 'solidSign'] as const) for (const split of [false, true]) it(`#2220 taper width stays physical through ${entry} split=${split}`, () => {
  const model = mesh([-1, 1].map(sign => [[0, sign * 0.015, 0], [0, sign * 0.045, 6]]));
  if (split) {
    const e = model.elements.get(1)!, nodeId = model.nodes.size + 1;
    model.nodes.set(nodeId, { id: nodeId, x: 0, y: -0.025, z: 2 });
    model.elements.set(1, { ...e, nodeJ: nodeId }); model.elements.set(3, { ...e, id: 3, nodeI: nodeId });
  }
  let lines: Array<{ elementId: number; a?: number; b?: number; qX?: number; qXJ?: number }>;
  if (entry === 'building') {
    const sink: PlanSink = { cases: [], nodal: [], distributed: [], derivation: [], refs: [], assumptions: [], unsupportedKeys: [], blockedKeys: [] };
    const levels = levelsWithPlanArea(model).map(l => ({ ...l, selfWeightKN: 0, superimposedKN: 0, liveTotalKN: 0, liveParticipatingKN: 0, weightKN: 0 }));
    planWind({ model, tributaryWidth: 0.09, wind: { enabled: true, basicSpeed: 40, exposure: 'C', enclosure: 'enclosed', siteAltitudeM: 0, kzt: 1, kztSurveyed: true, roofSlopeDeg: 0, rigid: true, senses: ['+x'], caseSet: 'case1', profile: [[0, 1], [6, 1]] } } as LoadPlanInput, levels, sink);
    expect(sink.blockedKeys).toEqual([]);
    expect(sink.cases).toHaveLength(1);
    lines = sink.distributed;
  } else {
    const structure = entry === 'chimney' || entry === 'diagonalChimney' ? { kind: 'chimney' as const, section: entry === 'chimney' ? 'squareNormal' as const : 'squareDiagonal' as const, diameter: 0.09 }
      : entry === 'latticeTower' ? { kind: 'latticeTower' as const, section: 'square' as const, round: false, solidity: 1, diagonal: false }
      : entry === 'openSign' ? { kind: 'openSign' as const, members: 'flat' as const, solidity: 1 }
      : { kind: 'solidSign' as const, clearance: 0 };
    const generated = otherStructureWind({ model, structure, project: { ...windProject, basicSpeed: 1 }, directions: ['+x'], tributaryWidth: 0.09 });
    expect(generated.notes).toEqual([]);
    const minimum = generated.cases.find(c => c.nameKey === 'wind.other.minimumOtherCase');
    expect(minimum).toBeDefined();
    expect(minimum!.nodal).toEqual([]);
    lines = minimum!.distributed;
  }
  expect([...new Set(lines.map(p => p.elementId))].sort()).toEqual([...model.elements.keys()].sort());
  const pressure = entry === 'building' ? 1 : 0.8;
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!, scale = (b.z! - a.z!) / Math.hypot(b.y - a.y, b.z! - a.z!);
    const density = (z: number) => pressure * (0.015 + 0.005 * z);
    const parts = lines.filter(p => p.elementId === e.id);
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.reduce((sum, p) => sum + (p.qX! + p.qXJ!) * (p.b! - p.a!) / 2, 0)).toBeCloseTo((density(a.z!) + density(b.z!)) * (b.z! - a.z!) / 2, 10);
    for (const p of parts) { expect(p.qX).toBeCloseTo(scale * density(a.z! + scale * p.a!), 10); expect(p.qXJ).toBeCloseTo(scale * density(a.z! + scale * p.b!), 10); }
  }
});
