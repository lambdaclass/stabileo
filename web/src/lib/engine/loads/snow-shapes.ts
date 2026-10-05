/**
 * Snow on curved roofs, domes, and roofs of several ridges (sawtooth, folded plates, a row of
 * vaults), from CIRSOC 104-2005 (`docs/codes/CIRSOC/markdown/cirsoc-104-2005`):
 *
 *   §4.3, curved roofs: C_s from the slope at each point (Figura 2); no snow past 70°.
 *   §6.2 and Figura 3, unbalanced on a curved roof: nothing windward; leeward from 0,5 p_f at the
 *     crown to 2 p_f C_s/C_e at the eave (eave below 30°, case 1); to 2 p_f C_s(30°)/C_e at the
 *     30° point and then to 2 p_f C_s(eave)/C_e at the eave (eave from 30° to 70°, case 2); to the
 *     30° point as in case 2 and down to 0 at the 70° point (eave past 70°, case 3). Not when the
 *     line from the eave (or the 70° point) to the crown is under 10° or over 60°. A curved roof
 *     abutting the ground or another roof at its eave (cases 2 and 3, the dotted line of Figura 3)
 *     keeps the 30° point's value out to the eave: the load is not to decrease past it, in case 3
 *     the part past 70° included, since the snow lies against what abuts it there.
 *   §6.3 and Figura 6, several ridges: C_s = 1, the balanced load is p_f; unbalanced from 0,5 p_f
 *     at the ridges to 2 p_f/C_e in the valleys, when the slopes pass 1,8°. The snow over a valley
 *     stays below the snow over the ridge: p_valley ≤ 0,5 p_f + γ (z_ridge − z_valley).
 *   §6.4, domes: the unbalanced load of a curved roof over the 90° sector downwind in plan,
 *     tapering linearly to zero over 22,5° on each side, none on the other 225°.
 *
 * ── The profile ───────────────────────────────────────────────────
 *
 * The roof's section is read off the roof members: along the slope axis for a curved roof and
 * for several ridges, and by the horizontal distance from the crown for a dome. At each position
 * the profile keeps the highest node; its slope at a point is the slope between the profile
 * points around it, so a horizontal purlin halfway down a vault carries the vault's slope there,
 * not its own. Loads are read per plan point: each end of a member, or a panel's centre.
 *
 * Pure: no store.
 */
import { slopeFactor } from '../../codes/cirsoc104/snow';
import { clause, type ClauseRef } from '../../codes/regulation';
import { msg, round, type EngineMessage } from '../../codes/message';

const R = (c: string, l?: string) => clause('cirsoc-104', '2005', c, l);
const REF_CURVED = R('4.3', 'cubiertas curvas');
const REF_CURVED_UNB = R('6.2', 'no balanceadas sobre cubiertas curvas');
const REF_MULTI = R('6.3', 'plegado múltiple, diente de sierra y bóvedas');
const REF_DOME = R('6.4', 'cúpulas');

export type ShapedKind = 'curved' | 'multiple' | 'dome';
type P = { x: number; y: number; z?: number };

export interface ShapedSnowInputs {
  kind: ShapedKind;
  pf: number;
  ce: number;
  ct: number;
  slippery: boolean;
  gamma: number;
  /** For a curved roof and several ridges: the horizontal axis the roof slopes along. */
  axis: 'x' | 'y';
  /** A curved roof abutting the ground or another roof at its eaves (§6.2, cases 2 and 3). */
  abutting?: boolean;
}

export interface ShapedSnow {
  /** Balanced snow at a plan point, kN/m² of horizontal projection. */
  balanced: (pt: P) => number;
  unbalanced: Array<{ dir: string; at: (pt: P) => number }>;
  derivation: EngineMessage[];
  refs: ClauseRef[];
}

const deg = (r: number) => (r * 180) / Math.PI;

/** Positions and their highest z, sorted, merged within 5 cm. */
function profileOf(points: Array<{ s: number; z: number }>): Array<{ s: number; z: number }> {
  const out: Array<{ s: number; z: number }> = [];
  for (const p of [...points].sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && p.s - last.s <= 0.05) last.z = Math.max(last.z, p.z);
    else out.push({ ...p });
  }
  return out;
}

/** The profile's slope at s, degrees, from the points around it. */
function slopeAt(prof: Array<{ s: number; z: number }>, s: number): number {
  if (prof.length < 2) return 0;
  let k = prof.findIndex((p) => p.s >= s);
  if (k <= 0) k = 1;
  if (k === -1 || k >= prof.length) k = prof.length - 1;
  const a = prof[k - 1]!, b = prof[k]!;
  return deg(Math.atan2(Math.abs(b.z - a.z), Math.max(b.s - a.s, 1e-9)));
}

const lerp = (x: number, x0: number, v0: number, x1: number, v1: number) =>
  (x1 - x0 <= 1e-9 ? v1 : v0 + ((v1 - v0) * Math.min(Math.max(x - x0, 0), x1 - x0)) / (x1 - x0));

