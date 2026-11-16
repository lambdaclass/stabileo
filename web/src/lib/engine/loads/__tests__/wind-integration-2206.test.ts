import { expect, it } from 'vitest';
import { otherStructureWind, type OtherStructure } from '../wind-other';
import { mesh, windProject, remeshWind, variants, windResultants, assertWindResultants } from './wind-integration-fixture';

const wrong = process.env.RUN_KNOWN_WRONG === '2206' ? it : it.skip;
for (const kind of ['chimney', 'openSign', 'latticeTower', 'solidSign'] as const) for (const variant of variants) for (const dir of ['+x', '-x', '+y', '-y'] as const) {
  wrong(`known wrong result: #2206 uniform pressure centroid ${kind} ${variant} ${dir}`, () => {
    const cross = dir.endsWith('x') ? [0, 2] : [2, 0];
    const original = kind === 'solidSign' ? mesh([[[0, 0, 0], [0, 0, 6]], [[cross[0]!, cross[1]!, 0], [cross[0]!, cross[1]!, 6]]]) : mesh([[[0, 0, 0], [0, 0, 6]]]);
    const m = remeshWind(original, variant), d = m.direction(dir);
    const structure: OtherStructure = kind === 'chimney' ? { kind, section: 'squareNormal', diameter: 2 } : kind === 'openSign' ? { kind, members: 'flat', solidity: 1, width: 2 } : kind === 'latticeTower' ? { kind, section: 'square', round: false, solidity: 1, diagonal: false, width: 2 } : { kind, clearance: 0 };
    const c = otherStructureWind({ model: m.model, structure, project: { ...windProject, basicSpeed: 1, meanRoofHeight: 6 }, directions: [d], tributaryWidth: 1 }).cases[0]!;
    const F = 0.8 * 2 * 6 * (dir.startsWith('-') ? -1 : 1), fx = dir.endsWith('x') ? F : 0, fy = dir.endsWith('y') ? F : 0;
    const mz = kind === 'solidSign' ? (dir.endsWith('x') ? -fx : fy) : 0;
    assertWindResultants(windResultants(m.model, [], c.nodal, m.back), [fx, fy, 0, -3 * fy, 3 * fx, mz]);
    expect(c.nodal.some(n => m.model.nodes.get(n.nodeId)!.z === 0 && Math.hypot(n.fx, n.fy) > 0)).toBe(true);
  });
}
