import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { axesStore } from '../axes.svelte';
import { allChoices, makeFrame, planeSigns } from '../frame';
import { planeInputIn } from '../plane-input';
import { solveReference } from '../../engine/steps/reference';
import { initSolver } from '../../engine/wasm-solver';
import { userVec, twoD } from '../display';
import { typedFrame } from '../typed-frame';
import { buildShellLoads, type ShellLoadFields } from '../../model/loads/shell-load-form';

beforeAll(async () => { await initSolver(); });
afterEach(() => { axesStore.reset(); modelStore.clear(); });

it('reported #1986 planeInputIn receives resolved local loads and resolved support angles through the actual model builder', async () => {
  uiStore.analysisMode = '2d';
  await modelStore.loadExample('cantilever');
  const nodes = [...modelStore.nodes.keys()];
  const element = [...modelStore.elements.keys()][0]!;
  modelStore.updateNode(nodes[1]!, 5, 2);
  modelStore.addSupport(nodes[1]!, 'rollerX', undefined, { angle: 30, isGlobal: false });
  modelStore.addDistributedLoad(element, 7, 3, 25, true);
  modelStore.addPointLoadOnElement(element, 1, 5, { isGlobal: true, angle: 20 });
  const canonical = modelStore.buildSolverInput(false)!;
  expect(canonical.loads.length).toBeGreaterThan(0);
  for (const l of canonical.loads) expect(l.data).not.toHaveProperty('isGlobal');
  for (const s of canonical.supports.values()) expect(s).not.toHaveProperty('isGlobal');
  const base = solveReference(canonical)!;
  expect(base).not.toBeNull();
  for (const c of allChoices()) {
    const f = makeFrame(c), p = planeSigns(f);
    const transformed = solveReference(planeInputIn(canonical, f))!;
    expect(transformed).not.toBeNull();
    for (const [id, r] of base.reactions) {
      const actual = transformed.reactions.get(id)!;
      expect(actual.rx).toBeCloseTo(p.sx * r.rx, 12);
      expect(actual.rz).toBeCloseTo(p.sz * r.rz, 12);
      expect(actual.my).toBeCloseTo(p.sr * r.my, 12);
    }
  }
});

it('reported #1986 hydrostatic builder preserves a model elevation under frame-independent inputs', () => {
  const wall = { id: 1, nodes: [1, 2, 3, 4], pts: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 4 }, { x: 0, y: 0, z: 4 }] };
  const fields: ShellLoadFields = {
    dirMode: 'down', dirAxis: 'Z', field: 'uniform', q: null, qc: '',
    va: { axis: 'Z', c1: null, q1: null, c2: null, q2: null }, partial: false,
    rect: { plane: 'XY', u1: null, v1: null, u2: null, v2: null },
    gamma: 10, level: 3, inside: { x: 1, y: 1, z: 1 },
    at: { x: null, y: null, z: null }, pf: { fx: null, fy: null, fz: null },
  };
  const baseline = buildShellLoads('hydro', fields, [wall], 1);
  expect(baseline).toHaveProperty('loads');
  for (const c of allChoices()) {
    axesStore.choice = c;
    const inside = userVec(1, 1, 1);
    const level = twoD.z(3);
    const result = buildShellLoads('hydro', { ...fields, level: twoD.fromZ(level), inside: { x: inside[0], y: inside[1], z: inside[2] } }, [wall], 1, (v) => v, typedFrame.vec);
    expect(result).toEqual(baseline);
  }
});

it('#1986 flat support columns preserve unequal stiffnesses and both settlement signs in every non-default frame', async () => {
  const { parseWorkbook } = await import('../../excel-import/parse');
  for (const c of allChoices()) {
    const f = makeFrame(c);
    if (f.identity) continue;
    axesStore.choice = c;
    const h = twoD.horizontal.toLowerCase(), v = twoD.vertical.toLowerCase(), n = twoD.normal.toLowerCase();
    const sheets = {
      Axes: [['up', 'right', 'hand'], [c.up, c.right, c.hand]],
      Nodes: [['id', h, v], [1, twoD.x(2), twoD.z(3)]],
      Supports: [['node', 'type', `k${h} [kN/m]`, `k${v} [kN/m]`, `kr${n} [kN·m/rad]`, `d${h} [m]`, `d${v} [m]`], [1, 'spring', 13, 17, 19, twoD.x(0.002), twoD.z(-0.003)]],
    };
    const parsed = parseWorkbook(sheets);
    expect(parsed.problems, JSON.stringify(c)).toEqual([]);
    expect(parsed.model.supports[0]).toMatchObject({ kx: 13, ky: 17, kz: 19, dx: 0.002, dz: -0.003 });
  }
});

it('#1986 spatial support columns preserve unequal translational and rotational stiffnesses in all 48 frames', async () => {
  const { parseWorkbook } = await import('../../excel-import/parse');
  const { toUser } = await import('../frame');
  for (const c of allChoices()) {
    const f = makeFrame(c);
    const flags = (values: number[]) => f.rows.map((r) => values[r.findIndex((x) => x !== 0)]);
    const parsed = parseWorkbook({
      Axes: [['up', 'right', 'hand'], [c.up, c.right, c.hand]],
      Nodes: [['id', 'x', 'y', 'z'], [1, ...toUser(f, [2, 3, 4])]],
      Supports: [['node', 'type', 'kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'dx', 'dy', 'dz'], [1, 'spring3d', ...flags([13, 17, 19]), ...flags([23, 29, 31]), ...toUser(f, [0.002, -0.003, 0.004])]],
    });
    expect(parsed.problems, JSON.stringify(c)).toEqual([]);
    expect(parsed.model.supports[0]).toMatchObject({ kx: 13, ky: 17, kz: 19, krx: 23, kry: 29, krz: 31, dx: 0.002, dy: -0.003, dz: 0.004 });
  }
});