/**
 * Figura 3 on one side of a curved section, `side` its points by horizontal distance from the crown
 * (crown first). Returns the leeward load by distance, or why there is none.
 */
function curvedSide(side: Array<{ s: number; z: number }>, i: ShapedSnowInputs):
  { at: (x: number) => number; info: Record<string, string | number> } | { none: string } {
  if (side.length < 2) return { none: 'flat' };
  const crown = side[0]!;
  const eave = side[side.length - 1]!;
  const slope = (x: number) => slopeAt(side, x);
  // Each segment's slope at its middle; the point a slope is reached, between two middles.
  const mids = side.slice(1).map((p, k) => ({ x: (p.s + side[k]!.s) / 2, t: deg(Math.atan2(Math.abs(p.z - side[k]!.z), Math.max(p.s - side[k]!.s, 1e-9))) }));
  const cross = (target: number): number | null => {
    const k = mids.findIndex((m) => m.t >= target);
    if (k < 0) return null;
    if (k === 0) return crown.s;
    const a = mids[k - 1]!, b = mids[k]!;
    return a.x + ((b.x - a.x) * (target - a.t)) / Math.max(b.t - a.t, 1e-9);
  };
  const thetaE = slope(eave.s - 1e-6);
  const x70 = thetaE > 70 ? cross(70) : null;
  const end = x70 ?? eave.s;
  const zEnd = x70 !== null ? side.reduce((z, p) => (p.s <= x70 ? p.z : z), crown.z) : eave.z;
  const line = deg(Math.atan2(crown.z - zEnd, Math.max(end - crown.s, 1e-9)));
  if (line < 10 || line > 60) return { none: line < 10 ? 'shallow' : 'steep' };
  const cs = (t: number) => slopeFactor(t, i.ct, i.slippery);
  const top = 0.5 * i.pf;
  if (thetaE < 30) {
    const pe = (2 * i.pf * cs(thetaE)) / i.ce;
    return { at: (x) => lerp(x, crown.s, top, eave.s, pe), info: { case: 1, eave: round(thetaE, 1), line: round(line, 1) } };
  }
  const x30 = cross(30) ?? eave.s;
  const p30 = (2 * i.pf * cs(30)) / i.ce;
  if (i.abutting) {
    return { at: (x) => (x <= x30 ? lerp(x, crown.s, top, x30, p30) : p30), info: { case: thetaE <= 70 ? 2 : 3, eave: round(thetaE, 1), line: round(line, 1), abutting: 1 } };
  }
  if (thetaE <= 70) {
    const pe = (2 * i.pf * cs(thetaE)) / i.ce;
    return { at: (x) => (x <= x30 ? lerp(x, crown.s, top, x30, p30) : lerp(x, x30, p30, eave.s, pe)), info: { case: 2, eave: round(thetaE, 1), line: round(line, 1) } };
  }
  return {
    at: (x) => (x <= x30 ? lerp(x, crown.s, top, x30, p30) : x >= end ? 0 : lerp(x, x30, p30, end, 0)),
    info: { case: 3, eave: round(thetaE, 1), line: round(line, 1) },
  };
}

