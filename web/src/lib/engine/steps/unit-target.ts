/**
 * What the unit-load methods compute and the virtual load that measures it:
 * a displacement (a unit force along the chosen direction), a rotation (a
 * unit couple), a relative displacement between two nodes (a pair of opposite
 * unit forces) or a relative rotation (a pair of opposite unit couples). The
 * virtual load does work only on the quantity asked for, so 1·Δ equals the
 * internal virtual work.
 */
import type { MethodContext, MethodParam } from './registry';
import type { Txt } from './doc';
import { tx } from './doc';
import type { PlaneModel } from './plane-model';
import type { Reference } from './reference';
import { sketchOf, type Sketch } from './sketch';
import type { SolverInput } from '../types';
import { diagramOf, frameIds } from './deformation-common';

export type Quantity = 'disp' | 'rot' | 'relDisp' | 'relRot';
export type Direction = 'x' | 'z' | 'angle' | 'line';

export interface UnitLoad { node: number; fx: number; fz: number; my: number }

export interface Target {
  quantity: Quantity;
  node: number;
  name: string;
  /** The second node of a relative quantity. */
  node2: number | null;
  name2: string;
  dir: Direction;
  /** Degrees from +x, counter-clockwise, for `angle`. */
  angle: number;
  /** Chosen by the reader (a parameter or the selection), not by the method. */
  chosen: boolean;
  loads: UnitLoad[];
  rotation: boolean;
  /** The quantity's symbol, KaTeX. */
  sym: string;
}

export const TARGET_QUANTITIES: Quantity[] = ['disp', 'rot', 'relDisp', 'relRot'];

const L = 'course.statics.vw.p';
/** What the reader picks above the document: the quantity, its node or nodes, and a direction. */
export const TARGET_PARAMS: MethodParam[] = [
  { id: 'quantity', kind: 'select', labelKey: `${L}.quantity`, values: TARGET_QUANTITIES, default: 'disp' },
  { id: 'node', kind: 'node', labelKey: `${L}.node`, default: '' },
  { id: 'node2', kind: 'node', labelKey: `${L}.node2`, default: '', when: [{ id: 'quantity', in: ['relDisp', 'relRot'] }] },
  { id: 'dir', kind: 'select', labelKey: `${L}.dir`, values: ['auto', 'x', 'z', 'angle'], default: 'auto', when: [{ id: 'quantity', in: ['disp', 'relDisp'] }] },
  { id: 'angle', kind: 'number', labelKey: `${L}.angle`, default: '30', when: [{ id: 'quantity', in: ['disp', 'relDisp'] }, { id: 'dir', in: ['angle'] }] },
];

function nodeParam(ctx: MethodContext, id: string): number | undefined {
  const v = ctx.params?.[id];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && ctx.pm.nodes.has(n) ? n : undefined;
}

