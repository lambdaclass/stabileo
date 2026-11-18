import { expect, it } from 'vitest';
import { otherStructureWind, type OtherStructure } from '../wind-other';
import { mesh, windProject, remeshWind, variants, windResultants, assertWindResultants } from './wind-integration-fixture';

for (const kind of ['chimney', 'openSign', 'latticeTower', 'solidSign'] as const) for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  it(`#2206 uniform pressure centroid ${kind} ${variant} ${dir}`, () => {
    const cross = dir.endsWith('x') ? [0, 2] : [2, 0];
    const original = kind === 'solidSign' ? mesh([[[0, 0, 0], [0, 0, 6]], [[cross[0]!, cross[1]!, 0], [cross[0]!, cross[1]!, 6]]]) : mesh([[[0, 0, 0], [0, 0, 6]]]);
    const m = remeshWind(original, variant), d = m.direction(dir);
    const structure: OtherStructure = kind === 'chimney' ? { kind, section: 'squareNormal', diameter: 2 } : kind === 'openSign' ? { kind, members: 'flat', solidity: 1, width: 2 } : kind === 'latticeTower' ? { kind, section: 'square', round: false, solidity: 1, diagonal: false, width: 2 } : { kind, clearance: 0 };
    const c = otherStructureWind({ model: m.model, structure, project: { ...windProject, basicSpeed: 1, meanRoofHeight: 6 }, directions: [d], tributaryWidth: 1 }).cases[0]!;
    const F = 0.8 * 2 * 6 * (dir.startsWith('-') ? -1 : 1), fx = dir.endsWith('x') ? F : 0, fy = dir.endsWith('y') ? F : 0;
    const mz = kind === 'solidSign' ? (dir.endsWith('x') ? -fx : fy) : 0;
    assertWindResultants(windResultants(m.model, c.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ })), c.nodal, m.back), [fx, fy, 0, -3 * fy, 3 * fx, mz]);
    expect(c.nodal).toEqual([]);
    expect(c.distributed.length).toBeGreaterThan(0);
  });
}

it('#2206 below-ground support carriers carry the above-ground field without inventing buried wind area', () => {
  const model = mesh([[[0, 0, -2], [0, 0, 6]]]);
  const c = otherStructureWind({ model, structure: { kind: 'chimney', section: 'squareNormal', diameter: 2 }, project: { ...windProject, basicSpeed: 1 }, directions: ['+x'], tributaryWidth: 1 }).cases[0]!;
  assertWindResultants(windResultants(model, c.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ })), c.nodal), [9.6, 0, 0, 0, 28.8, 0]);
});

it('#2206 the uniform minimum is a separate physical case, preserving the calculated height field', () => {
  const model = mesh([[[0, 0, 0], [0, 0, 20]]]);
  const project = { ...windProject, structureKind: 'chimneyRound' as const, basicSpeed: 45, meanRoofHeight: 20 };
  const out = otherStructureWind({ model, structure: { kind: 'chimney', section: 'roundRough', diameter: 3 }, project, directions: ['+x'], tributaryWidth: 1 });
  expect(out.cases.map(c => c.nameKey).sort()).toEqual(['wind.other.case', 'wind.other.minimumOtherCase']);
  const minimum = out.cases.find(c => c.nameKey === 'wind.other.minimumOtherCase')!;
  assertWindResultants(windResultants(model, minimum.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ })), minimum.nodal), [48, 0, 0, 0, 480, 0]);
  const exponent = 2 / 9.8, cf = 0.7 + (0.8 - 0.7) * (20 / 3 - 1) / 6;
  const factor = 3 * 0.85 * cf * 0.613 * 2.41 * 45 ** 2 / 750 ** exponent / 1000;
  const force = factor * (5 * 5 ** exponent + (20 ** (1 + exponent) - 5 ** (1 + exponent)) / (1 + exponent));
  const first = factor * (25 / 2 * 5 ** exponent + (20 ** (2 + exponent) - 5 ** (2 + exponent)) / (2 + exponent));
  assertWindResultants(windResultants(model, out.cases.find(c => c.nameKey === 'wind.other.case')!.distributed.map(p => ({ ...p, q: p.qZ, qJ: p.qZJ }))), [force, 0, 0, 0, first, 0]);
});
