/**
 * Where other beams bear on a beam line (indirect supports), and the hanging steel each asks
 * (`beam-hangers.ts`): a horizontal member off the line with one end on it, at a node no column
 * reaches. Its end shear is the largest of the combinations it was checked for.
 */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { lineAxis } from './line-axis';
import { tupleShear } from '../engine/design/design-axes';
import { hangerArea } from '../engine/design/beam-hangers';
import type { BeamLine } from '../engine/design/repeated-frames';

export interface IndirectSupport {
  /** The supported beam and the node it bears on. */
  elementId: number; nodeId: number;
  /** Along the line, m. */
  x: number;
  /** End shear, kN; steel it asks, cm²; the stretch the steel goes in, m along the line. */
  vu: number; need: number; from: number; to: number;
}

export function lineHangers(line: BeamLine, lengths: readonly number[]): IndirectSupport[] {
  const axis = lineAxis(line);
  if (!axis) return [];
  const total = lengths.reduce((a, l) => a + l, 0);
  // A line member can stand for a span of several bars: all of them are the line.
  const inLine = new Set(line.members.flatMap((id) => verificationStore.contextFor(id)?.span?.elements ?? [id]));
  const m = modelStore.model;
  const flat = (e: { nodeI: number; nodeJ: number }) => {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    return !!a && !!b && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-6;
  };
  const onLine = (id: number): number | null => {
    const n = m.nodes.get(id);
    if (!n) return null;
    const v = { x: n.x - axis.start.x, y: n.y - axis.start.y, z: (n.z ?? 0) - axis.start.z };
    const along = v.x * axis.dir.x + v.y * axis.dir.y + v.z * axis.dir.z;
    const off = Math.hypot(v.x - along * axis.dir.x, v.y - along * axis.dir.y, v.z - along * axis.dir.z);
    return off < 1e-3 && along > 1e-3 && along < total - 1e-3 ? along : null;
  };
  const columnAt = (nodeId: number) => [...m.elements.values()].some((e) => (e.nodeI === nodeId || e.nodeJ === nodeId) && !flat(e));
  // The depth of the line's beam, for the stretch the steel goes in.
  const ctx0 = verificationStore.contextFor(line.members[0]!);
  const hLine = ctx0?.axes.hFlex ?? 0.5;
  const out: IndirectSupport[] = [];
  for (const e of m.elements.values()) {
    if (inLine.has(e.id) || !flat(e)) continue;
    for (const [nodeId, end] of [[e.nodeI, 0], [e.nodeJ, 1]] as const) {
      const x = onLine(nodeId);
      if (x === null || columnAt(nodeId)) continue;
      // The other end off the line: a beam framing in, not one lying along it.
      if (onLine(end === 0 ? e.nodeJ : e.nodeI) !== null) continue;
      const ctx = verificationStore.contextFor(e.id);
      const st = ctx?.stations;
      if (!ctx || !st || !st.stationTs.length) continue;
      const i = end === 0 ? 0 : st.stationTs.length - 1;
      let vu = 0;
      for (const c of st.comboResults) { const s = c.stations[i]; if (s) vu = Math.max(vu, Math.abs(tupleShear(s, ctx.axes.shear))); }
      const half = (ctx.axes.bFlex + hLine) / 2;
      out.push({ elementId: e.id, nodeId, x, vu, need: hangerArea(vu, ctx0?.material.fy ?? 420), from: Math.max(0, x - half), to: Math.min(total, x + half) });
    }
  }
  return out.sort((p, q) => p.x - q.x);
}
