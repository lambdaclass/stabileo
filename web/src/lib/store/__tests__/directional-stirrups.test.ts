import { rebarHash } from '../../engine/design/rebar-hash';
import { beforeEach, expect, it } from 'vitest';
import { modelStore } from '../model.svelte';
import { getReinforcement, setStirrups, setTies } from '../rebar-edit';

beforeEach(() => modelStore.clear());
function restore(secondaryLegs?: number) {
  modelStore.restore({ nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 1, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'H25', e: 25000, nu: 0.2, fc: 25 }]],
    sections: [[1, { id: 1, name: 'RC', b: 0.3, h: 0.6 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1,
      reinforcement: { stirrups: { diameter: 8, legs: 6, spacing: 0.1, secondaryLegs }, regions: {
        stirrupsSupport: { diameter: 8, legs: 4, spacing: 0.1, secondaryLegs },
        stirrupsSpan: { diameter: 8, legs: 3, spacing: 0.15, secondaryLegs },
      } } }]], supports: [], loads: [], loadCases: [], combinations: [],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 1, load: 1 },
  } as never);
}
for (const secondaryLegs of [undefined, 2, 3, 4, 5, 6]) {
  it(`known wrong result: #2171 restores directional stirrups conservatively ${secondaryLegs}`, () => {
    restore(secondaryLegs);
    const r = getReinforcement(1)!;
    expect(r.stirrups!.legs).toBe(6);
    expect(r.stirrups!.secondaryLegs).toBe(secondaryLegs ?? 2);
    expect(r.regions!.stirrupsSupport!.secondaryLegs).toBe(secondaryLegs ?? 2);
    expect(r.regions!.stirrupsSpan!.secondaryLegs).toBe(secondaryLegs ?? 2);
  });
  it(`known wrong result: #2171 edits preserve directional crossties ${secondaryLegs}`, () => {
    restore(secondaryLegs);
    setTies(1, { secondaryLegs: 3 });
    setStirrups(1, 'stirrupsSupport', { secondaryLegs: 5 });
    setStirrups(1, 'stirrupsSpan', { secondaryLegs: 4 });
    setTies(1, { legs: 4 });
    setStirrups(1, 'stirrupsSupport', { spacing: 0.15 });
    const r = getReinforcement(1)!;
    expect(r.stirrups!.secondaryLegs).toBe(3);
    expect(r.regions!.stirrupsSupport!.secondaryLegs).toBe(5);
    expect(r.regions!.stirrupsSpan!.secondaryLegs).toBe(4);
    const saved = modelStore.snapshot();
    modelStore.clear();
    modelStore.restore(saved);
    expect(getReinforcement(1)).toEqual(r);
  });
}
for (const input of [1, 2, 6, 7]) it(`secondary leg editor enforces existing constructible range ${input}`, () => {
  restore();
  setTies(1, { secondaryLegs: input });
  setStirrups(1, 'stirrupsSpan', { secondaryLegs: input });
  expect(getReinforcement(1)!.stirrups!.secondaryLegs).toBe(Math.min(6, Math.max(2, input)));
  expect(getReinforcement(1)!.regions!.stirrupsSpan!.secondaryLegs).toBe(Math.min(6, Math.max(2, input)));
});

it('known wrong result: #2171 the conservative default keeps its identity and added crossties invalidate it', () => {
  const before = { stirrups: { diameter: 8, legs: 4, spacing: 0.1 } };
  expect(rebarHash(before)).toBe(rebarHash({ stirrups: { ...before.stirrups, secondaryLegs: 2 } }));
  expect(rebarHash(before)).not.toBe(rebarHash({ stirrups: { ...before.stirrups, secondaryLegs: 3 } }));
});

it('known wrong result: #2171 manual support edits preserve both actual cages and update both ends', () => {
  restore();
  const r = getReinforcement(1)!;
  const start = { diameter: 6, legs: 6, secondaryLegs: 3, spacing: 0.1 };
  const end = { diameter: 8, legs: 2, secondaryLegs: 6, spacing: 0.15 };
  r.regions = { ...r.regions, stirrupsStart: start, stirrupsEnd: end };
  modelStore.reinforcementTransaction(api => api.setReinforcement(1, r));
  setStirrups(1, 'stirrupsSupport', { spacing: 0.075 });
  expect(getReinforcement(1)!.regions!.stirrupsStart).toEqual({ ...start, spacing: 0.075 });
  expect(getReinforcement(1)!.regions!.stirrupsEnd).toEqual({ ...end, spacing: 0.075 });
  setStirrups(1, 'stirrupsSupport', { secondaryLegs: 7 });
  expect(getReinforcement(1)!.regions!.stirrupsStart!.secondaryLegs).toBe(6);
  expect(getReinforcement(1)!.regions!.stirrupsEnd!.secondaryLegs).toBe(6);
  const saved = modelStore.snapshot();
  modelStore.clear();
  modelStore.restore(saved);
  expect(getReinforcement(1)!.regions!.stirrupsStart).toEqual({ ...start, spacing: 0.075, secondaryLegs: 6 });
  expect(getReinforcement(1)!.regions!.stirrupsEnd).toEqual({ ...end, spacing: 0.075, secondaryLegs: 6 });
});

it('known wrong result: #2198 manual spacing edits preserve distinct end cages when leg fields are undefined', () => {
  restore(6);
  const r = getReinforcement(1)!;
  const start = { diameter: 6, legs: 2, secondaryLegs: 2, spacing: 0.1 };
  const end = { diameter: 10, legs: 6, secondaryLegs: 4, spacing: 0.15 };
  r.regions = { ...r.regions, stirrupsStart: start, stirrupsEnd: end };
  modelStore.reinforcementTransaction(api => api.setReinforcement(1, r));
  setStirrups(1, 'stirrupsSupport', { spacing: 0.075, diameter: undefined, legs: undefined, secondaryLegs: undefined });
  expect(getReinforcement(1)!.regions).toMatchObject({
    stirrupsStart: { ...start, spacing: 0.075 },
    stirrupsEnd: { ...end, spacing: 0.075 },
    stirrupsSupport: { diameter: 8, legs: 4, secondaryLegs: 6, spacing: 0.075 },
  });
  setStirrups(1, 'stirrupsSupport', { secondaryLegs: 7, spacing: undefined });
  expect(getReinforcement(1)!.regions).toMatchObject({
    stirrupsStart: { ...start, spacing: 0.075, secondaryLegs: 6 },
    stirrupsEnd: { ...end, spacing: 0.075, secondaryLegs: 6 },
  });
});
