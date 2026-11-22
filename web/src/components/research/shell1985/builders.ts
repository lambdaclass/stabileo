import { cases, type Case } from './cases';

const restraintKeys = ['dx', 'dy', 'dz', 'drx', 'dry', 'drz', 'isInclined', 'krx', 'kry', 'krz', 'kw', 'kx', 'ky', 'kz', 'normalX', 'normalY', 'normalZ', 'rw'] as const;

function support(nodeId: number, f: boolean[]) {
  const s: Record<string, unknown> = Object.fromEntries(restraintKeys.map(k => [k, null]));
  return { ...s, nodeId, rx: f[0], ry: f[1], rz: f[2], rrx: f[3], rry: f[4], rrz: f[5] };
}

const nodal = (nodeId: number, fx: number, fy: number, fz: number) => ({ type: 'nodal', data: { bw: null, fx, fy, fz, mx: 0, my: 0, mz: 0, nodeId } });

function grid(n: number, at: (i: number, j: number) => [number, number, number]) {
  const nodes: Record<string, { id: number; x: number; y: number; z: number }> = {};
  const ids: number[][] = [];
  let id = 1;
  for (let i = 0; i <= n; i++) {
    ids.push([]);
    for (let j = 0; j <= n; j++) {
      const [x, y, z] = at(i, j);
      nodes[String(id)] = { id, x, y, z };
      ids[i].push(id++);
    }
  }
  return { nodes, ids };
}

function quads(ids: number[][], n: number, thickness: number) {
  const out: Record<string, { id: number; materialId: number; nodes: number[]; thickness: number }> = {};
  let id = 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    out[String(id)] = { id, materialId: 1, nodes: [ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]], thickness };
    id++;
  }
  return out;
}

const empty = { connectors: {}, constraints: [], curvedBeams: [], curvedShells: {}, elements: {}, leftHand: null, plates: {}, quad9s: {}, sections: {}, solidShells: {}, solverOptions: null };

export function roofInput(n: number) {
  const r = 25, halfL = 25, theta = 40 * Math.PI / 180, gravity = 90, t = 0.25;
  const { nodes, ids } = grid(n, (i, j) => {
    const th = (j / n) * theta;
    return [(i / n) * halfL, r * Math.sin(th), r * Math.cos(th) - r];
  });
  const supports: Record<string, unknown> = {};
  const loads = [];
  const area = (halfL / n) * r * (theta / n);
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const f = [i === 0, i === n || j === 0, i === n, j === 0, i === 0, i === 0 || j === 0];
    if (f.some(Boolean)) supports[String(ids[i][j])] = support(ids[i][j], f);
    const edges = Number(i === 0 || i === n) + Number(j === 0 || j === n);
    loads.push(nodal(ids[i][j], 0, 0, -gravity * area * [1, 0.5, 0.25][edges]));
  }
  return { input: { ...empty, nodes, materials: { '1': { e: 4.32e8 / 1000, id: 1, nu: 0 } }, supports, loads, quads: quads(ids, n, t) }, node: ids[0][n] };
}

export function cylinderInput(n: number) {
  const r = 300, halfL = 300, t = 3;
  const { nodes, ids } = grid(n, (i, j) => {
    const th = (j / n) * (Math.PI / 2);
    return [(i / n) * halfL, r * Math.cos(th), r * Math.sin(th)];
  });
  const supports: Record<string, unknown> = {};
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const f = [false, false, false, false, false, false];
    if (i === 0) { f[0] = true; f[4] = true; f[5] = true; }
    if (i === n) { f[1] = true; f[2] = true; }
    if (j === 0) { f[2] = true; f[3] = true; f[4] = true; }
    if (j === n) { f[1] = true; f[3] = true; f[5] = true; }
    if (f.some(Boolean)) supports[String(ids[i][j])] = support(ids[i][j], f);
  }
  return { input: { ...empty, nodes, materials: { '1': { e: 3000, id: 1, nu: 0.3 } }, supports, loads: [nodal(ids[0][0], 0, -0.25, 0)], quads: quads(ids, n, t) }, node: ids[0][0] };
}

export const BUILT = ['roof', 'cylinder'] as const;
export type BuiltGroup = (typeof BUILT)[number];
export const MESH_RANGE = { min: 2, max: 20 };

export function caseFor(group: BuiltGroup, n: number): Case & { built: boolean } {
  const fixture = cases.find(c => c.group === group && c.mesh === n);
  if (fixture) return { ...fixture, built: false };
  const template = cases.find(c => c.group === group)!;
  const { input, node } = group === 'roof' ? roofInput(n) : cylinderInput(n);
  return {
    ...template, id: `${group}-${n}`, mesh: n, label: template.label.replace(/\d+×\d+$/, `${n}×${n}`),
    measurement: { ...template.measurement, node }, input: input as unknown as Case['input'], built: true,
  };
}
