/**
 * The bar schedule for bending machines in BVBS (the bending industry's exchange format, version
 * 2.0): one BF2D record per mark, with its header (project, plan, index, mark, cutting length,
 * count, weight, diameter, grade, mandrel), its geometry as legs and the angles between them, and
 * the record's checksum.
 *
 * The checksum is 96 less the sum of the ASCII codes of every character before it (up to and with
 * the «@» that opens it) modulo 32. Texts are limited to plain ASCII and «@» is never written
 * inside a field.
 *
 * Pure.
 */
import type { BarPath } from '../codes/cirsoc201/bar-geometry';

export interface BvbsBar {
  mark: string; count: number; diameterMm: number; lengthMm: number; weightKg: number;
  /** Legs, mm, and the angle to the next leg, degrees (positive to the left); the last angle 0. */
  legs: Array<{ l: number; w: number }>;
  mandrelMm: number;
}

const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/@/g, '').slice(0, 30);

/** The checksum of a record's text up to and with the «@» before the C block. */
export function bvbsChecksum(text: string): number {
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0);
  return 96 - (sum % 32);
}

/** One BF2D record, CR LF ended. */
export function bvbsRecord(bar: BvbsBar, head: { project: string; plan: string; index: string; grade: string }): string {
  const h = `BF2D@Hj${clean(head.project)}@r${clean(head.plan)}@i${clean(head.index)}@p${clean(bar.mark)}@l${Math.round(bar.lengthMm)}@n${bar.count}@e${bar.weightKg.toFixed(3)}@d${bar.diameterMm}@g${clean(head.grade)}@s${Math.round(bar.mandrelMm)}@v@a@`;
  const g = `G${bar.legs.map((x) => `l${Math.round(x.l)}@w${Math.round(x.w)}@`).join('')}`;
  const body = `${h}${g}C`;
  return `${body}${bvbsChecksum(body)}@\r\n`;
}

/**
 * A bar's legs and the turns between them, from its path: straight segments in order, each with
 * the signed angle to the next in the plane they bend in (BVBS 2D). Very short segments (the
 * points of a sampled bend) are merged into the turn.
 */
export function legsOf(bar: Pick<BarPath, 'segments'>): Array<{ l: number; w: number }> {
  const segs = bar.segments.map((s) => ({ d: { x: s.end.x - s.start.x, y: s.end.y - s.start.y, z: s.end.z - s.start.z } }))
    .map((s) => ({ ...s, L: Math.hypot(s.d.x, s.d.y, s.d.z) })).filter((s) => s.L > 1e-6);
  if (!segs.length) return [];
  // The bending plane's normal: from the first two directions that are not parallel.
  let n = { x: 0, y: 0, z: 1 };
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i]!.d, b = segs[i + 1]!.d, c = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    const cl = Math.hypot(c.x, c.y, c.z);
    if (cl > 1e-9 * segs[i]!.L * segs[i + 1]!.L) { n = { x: c.x / cl, y: c.y / cl, z: c.z / cl }; break; }
  }
  const out: Array<{ l: number; w: number }> = [];
  let acc = segs[0]!.L, dir = segs[0]!.d;
  for (let i = 1; i <= segs.length; i++) {
    const s = segs[i];
    if (s) {
      const dot = (dir.x * s.d.x + dir.y * s.d.y + dir.z * s.d.z) / (Math.hypot(dir.x, dir.y, dir.z) * s.L);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      if (ang < 1) { acc += s.L; dir = s.d; continue; }
      const c = { x: dir.y * s.d.z - dir.z * s.d.y, y: dir.z * s.d.x - dir.x * s.d.z, z: dir.x * s.d.y - dir.y * s.d.x };
      const sign = c.x * n.x + c.y * n.y + c.z * n.z >= 0 ? 1 : -1;
      out.push({ l: acc * 1000, w: sign * ang });
      acc = s.L; dir = s.d;
    } else out.push({ l: acc * 1000, w: 0 });
  }
  return out;
}

/** The inside bend diameter a mark is bent on, mm: 4 db for stirrups and ties, 6 db up to Ø25, 8 db above (Tabla 25.3.1, 25.3.2). */
export const mandrelOf = (diameterMm: number, transverse: boolean) => (transverse && diameterMm <= 16 ? 4 : diameterMm <= 25 ? 6 : 8) * diameterMm;

/** A file of records, one per mark. */
export function bvbsFile(bars: readonly BvbsBar[], head: { project: string; plan: string; index: string; grade: string }): string {
  return bars.map((b) => bvbsRecord(b, head)).join('');
}
