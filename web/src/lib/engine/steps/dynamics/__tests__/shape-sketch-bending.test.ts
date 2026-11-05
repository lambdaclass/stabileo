import { describe, expect, it } from 'vitest';
import { modelStore, historyStore, uiStore } from '../../../../store';
import { modelSystem } from '../../../dynamics/course/mdof-system';
import { modalSolve } from '../../../dynamics/course/modal-decomposition';
import { planeModel } from '../../plane-model';
import { shapeSketch, shapeScale, expand } from '../common';

function simpleBeam() {
  uiStore.analysisMode = '2d';
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(() => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
  });
  const sys = modelSystem(modelStore.model, [], { nPerMember: 1, massModel: 'consistent', barMass: true });
  const pm = planeModel(modelStore.buildSolverInput(false)!);
  return { sys, pm };
}

describe('a mode shape is drawn bent along each frame segment', () => {
  it('the first bending mode of a one-element pinned-roller beam moves only rotations and is drawn with a midspan sag', () => {
    const { sys, pm } = simpleBeam();
    const modes = modalSolve(sys.K, sys.M, sys.dofs, sys.ground).modes;
    const bending = modes.find((m) => {
      const full = expand(sys, m.phi);
      return sys.fullDofs.every((d, i) => d.dir === 'ry' || Math.abs(full[i]) < 1e-9 * Math.max(...full.map(Math.abs)));
    });
    expect(bending).toBeDefined();
    const full = expand(sys, bending!.phi);
    const scale = shapeScale(sys, full);
    expect(Number.isFinite(scale)).toBe(true);
    const sk = shapeSketch(pm, sys, new Map(), full, scale);
    const pts = sk.deformed!.flatMap((d) => d.points);
    const ends = pts.filter((q) => q.x === 0 || q.x === 4);
    for (const q of ends) expect(Math.abs(q.z)).toBeLessThan(1e-9);
    const sag = Math.max(...pts.map((q) => Math.abs(q.z)));
    expect(sag).toBeGreaterThan(0.05 * 4);
    expect(sag).toBeLessThan(0.5 * 4);
  });

  it('a horizontal translation of a node on a turned roller is drawn along the roller, in global axes', () => {
    uiStore.analysisMode = '2d';
    historyStore.clear();
    modelStore.clear();
    let b = 0;
    modelStore.batch(() => {
      const a = modelStore.addNode(0, 0);
      b = modelStore.addNode(4, 0);
      modelStore.addElement(a, b, 'truss');
      modelStore.addSupport(a, 'pinned');
      modelStore.addSupport(b, 'rollerX', undefined, { angle: 30 });
    });
    const sys = modelSystem(modelStore.model, [{ nodeId: b, m: 2 }], { nPerMember: 1, massModel: 'lumped', barMass: false });
    const pm = planeModel(modelStore.buildSolverInput(false)!);
    const full = sys.fullDofs.map((d) => (d.nodeId === b && d.dir === 'ux' ? 1 : 0));
    const sk = shapeSketch(pm, sys, new Map(), full, 0.1);
    const tip = sk.deformed![0].points.at(-1)!;
    const dx = tip.x - 4, dz = tip.z;
    expect(Math.hypot(dx, dz)).toBeCloseTo(0.1, 9);
    const dof = sys.fullDofs.find((d) => d.nodeId === b && d.dir === 'ux')!;
    const a = dof.angle ?? 0;
    expect(dx).toBeCloseTo(0.1 * Math.cos(a), 9);
    expect(dz).toBeCloseTo(0.1 * Math.sin(a), 9);
  });
});