export function shapedSnow(nodes: P[], i: ShapedSnowInputs): ShapedSnow | null {
  if (nodes.length < 3) return null;
  const derivation: EngineMessage[] = [];
  const refs: ClauseRef[] = [];
  const cs = (t: number) => (t >= 70 ? 0 : slopeFactor(t, i.ct, i.slippery));
  const Z = (n: P) => n.z ?? 0;

  if (i.kind === 'dome') {
    const zTop = Math.max(...nodes.map(Z));
    const top = nodes.filter((n) => Z(n) >= zTop - 0.05);
    const cx = top.reduce((s, n) => s + n.x, 0) / top.length, cy = top.reduce((s, n) => s + n.y, 0) / top.length;
    const r = (pt: P) => Math.hypot(pt.x - cx, pt.y - cy);
    const prof = profileOf(nodes.map((n) => ({ s: r(n), z: Z(n) })));
    const side = curvedSide(prof, i);
    refs.push(REF_CURVED, REF_DOME);
    derivation.push(msg('snow.derivation.dome', { r: round(prof[prof.length - 1]!.s, 2), unbalanced: 'none' in side ? msg(`snow.curved.${side.none}`) : tpCase(side.info) }));
    const unbalanced: ShapedSnow['unbalanced'] = [];
    if (!('none' in side)) {
      for (const [dir, ux, uy] of [['+X', 1, 0], ['−X', -1, 0], ['+Y', 0, 1], ['−Y', 0, -1]] as const) {
        unbalanced.push({
          dir,
          at: (pt) => {
            const d = r(pt);
            if (d < 1e-6) return side.at(0);
            // The angle between the point's bearing and downwind.
            const cos = ((pt.x - cx) * ux + (pt.y - cy) * uy) / d;
            const a = deg(Math.acos(Math.max(-1, Math.min(1, cos))));
            const f = a <= 45 ? 1 : a >= 67.5 ? 0 : (67.5 - a) / 22.5;
            return f * side.at(d);
          },
        });
      }
    }
    return { balanced: (pt) => cs(slopeAt(prof, r(pt))) * i.pf, unbalanced, derivation, refs };
  }

  const c = (pt: P) => (i.axis === 'x' ? pt.x : pt.y);
  const prof = profileOf(nodes.map((n) => ({ s: c(n), z: Z(n) })));
  if (prof.length < 3) return null;

  if (i.kind === 'curved') {
    const crownK = prof.reduce((k, p, j) => (p.z > prof[k]!.z ? j : k), 0);
    const crown = prof[crownK]!;
    const sides = [
      prof.slice(crownK).map((p) => ({ s: p.s - crown.s, z: p.z })),
      prof.slice(0, crownK + 1).reverse().map((p) => ({ s: crown.s - p.s, z: p.z })),
    ];
    const [plus, minus] = sides.map((sd) => curvedSide(sd, i));
    refs.push(REF_CURVED);
    derivation.push(msg('snow.derivation.curved', {
      plus: 'none' in plus! ? msg(`snow.curved.${plus.none}`) : tpCase(plus!.info), minus: 'none' in minus! ? msg(`snow.curved.${minus.none}`) : tpCase(minus!.info),
    }));
    const unbalanced: ShapedSnow['unbalanced'] = [];
    // Wind toward +axis leaves its snow on the side beyond the crown.
    for (const [dir, sd, sign] of [[`+${i.axis.toUpperCase()}`, plus!, 1], [`−${i.axis.toUpperCase()}`, minus!, -1]] as const) {
      if ('none' in sd) continue;
      if (!refs.includes(REF_CURVED_UNB)) refs.push(REF_CURVED_UNB);
      unbalanced.push({ dir, at: (pt) => { const x = (c(pt) - crown.s) * sign; return x >= -1e-6 ? sd.at(Math.max(x, 0)) : 0; } });
    }
    return { balanced: (pt) => cs(slopeAt(prof, c(pt))) * i.pf, unbalanced, derivation, refs };
  }

  // Several ridges (§6.3): ridges and valleys of the profile.
  const ext: Array<{ s: number; z: number; kind: 'ridge' | 'valley' }> = [];
  for (let k = 0; k < prof.length; k++) {
    const p = prof[k]!, a = prof[k - 1], b = prof[k + 1];
    const up = (q?: { z: number }) => !q || q.z < p.z - 1e-3, down = (q?: { z: number }) => !q || q.z > p.z + 1e-3;
    if (up(a) && up(b) && (a || b)) ext.push({ ...p, kind: 'ridge' });
    else if (a && b && down(a) && down(b)) ext.push({ ...p, kind: 'valley' });
  }
  const maxSlope = Math.max(...prof.slice(1).map((p, k) => deg(Math.atan2(Math.abs(p.z - prof[k]!.z), Math.max(p.s - prof[k]!.s, 1e-9)))));
  refs.push(REF_MULTI);
  const ridges = ext.filter((e) => e.kind === 'ridge'), valleys = ext.filter((e) => e.kind === 'valley');
  derivation.push(msg('snow.derivation.multiple', { ridges: ridges.length, valleys: valleys.length, slope: round(maxSlope, 1), pf: round(i.pf, 3) }));
  const unbalanced: ShapedSnow['unbalanced'] = [];
  if (maxSlope > 1.8 && valleys.length > 0) {
    const top = 0.5 * i.pf;
    const pv = new Map(valleys.map((v) => {
      const near = ridges.filter((r0) => Math.abs(r0.s - v.s) > 0).sort((a, b) => Math.abs(a.s - v.s) - Math.abs(b.s - v.s)).slice(0, 2);
      const zr = Math.min(...near.map((r0) => r0.z));
      return [v.s, Math.min((2 * i.pf) / i.ce, top + i.gamma * Math.max(zr - v.z, 0))];
    }));
    const at = (pt: P) => {
      const s = c(pt);
      const left = [...ext].reverse().find((e) => e.s <= s + 1e-6), right = ext.find((e) => e.s >= s - 1e-6);
      const val = (e?: typeof ext[number]) => (!e ? top : e.kind === 'ridge' ? top : pv.get(e.s)!);
      if (!left || !right) return top;
      return lerp(s, left.s, val(left), right.s, val(right));
    };
    unbalanced.push({ dir: '', at });
    derivation.push(msg('snow.derivation.multipleUnbalanced', { valley: round(Math.max(...pv.values()), 3) }));
  }
  return { balanced: () => i.pf, unbalanced, derivation, refs };
}

function tpCase(info: Record<string, string | number>): EngineMessage {
  return msg(info.abutting ? 'snow.curved.caseAbutting' : 'snow.curved.case', info);
}
