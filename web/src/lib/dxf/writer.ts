/**
 * PRO's DXF: the model and its results as a drawing, in space or projected.
 *
 * The drawing is the model in its own coordinates (3D, Z up) or one of its projections (plan,
 * the XZ and YZ elevations), in metres, centimetres or millimetres, with a layer per content so a
 * CAD program can show or hide each:
 *
 * - the members (lines), the nodes (points), the supports (a small symbol and its type);
 * - the shells, as 3D faces, the triangles' fourth corner repeating the third;
 * - the numbering of nodes, members and shells;
 * - the loads, one layer per load case (unique: two names that read alike take their case's id):
 *   forces as arrows with their value, member loads as arrows along the stretch they act on,
 *   surface loads as their value at the shell's centre, temperatures and tendons as text on their
 *   member or shell, imposed displacements as an arrow with their components; a kind not drawn
 *   is named on the loads' layer, and a case with nothing drawn has no layer;
 * - the results of one set (a case, a combination, the envelope, or the screen's): the deformed
 *   shape (members and shells), the M, V and N diagrams in the plane the 3D view draws each one
 *   in (both bending planes when both carry load, each on its layer), and the reactions.
 *
 * Diagrams and the deformed shape are drawn to a size relative to the structure, as the figures
 * are; the RESULTS layer states the set and the scale used, and that an SRSS or ABS set's values
 * are magnitudes (printed without a sign).
 *
 * R12 (AC1009): LINE, POINT, TEXT, 3DFACE and 3D POLYLINE, which every CAD program reads. Pure:
 * the store part is `pro/dxf-export.ts`.
 */
import type { DxfUnit } from './types';
import type { AnalysisResults3D, Displacement3D } from '../engine/types-3d';
import type { Element, Load, Node, Plate, Quad, Section, Support, Material } from '../store/model.svelte';
import { computeDiagram3D, computeGlobalMax3D, getDiagramLocalDirection, type Diagram3DKind } from '../engine/diagrams-3d';
import { computeDiagramDisplayDirection } from '../three/diagram-render-3d';
import { computeDeformedShape3D, type ElementEI } from '../three/deformed-shape-3d';
import { eiOf } from '../engine/member-deflection';
import { distributedGlobalEnds, memberFrame3D } from '../engine/member-loads';
import { projectNodeToScene } from '../geometry/coordinate-system';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { magnitudeLabel } from '../engine/result-scopes';

export type DxfProjection = 'space' | 'top' | 'front' | 'side';

export interface DxfContents {
  members: boolean; nodes: boolean; supports: boolean; shells: boolean; numbering: boolean; loads: boolean;
  deformed: boolean; moment: boolean; shear: boolean; axial: boolean; reactions: boolean;
}

export const DXF_CONTENTS: ReadonlyArray<keyof DxfContents> = [
  'members', 'nodes', 'supports', 'shells', 'numbering', 'loads', 'deformed', 'moment', 'shear', 'axial', 'reactions',
];
export const DXF_NEEDS_RESULTS: ReadonlySet<keyof DxfContents> = new Set(['deformed', 'moment', 'shear', 'axial', 'reactions']);

export interface DxfWriteOptions {
  projection: DxfProjection;
  units: DxfUnit;
  contents: DxfContents;
  results: AnalysisResults3D | null;
  /** The result set's name, written on the RESULTS layer. */
  resultsName?: string;
  /** Largest diagram ordinate, as a fraction of the structure's size. */
  diagramSize?: number;
  /** Largest movement of the deformed shape, as a fraction of the structure's size. */
  deformedSize?: number;
  leftHand?: boolean;
  /** Draw positive values toward the local axes (the results setting). */
  towardLocalAxes?: boolean;
}

export interface DxfModel {
  nodes: ReadonlyMap<number, Node>;
  elements: ReadonlyMap<number, Element>;
  supports: ReadonlyMap<number, Support>;
  plates: ReadonlyMap<number, Plate>;
  quads: ReadonlyMap<number, Quad>;
  sections: ReadonlyMap<number, Section>;
  materials: ReadonlyMap<number, Material>;
  loads: readonly Load[];
  loadCases: ReadonlyArray<{ id: number; name: string }>;
  /** A plane model drawn in XZ (`shouldProjectModelToXZ`). */
  flat: boolean;
  /** Whether the solve took shear deformation (`shearDeformation: 'none'` turns it off). */
  analysis?: { shearDeformation?: 'none' };
}

