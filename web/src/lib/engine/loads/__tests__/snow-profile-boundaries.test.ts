import { expect, it } from 'vitest';
import { mesh, transform } from './snow-surface-round2-fixture';
import { snow } from './snow-roof-plane-fixture';
import { assertSnowRemeshInvariant, snowDistributedResultant } from './snow-remesh-invariance';
import { gravityLayout } from '../plan-gravity';
import { snowLoadCases } from '../snow-loads';
import type { LoadModelData } from '../load-plan';

for (const mode of ['width', 'panels'] as const) for (const angle of [0, 0.37]) for (const length of [6, 10, 30]) {
  it(`physical drift termination retains force and moment across subdivision ${mode} ${angle} ${length}`, () => {
    const lower = [[0, 0, 3], [length, 0, 3], [length, 4, 3], [0, 4, 3]];
    const upper = [[-30, 0, 9], [0, 0, 9], [0, 4, 9], [-30, 4, 9]];
    const model = transform(mesh([lower, upper]), angle, 0);
    const direction = [Math.cos(angle), Math.sin(angle)];
    const generate = (m: LoadModelData) => {
      const layout = gravityLayout(m, { mode: 'width', tributaryWidth: 1 });
      layout.panels = [lower, upper].map(ring => ({ polygon: ring.map(([x, y]) => [x! * Math.cos(angle) - y! * Math.sin(angle), x! * Math.sin(angle) + y! * Math.cos(angle)] as [number, number]), z: ring[0]![2]!, roof: true }));
      const carriers = [...m.elements.values()].filter(e => [e.nodeI, e.nodeJ].every(id => {
        const p = m.nodes.get(id)!;
        return p.z === 3 && Math.abs(p.y * Math.cos(angle) - p.x * Math.sin(angle)) < 1e-8;
      }));
      layout.points = [];
      layout.widthMembers = mode === 'width' ? layout.widthMembers.filter(w => carriers.some(e => e.id === w.elementId)) : [];
      layout.pieces = mode === 'panels' ? carriers.map(e => {
        const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!;
        return { elementId: e.id, panel: 0, roof: true, a: 0, b: Math.hypot(b.x - a.x, b.y - a.y), wI: 1, wJ: 1 };
      }) : [];
      const out = snowLoadCases({ model: m, layout, snow: { ...snow, roofKind: 'mono' }, tributaryWidth: 1 })!;
      expect(out.result.refused).toBeUndefined();
      return out;
    };
    const out = generate(model), gamma = 0.426 * 1 + 2.2, height = 0.924, width = 4 * height;
    const [force, moment] = snowDistributedResultant(model, out.cases[0]!.distributed, new Set([1]), [0, 0], direction);
    const balanced = Math.max(0.7 * 1, Math.min(1, 1));
    expect(force).toBeCloseTo(-balanced * length - gamma * height * width / 2, 10);
    expect(moment).toBeCloseTo(-balanced * length * length / 2 - gamma * height * width * width / 6, 10);
    for (const count of [3, 7, 11]) assertSnowRemeshInvariant(model, new Map([[1, count]]), generate);
  });
}
