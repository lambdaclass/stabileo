/**
 * Where a beam line lies in the model: its first point and its unit direction, from the end nodes
 * of its first and last members (their spans' ends when a member stands for a span). Positions
 * along the line (bars, cuts) become model points with it.
 */
import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import type { BeamLine } from '../engine/design/repeated-frames';

type P3 = { x: number; y: number; z: number };

/** A line member's two end nodes in the line's sense: its span's ends when it stands for one. */
function endsOf(id: number, forward: boolean): [number, number] | null {
  const span = verificationStore.contextFor(id)?.span;
  const e = modelStore.elements.get(id);
  const [a, b] = span ? [span.start, span.end] : e ? [e.nodeI, e.nodeJ] : [NaN, NaN];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return forward ? [a, b] : [b, a];
}

export function lineAxis(line: Pick<BeamLine, 'members' | 'forward'>): { start: P3; dir: P3 } | null {
  const n = line.members.length;
  if (!n) return null;
  const first = endsOf(line.members[0]!, line.forward[0] !== false);
  const last = endsOf(line.members[n - 1]!, line.forward[n - 1] !== false);
  const p0 = first && modelStore.nodes.get(first[0]), p1 = last && modelStore.nodes.get(last[1]);
  if (!p0 || !p1) return null;
  const d = { x: p1.x - p0.x, y: p1.y - p0.y, z: (p1.z ?? 0) - (p0.z ?? 0) }, L = Math.hypot(d.x, d.y, d.z) || 1;
  return { start: { x: p0.x, y: p0.y, z: p0.z ?? 0 }, dir: { x: d.x / L, y: d.y / L, z: d.z / L } };
}