type P3 = { x: number; y: number; z: number };
type V3 = [number, number, number];

const INSUNITS: Record<DxfUnit, number> = { m: 6, cm: 5, mm: 4 };
const PER_METRE: Record<DxfUnit, number> = { m: 1, cm: 100, mm: 1000 };

/** ACI colours by layer role. */
const COLOUR = {
  members: 7, nodes: 8, supports: 1, shells: 9, numbering: 8, loads: 30, deformed: 4,
  momentZ: 5, momentY: 200, shearY: 3, shearZ: 92, axial: 6, reactions: 2, results: 7,
} as const;

/** A layer name R12 accepts: upper case letters, digits, `_`, `-` and `$`. */
export function layerName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '') || 'CAPA';
}

const n6 = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(6);
const fmt = (v: number) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toFixed(2));

export function writeDxf(model: DxfModel, opts: DxfWriteOptions, tr: (key: string) => string): string {
  const f = PER_METRE[opts.units];
  const scene = (id: number): P3 | undefined => {
    const n = model.nodes.get(id);
    if (!n) return undefined;
    const p = projectNodeToScene(n, model.flat);
    return { x: p.x, y: p.y, z: p.z ?? 0 };
  };
  /** A model point in the drawing: projected, in the drawing's unit. */
  const out = (p: P3): V3 => {
    switch (opts.projection) {
      case 'top': return [p.x * f, p.y * f, 0];
      case 'front': return [p.x * f, p.z * f, 0];
      case 'side': return [p.y * f, p.z * f, 0];
      default: return [p.x * f, p.y * f, p.z * f];
    }
  };

  // The structure's size, which sets the text, the arrows, the diagrams and the deformed shape.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const id of model.nodes.keys()) {
    const p = scene(id)!;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  const size = Number.isFinite(x0) ? Math.max(Math.hypot(x1 - x0, y1 - y0, z1 - z0), 1) : 1;
  const textH = Math.max(0.05, 0.012 * size);
  const arrowL = 0.05 * size;

  const body: string[] = [];
  const layers = new Map<string, number>();
  const use = (name: string, colour: number) => { const l = layerName(name); if (!layers.has(l)) layers.set(l, colour); return l; };

  const line = (layer: string, a: P3, b: P3) => {
    const A = out(a), B = out(b);
    body.push('0', 'LINE', '8', layer, '10', n6(A[0]), '20', n6(A[1]), '30', n6(A[2]), '11', n6(B[0]), '21', n6(B[1]), '31', n6(B[2]));
  };
  const point = (layer: string, a: P3) => {
    const A = out(a);
    body.push('0', 'POINT', '8', layer, '10', n6(A[0]), '20', n6(A[1]), '30', n6(A[2]));
  };
  const text = (layer: string, a: P3, value: string, h = textH) => {
    const A = out(a);
    body.push('0', 'TEXT', '8', layer, '10', n6(A[0]), '20', n6(A[1]), '30', n6(A[2]), '40', n6(h * f), '1', value);
  };
  const polyline = (layer: string, pts: P3[], closed = false) => {
    if (pts.length < 2) return;
    // A 3D polyline (flag 8): R12 keeps the z of every vertex only on these.
    body.push('0', 'POLYLINE', '8', layer, '66', '1', '10', '0', '20', '0', '30', '0', '70', String(8 | (closed ? 1 : 0)));
    for (const p of pts) { const A = out(p); body.push('0', 'VERTEX', '8', layer, '10', n6(A[0]), '20', n6(A[1]), '30', n6(A[2]), '70', '32'); }
    body.push('0', 'SEQEND', '8', layer);
  };
  const face = (layer: string, pts: P3[]) => {
    const c = [...pts.slice(0, 4)];
    while (c.length < 4) c.push(c[c.length - 1]!);
    body.push('0', '3DFACE', '8', layer);
    c.forEach((p, i) => { const A = out(p); body.push(`1${i}`, n6(A[0]), `2${i}`, n6(A[1]), `3${i}`, n6(A[2])); });
  };
  /** An arrow ending at `tip`, along `dir`, `len` long: its shaft and a head of two strokes. */
  const arrow = (layer: string, tip: P3, dir: V3, len: number) => {
    const l = Math.hypot(...dir); if (l < 1e-12) return;
    const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
    // A side direction across the arrow, in the drawing's plane when it is projected.
    const ref: V3 = opts.projection === 'top' ? [0, 0, 1] : opts.projection === 'front' ? [0, 1, 0] : opts.projection === 'side' ? [1, 0, 0] : Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let s: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
    const sl = Math.hypot(...s) || 1; s = [s[0] / sl, s[1] / sl, s[2] / sl];
    const at = (k: number, w: number): P3 => ({ x: tip.x - d[0] * len * k + s[0] * w, y: tip.y - d[1] * len * k + s[1] * w, z: tip.z - d[2] * len * k + s[2] * w });
    line(layer, at(1, 0), tip);
    line(layer, at(0.25, 0.1 * len), tip);
    line(layer, at(0.25, -0.1 * len), tip);
  };

  const c = opts.contents;
  const r3d = opts.results;
  const shellList = [
    ...[...model.plates.values()].map((p) => ({ tag: 'P', id: p.id, nodes: [...p.nodes] })),
    ...[...model.quads.values()].map((q) => ({ tag: 'Q', id: q.id, nodes: [...q.nodes] })),
  ];
  const centroid = (ids: number[]): P3 | undefined => {
    const ps = ids.map(scene).filter((p): p is P3 => !!p);
    if (!ps.length) return undefined;
    return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length };
  };

  // ── The model ──
  if (c.members) {
    const L = use(tr('dxf.layerStructure'), COLOUR.members);
    for (const e of model.elements.values()) { const a = scene(e.nodeI), b = scene(e.nodeJ); if (a && b) line(L, a, b); }
  }
  if (c.nodes) {
    const L = use(tr('dxf.layerNodes'), COLOUR.nodes);
    for (const id of model.nodes.keys()) point(L, scene(id)!);
  }
  if (c.shells && shellList.length) {
    const L = use(tr('dxf.layerShells'), COLOUR.shells);
    for (const s of shellList) { const ps = s.nodes.map(scene).filter((p): p is P3 => !!p); if (ps.length >= 3) face(L, ps); }
  }
  if (c.supports) {
    const L = use(tr('dxf.layerSupports'), COLOUR.supports);
    const h = 0.025 * size;
    for (const s of model.supports.values()) {
      const p = scene(s.nodeId); if (!p) continue;
      // A small pyramid under the node: it reads as a support in every projection.
      const base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: p.x + u! * h * 0.6, y: p.y + v! * h * 0.6, z: p.z - h }));
      for (let i = 0; i < 4; i++) { line(L, p, base[i]!); line(L, base[i]!, base[(i + 1) % 4]!); }
      text(L, { x: p.x + h, y: p.y, z: p.z - 1.6 * h }, supportLabel(s.type, tr), textH * 0.8);
    }
  }
  if (c.numbering) {
    const L = use(tr('dxf.layerNumbering'), COLOUR.numbering);
    for (const id of model.nodes.keys()) { const p = scene(id)!; text(L, { x: p.x + 0.4 * textH, y: p.y, z: p.z + 0.4 * textH }, String(id), textH * 0.8); }
    for (const e of model.elements.values()) {
      const a = scene(e.nodeI), b = scene(e.nodeJ);
      if (a && b) text(L, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 + 0.4 * textH }, `E${e.id}`, textH * 0.8);
    }
    for (const s of shellList) { const m = centroid(s.nodes); if (m) text(L, m, `${s.tag}${s.id}`, textH * 0.8); }
  }

  // ── The loads, a layer per case ──
  if (c.loads) {
    // A layer per case, by name; two names that read alike as a layer name ("Viento +X" and
    // "Viento X" are both LOADS_VIENTO_X) each take their case's id, so no case shares a layer.
    const caseLayer = new Map<number, string>();
    {
      const named = model.loadCases.map((lc) => [lc.id, layerName(`${tr('dxf.layerLoads')}_${lc.name}`)] as const);
      const seen = new Map<string, number>();
      for (const [, l] of named) seen.set(l, (seen.get(l) ?? 0) + 1);
      const taken = new Set<string>();
      for (const [id, l] of named) {
        let name = seen.get(l)! > 1 ? `${l}_${id}` : l;
        while (taken.has(name)) name = `${name}_${id}`;
        taken.add(name); caseLayer.set(id, name);
      }
    }
    const layerOf = (caseId: number | undefined) => layerName(caseLayer.get(caseId ?? 1) ?? `${tr('dxf.layerLoads')}_${caseId ?? 1}`);
    // What is not drawn is named on the loads' layer, not left out in silence.
    const notDrawn = new Map<string, number>();
    for (const ld of model.loads) {
      const d = ld.data as { caseId?: number };
      // The layer is declared when something is drawn on it: an empty one would read as a case without loads.
      const had = layers.has(layerOf(d.caseId));
      const drawnBefore = body.length;
      const L = use(layerOf(d.caseId), COLOUR.loads);
      const mid = (elementId: number): P3 | undefined => { const e = model.elements.get(elementId); return e ? centroid([e.nodeI, e.nodeJ]) : undefined; };
      // Each kind drawn on its own; a load with nothing to draw it on returns early.
      const draw = (): void => {
        if (ld.type === 'thermal') {
          // A temperature, as text at the member's middle: ΔT, the gradients, or the strain it stands for.
          const q = ld.data; const m = mid(q.elementId);
          const parts = q.strain !== undefined ? [`ε0 ${fmt(q.strain * 1000)} ‰`]
            : [q.dtUniform ? `ΔT ${fmt(q.dtUniform)} °C` : '', q.dtGradient ? `ΔTgz ${fmt(q.dtGradient)} °C` : '', q.dtGradientY ? `ΔTgy ${fmt(q.dtGradientY)} °C` : ''].filter(Boolean);
          if (m && parts.length) text(L, { x: m.x, y: m.y, z: m.z + 0.6 * textH }, parts.join(', '));
        } else if (ld.type === 'thermalQuad3d') {
          const q = ld.data;
          const s = q.on === 'plate' ? model.plates.get(q.quadId) : model.quads.get(q.quadId);
          const m = s ? centroid([...s.nodes]) : undefined;
          const parts = [q.dtUniform ? `ΔT ${fmt(q.dtUniform)} °C` : '', q.dtGradient ? `ΔTg ${fmt(q.dtGradient)} °C` : ''].filter(Boolean);
          if (m && parts.length) text(L, { x: m.x, y: m.y, z: m.z - 1.2 * textH }, parts.join(', '));
        } else if (ld.type === 'prestress3d') {
          // The tendon's force and its eccentricities at I, the middle and J.
          const q = ld.data; const m = mid(q.elementId);
          if (m) text(L, { x: m.x, y: m.y, z: m.z - 1.2 * textH }, `P ${fmt(q.force)} kN, e ${fmt(q.eI)} / ${fmt(q.eM)} / ${fmt(q.eJ)} m`);
        } else if (ld.type === 'displacement3d') {
          // An imposed displacement: an arrow along the movement, and its components in mm and rad.
          const q = ld.data; const p = scene(q.nodeId); if (!p) return;
          const D: V3 = [q.dx ?? 0, q.dy ?? 0, q.dz ?? 0];
          const mag = Math.hypot(...D);
          if (mag > 1e-12) arrow(L, p, D, arrowL);
          const parts = ([['dx', q.dx, 1000], ['dy', q.dy, 1000], ['dz', q.dz, 1000], ['rx', q.drx, 1], ['ry', q.dry, 1], ['rz', q.drz, 1]] as Array<[string, number | undefined, number]>)
            .filter(([, v]) => v !== undefined && v !== 0).map(([k, v, f]) => `${k}=${fmt(v! * f)}${f === 1 ? ' rad' : ' mm'}`);
          if (parts.length) text(L, { x: p.x + 0.5 * textH, y: p.y, z: p.z - 2.4 * textH }, parts.join(' '));
        } else if (ld.type === 'nodal3d') {
          const q = ld.data; const p = scene(q.nodeId); if (!p) return;
          const F: V3 = [q.fx, q.fy, q.fz];
          const mag = Math.hypot(...F);
          if (mag > 1e-9) { arrow(L, p, F, arrowL); text(L, { x: p.x - F[0] / mag * arrowL, y: p.y - F[1] / mag * arrowL, z: p.z - F[2] / mag * arrowL }, `${fmt(mag)} kN`); }
          const M = Math.hypot(q.mx, q.my, q.mz);
          if (M > 1e-9) text(L, { x: p.x + 0.5 * textH, y: p.y, z: p.z - 1.2 * textH }, `M ${fmt(q.mx)}, ${fmt(q.my)}, ${fmt(q.mz)} kN·m`);
        } else if (ld.type === 'distributed3d') {
          const q = ld.data; const e = model.elements.get(q.elementId); if (!e) return;
          const fr = memberFrame3D(model as never, e); if (!fr) return;
          const pI = scene(e.nodeI), pJ = scene(e.nodeJ); if (!pI || !pJ) return;
          const { gI, gJ, a, b } = distributedGlobalEnds(q, fr.ax, opts.leftHand);
          const Lm = fr.ax.L;
          const peak = Math.max(Math.hypot(...gI), Math.hypot(...gJ));
          if (!(peak > 1e-9) || !(Lm > 1e-9)) return;
          const at = (s: number): P3 => { const t = s / Lm; return { x: pI.x + (pJ.x - pI.x) * t, y: pI.y + (pJ.y - pI.y) * t, z: pI.z + (pJ.z - pI.z) * t }; };
          for (let k = 0; k <= 4; k++) {
            const s = a + ((b - a) * k) / 4, w = (s - a) / Math.max(b - a, 1e-12);
            const g: V3 = [gI[0] + (gJ[0] - gI[0]) * w, gI[1] + (gJ[1] - gI[1]) * w, gI[2] + (gJ[2] - gI[2]) * w];
            const m = Math.hypot(...g);
            if (m > 1e-9) arrow(L, at(s), g, arrowL * (0.4 + 0.6 * m / peak));
          }
          const mid = at((a + b) / 2);
          const qi = Math.hypot(...gI), qj = Math.hypot(...gJ);
          text(L, { x: mid.x, y: mid.y, z: mid.z + 0.6 * arrowL }, Math.abs(qi - qj) < 1e-6 ? `${fmt(qi)} kN/m` : `${fmt(qi)}–${fmt(qj)} kN/m`);
        } else if (ld.type === 'pointOnElement3d') {
          const q = ld.data; const e = model.elements.get(q.elementId); if (!e) return;
          const fr = memberFrame3D(model as never, e); const pI = scene(e.nodeI), pJ = scene(e.nodeJ);
          if (!fr || !pI || !pJ || !(fr.ax.L > 1e-9)) return;
          const t = q.a / fr.ax.L;
          const p: P3 = { x: pI.x + (pJ.x - pI.x) * t, y: pI.y + (pJ.y - pI.y) * t, z: pI.z + (pJ.z - pI.z) * t };
          const ax = fr.ax;
          const F: V3 = q.frame === 'global'
            ? [q.px ?? 0, q.py, q.pz]
            : [0, 1, 2].map((i) => (q.px ?? 0) * ax.ex[i]! + q.py * ax.ey[i]! + q.pz * ax.ez[i]!) as V3;
          const mag = Math.hypot(...F);
          if (mag > 1e-9) { arrow(L, p, F, arrowL); text(L, { x: p.x - F[0] / mag * arrowL, y: p.y - F[1] / mag * arrowL, z: p.z - F[2] / mag * arrowL }, `${fmt(mag)} kN`); }
        } else if (ld.type === 'surface3d') {
          const q = ld.data;
          const s = q.on === 'plate' ? model.plates.get(q.quadId) : model.quads.get(q.quadId);
          const m = s ? centroid([...s.nodes]) : undefined;
          if (m) text(L, m, q.qNodes?.length ? `${q.qNodes.map(fmt).join(' / ')} kN/m²` : `${fmt(q.q)} kN/m²`);
        } else {
          notDrawn.set(ld.type, (notDrawn.get(ld.type) ?? 0) + 1);
        }
      };
      draw();
      if (body.length === drawnBefore && !had) layers.delete(L);
    }
    if (notDrawn.size) {
      const L = use(tr('dxf.layerLoads'), COLOUR.loads);
      const at: P3 = { x: Number.isFinite(x0) ? x0 : 0, y: Number.isFinite(y0) ? y0 : 0, z: Number.isFinite(z0) ? z0 - 4 * textH : 0 };
      text(L, at, `${tr('dxf.loadsNotDrawn')}: ${[...notDrawn].map(([k, n]) => `${k} ×${n}`).join(', ')}`);
    }
  }

  // ── The results ──
  const ef = new Map((r3d?.elementForces ?? []).map((x) => [x.elementId, x]));
  const notes: string[] = [];
  if (r3d && (c.moment || c.shear || c.axial)) {
    const kinds: Diagram3DKind[] = [
      ...(c.moment ? (['momentZ', 'momentY'] as const) : []),
      ...(c.shear ? (['shearY', 'shearZ'] as const) : []),
      ...(c.axial ? (['axial'] as const) : []),
    ];
    const SYM: Record<string, string> = { momentZ: 'Mz', momentY: 'My', shearY: 'Vy', shearZ: 'Vz', axial: 'N' };
    const LAYER: Record<string, string> = { momentZ: 'dxf.layerMoments', momentY: 'dxf.layerMoments', shearY: 'dxf.layerShear', shearZ: 'dxf.layerShear', axial: 'dxf.layerAxial' };
    for (const kind of kinds) {
      const gmax = computeGlobalMax3D(r3d.elementForces, kind);
      if (!(gmax > 1e-9)) continue;
      const L = use(kind === 'axial' ? tr(LAYER[kind]!) : `${tr(LAYER[kind]!)}_${SYM[kind]}`, COLOUR[kind as keyof typeof COLOUR] as number);
      const k = ((opts.diagramSize ?? 0.08) * size) / gmax;
      notes.push(`${SYM[kind]}: 1 ${kind.startsWith('moment') ? 'kN·m' : 'kN'} = ${fmt(k * f)} ${opts.units}`);
      const isMoment = kind === 'momentY' || kind === 'momentZ';
      for (const e of model.elements.values()) {
        const forces = ef.get(e.id); const pI = scene(e.nodeI), pJ = scene(e.nodeJ);
        if (!forces || !pI || !pJ) continue;
        // The member's axes as the 3D view draws its diagrams (`export/figure-3d.ts`).
        const localY = (e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined) ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
        const roll = (e.rollAngle ?? 0) + (model.sections.get(e.sectionId)?.rotation ?? 0);
        let axes;
        try { axes = computeLocalAxes3D({ id: 0, ...pI }, { id: 0, ...pJ }, localY, roll || undefined, opts.leftHand); } catch { continue; }
        const { perpVec, sign } = computeDiagramDisplayDirection(axes, getDiagramLocalDirection(kind), opts.towardLocalAxes);
        const dg = computeDiagram3D(forces, kind);
        const base = (t: number): P3 => ({ x: pI.x + (pJ.x - pI.x) * t, y: pI.y + (pJ.y - pI.y) * t, z: pI.z + (pJ.z - pI.z) * t });
        const tip = (t: number, v: number): P3 => { const b = base(t); const o = sign * v * k; return { x: b.x + perpVec.x * o, y: b.y + perpVec.y * o, z: b.z + perpVec.z * o }; };
        polyline(L, [base(0), ...dg.points.map((p) => tip(p.t, p.value)), base(1)], true);
        if (Math.abs(dg.maxAbsValue) > 0.02 * gmax) {
          const at = dg.points.find((p) => p.value === dg.maxAbsValue) ?? dg.points[0]!;
          // A moment is printed in the screen's sign; an SRSS or ABS magnitude has none to flip.
          text(L, tip(at.t, at.value), fmt(isMoment && !r3d.magnitude ? -dg.maxAbsValue : dg.maxAbsValue));
        }
      }
    }
  }
  if (r3d && c.deformed) {
    const L = use(tr('dxf.layerDeformed'), COLOUR.deformed);
    const disp = new Map<number, Displacement3D>(r3d.displacements.map((d) => [d.nodeId, d]));
    let dmax = 0;
    for (const d of r3d.displacements) dmax = Math.max(dmax, Math.hypot(d.ux, d.uy, d.uz));
    const scale = dmax > 1e-12 ? ((opts.deformedSize ?? 0.05) * size) / dmax : 1;
    notes.push(`${tr('dxf.deformedScale')} ×${fmt(scale)}`);
    const moved = (id: number): P3 | undefined => {
      const p = scene(id), d = disp.get(id);
      return p && d ? { x: p.x + d.ux * scale, y: p.y + d.uy * scale, z: p.z + d.uz * scale } : p;
    };
    for (const e of model.elements.values()) {
      const pI = scene(e.nodeI), pJ = scene(e.nodeJ), dI = disp.get(e.nodeI), dJ = disp.get(e.nodeJ), forces = ef.get(e.id);
      if (!pI || !pJ || !dI || !dJ || !forces) continue;
      const ei: ElementEI | undefined = eiOf(model.materials.get(e.materialId), model.sections.get(e.sectionId), model.analysis);
      const localY = (e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined) ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
      const roll = (e.rollAngle ?? 0) + (model.sections.get(e.sectionId)?.rotation ?? 0);
      const curve = computeDeformedShape3D(pI, pJ, dI, dJ, forces, scale, ei, localY, roll || undefined);
      polyline(L, curve.map((v) => ({ x: v.x, y: v.y, z: v.z })));
    }
    for (const s of shellList) {
      const ps = s.nodes.map(moved).filter((p): p is P3 => !!p);
      if (ps.length >= 3) polyline(L, ps, true);
    }
  }
  if (r3d && c.reactions) {
    const L = use(tr('dxf.layerReactions'), COLOUR.reactions);
    for (const r of r3d.reactions) {
      const p = scene(r.nodeId); if (!p) continue;
      const parts = ([['Fx', r.fx], ['Fy', r.fy], ['Fz', r.fz], ['Mx', r.mx], ['My', r.my], ['Mz', r.mz]] as Array<[string, number]>)
        .filter(([, v]) => Math.abs(v) > 1e-3).map(([k, v]) => `${k}=${fmt(v)}`);
      if (parts.length) text(L, { x: p.x + textH, y: p.y, z: p.z - 3 * textH }, parts.join(' '));
      const F: V3 = [r.fx, r.fy, r.fz];
      if (Math.hypot(...F) > 1e-6) arrow(L, p, F, arrowL);
    }
  }
  if (r3d && notes.length) {
    const L = use(tr('dxf.layerResults'), COLOUR.results);
    const at: P3 = { x: Number.isFinite(x0) ? x0 : 0, y: Number.isFinite(y0) ? y0 : 0, z: Number.isFinite(z1) ? z1 + 4 * textH : 0 };
    const m = magnitudeLabel(r3d, tr);
    const lines = [opts.resultsName ? `${tr('dxf.resultsOf')} ${opts.resultsName}${m ? ` (${m})` : ''}` : m, ...notes].filter(Boolean);
    // Under one another in the drawing's own vertical: z in space and in the elevations, y in plan.
    lines.forEach((s, i) => text(L, opts.projection === 'top' ? { ...at, y: at.y - i * 1.6 * textH } : { ...at, z: at.z - i * 1.6 * textH }, s));
  }

  const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', String(INSUNITS[opts.units]), '0', 'ENDSEC'];
  const table = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.size)];
  for (const [name, colour] of layers) table.push('0', 'LAYER', '2', name, '70', '0', '62', String(colour), '6', 'CONTINUOUS');
  table.push('0', 'ENDTAB', '0', 'ENDSEC');
  return [...head, ...table, '0', 'SECTION', '2', 'ENTITIES', ...body, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

function supportLabel(type: string, tr: (key: string) => string): string {
  switch (type) {
    case 'fixed': case 'fixed3d': return tr('dxf.supportFixed');
    case 'pinned': case 'pinned3d': return tr('dxf.supportPinned');
    case 'spring': case 'spring3d': return tr('dxf.supportSpring');
    default: return layerName(type);
  }
}