/** The quantity from the reader's parameters, the selection, or the largest movement. */
export function pickTarget(ctx: MethodContext): Target {
  const { pm } = ctx;
  const ref = ctx.ref!;
  const raw = ctx.params?.quantity;
  const quantity: Quantity = TARGET_QUANTITIES.includes(raw as Quantity) ? raw as Quantity : 'disp';
  const relative = quantity === 'relDisp' || quantity === 'relRot';
  const sel = ctx.selection.nodes.filter((n) => pm.nodes.has(n));
  const disp = (id: number) => ref.displacements.get(id) ?? { ux: 0, uz: 0, ry: 0 };
  let node = nodeParam(ctx, 'node') ?? sel[0];
  const chosen = node !== undefined;
  if (node === undefined) {
    if (relative) node = pm.nodeOrder[0];
    else {
      let best = -1;
      node = pm.nodeOrder[0];
      for (const id of pm.nodeOrder) {
        const d = disp(id);
        const m = quantity === 'rot' ? Math.abs(d.ry) : Math.hypot(d.ux, d.uz);
        if (m > best * (1 + 1e-9)) { best = m; node = id; }
      }
    }
  }
  let node2: number | null = null;
  if (relative) {
    node2 = nodeParam(ctx, 'node2') ?? sel.find((n) => n !== node) ?? null;
    if (node2 === null || node2 === node) node2 = [...pm.nodeOrder].reverse().find((n) => n !== node) ?? node;
  }
  const rawDir = ctx.params?.dir;
  const angle = Number(ctx.params?.angle ?? 30);
  let dir: Direction = rawDir === 'x' || rawDir === 'z' || rawDir === 'angle' ? rawDir : relative ? 'line' : 'z';
  if (!relative && (rawDir === undefined || rawDir === 'auto')) {
    const d = disp(node);
    dir = Math.abs(d.ux) > Math.abs(d.uz) * (1 + 1e-9) ? 'x' : 'z';
  }
  const a = pm.nodes.get(node)!, b = node2 !== null ? pm.nodes.get(node2)! : a;
  const unit = (): [number, number] => {
    if (dir === 'x') return [1, 0];
    if (dir === 'z') return [0, -1];
    if (dir === 'angle') return [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [(b.x - a.x) / L, (b.z - a.z) / L];
  };
  const [ex, ez] = unit();
  let loads: UnitLoad[];
  if (quantity === 'disp') loads = [{ node, fx: ex, fz: ez, my: 0 }];
  else if (quantity === 'rot') loads = [{ node, fx: 0, fz: 0, my: 1 }];
  else if (quantity === 'relDisp') loads = [{ node: node2!, fx: ex, fz: ez, my: 0 }, { node, fx: -ex, fz: -ez, my: 0 }];
  else loads = [{ node: node2!, fx: 0, fz: 0, my: 1 }, { node, fx: 0, fz: 0, my: -1 }];
  const name = a.name, name2 = node2 !== null ? b.name : '';
  const sym = quantity === 'disp' ? `\\delta_{${name}}` : quantity === 'rot' ? `\\theta_{${name}}`
    : quantity === 'relDisp' ? `\\Delta\\delta_{${name}${name2}}` : `\\Delta\\theta_{${name}${name2}}`;
  return { quantity, node, name, node2, name2, dir, angle, chosen, loads, rotation: quantity === 'rot' || quantity === 'relRot', sym };
}

/** The structure under the virtual load alone. */
export function unitLoadInput(input: SolverInput, tg: Target): SolverInput {
  return { ...input, loads: tg.loads.map((l) => ({ type: 'nodal' as const, data: { nodeId: l.node, fx: l.fx, fz: l.fz, my: l.my } })) };
}

/** The quantity read from the matrix solve: the work of the virtual load on its displacements. */
export function refAlong(ref: Reference, tg: Target): number {
  let s = 0;
  for (const l of tg.loads) {
    const d = ref.displacements.get(l.node) ?? { ux: 0, uz: 0, ry: 0 };
    s += l.fx * d.ux + l.fz * d.uz + l.my * d.ry;
  }
  return s;
}

/** Display scale and unit: millimetres for a displacement, radians for a rotation. */
export function targetUnit(tg: Target): { k: number; tex: string; unit: string; base: string } {
  return tg.rotation
    ? { k: 1, tex: '\\mathrm{rad}', unit: 'rad', base: '\\mathrm{rad}' }
    : { k: 1000, tex: '\\mathrm{mm}', unit: 'mm', base: '\\mathrm{m}' };
}

/** What is computed, in words. */
export function targetNote(tg: Target): Txt {
  if (tg.rotation) return tx(`course.statics.vw.target.${tg.quantity}`, { n: tg.name, m: tg.name2 });
  if (tg.quantity === 'disp' && (tg.dir === 'x' || tg.dir === 'z')) return tx(tg.dir === 'x' ? 'steps.deformation.dir.x' : 'steps.deformation.dir.z', { n: tg.name });
  return tx(`course.statics.vw.target.${tg.quantity}${tg.dir === 'angle' ? 'Angle' : tg.dir === 'line' ? 'Line' : tg.dir === 'x' ? 'X' : tg.dir === 'z' ? 'Z' : ''}`,
    { n: tg.name, m: tg.name2, a: tg.angle });
}

/** The structure with the virtual load drawn on it and its m diagram. */
export function unitSketch(pm: PlaneModel, tg: Target, virt: Reference, label: string): Sketch {
  const forces: NonNullable<Sketch['forces']> = [];
  const couples: NonNullable<Sketch['couples']> = [];
  for (const l of tg.loads) {
    const n = pm.nodes.get(l.node)!;
    if (Math.hypot(l.fx, l.fz) > 1e-12) forces.push({ x: n.x, z: n.z, fx: l.fx, fz: l.fz, label, color: 'unknown' });
    if (Math.abs(l.my) > 1e-12) couples.push({ x: n.x, z: n.z, m: l.my, label, color: 'unknown' });
  }
  return {
    ...sketchOf(pm), dims: 'auto', forces, couples,
    diagram: diagramOf(pm, frameIds(pm), (id, u) => virt.momentAt(id, u), 'unknown', ''),
  };
}
