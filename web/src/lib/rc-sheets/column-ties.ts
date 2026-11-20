/**
 * Where a column's ties go along its storey, as its code places them: zones of one spacing each
 * (the ends, a lap, the middle, the joint above) and the ties themselves, for the elevation.
 *
 * ACI 318-19 and CIRSOC 201-2025 space ties evenly (§25.7.2.1) with the first and the last at
 * half a spacing from the slab and from the beams above (§10.7.6.2); with chapter 18 the hoops are
 * at so over lo from each joint face (§18.7.5.1, §18.7.5.3), at min(6·db; 150 mm) between
 * (§18.7.5.5), at so over a lap kept to the middle half (§18.7.4.3) and through the joint
 * (§18.8.3.1). EN 1992-1-1 takes 0.6·scl,max within max(b; h) of a beam or slab and over a lap of
 * bars larger than 14 mm, with three ties at least in the lap (9.5.3(4)), and scl,max between
 * (9.5.3(3)). TS 500 spaces them evenly (7.4.1); its confinement zones are TBDY 2018's. Where
 * the project asks for denser ends (`columnEndZones`, the design's own rule) and the code asks
 * for none, they are drawn as the design places them. Between the ends a spacing never opens
 * beyond what the row's shear check leaves room for.
 */
import { roundDown } from './bars';
import { columnEndZone } from '../engine/design/candidate-enumerate-column';
import type { ColumnRow } from './column-row';
import type { SheetCode } from './types';

export type TieZoneKind = 'end' | 'middle' | 'lap' | 'joint';
export interface TieZone { kind: TieZoneKind; from: number; to: number; spacing: number; clause: string }

/** Why the storey looks as it does, as i18n keys: one spacing by the code, ends asked by the project, the shear holding the middle. */
export type TieNote = 'rcSheets.elev.n.oneSpacingAci' | 'rcSheets.elev.n.oneSpacingTs500' | 'rcSheets.elev.n.projectEnds' | 'rcSheets.elev.n.shearHolds' | 'rcSheets.elev.n.ruleHolds';

export interface ColumnTieLayout {
  /** Clear height between the beam or slab below and the deepest beam above, m. */
  clear: number;
  /** Depth of the joints below and above, m. */
  jointBottom: number; jointTop: number;
  lap: { from: number; to: number } | null;
  /** Measured up from the face of the joint below; the joint above runs from `clear` to `clear + jointTop`. */
  zones: TieZone[];
  ties: number[];
  dia: number;
  notes: TieNote[];
}

const family = (code: SheetCode): 'aci' | 'ec2' | 'ts500' => (code === 'en1992-1-1' || code === 'bs-en1992-1-1' ? 'ec2' : code === 'ts500-2000' ? 'ts500' : 'aci');

/** The widest spacing between the ends the shear check allows, given its use at the zone spacing. */
const shearRoom = (row: ColumnRow, s: number) => s / Math.max(row.checks.shearX, row.checks.shearY, 1e-6);

export function columnTieLayout(row: ColumnRow, code: SheetCode, opts: { endZones?: boolean } = {}): ColumnTieLayout {
  const a = row.adopted;
  const clear = Math.max(0.1, row.demand.lu);
  const jointBottom = row.demand.joints?.bottom ?? 0, jointTop = row.demand.joints?.top ?? 0;
  const s = Math.max(0.025, a.tieSpacing);
  const thinnest = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
  const longest = Math.max(a.corner, a.nx > 0 ? a.dx : 0, a.ny > 0 ? a.dy : 0);
  const fam = family(code);
  const zones: TieZone[] = [];
  const notes: TieNote[] = [];
  let lap: ColumnTieLayout['lap'] = null;
  // The shear check can hold the middle closer than its rule; the clause then names both.
  const middle = (rule: number, clause: string, shearClause?: string) => {
    const room = shearClause ? shearRoom(row, s) : Infinity;
    const spacing = Math.round(Math.max(s, roundDown(Math.min(rule, room) + 1e-6)) * 1e6) / 1e6;
    zones.push({ kind: 'middle', from: 0, to: clear, spacing, clause: room < rule - 1e-9 ? `${clause}, ${shearClause}` : clause });
    if (rule > s + 1e-9 && spacing <= s + 1e-9) {
      if (roundDown(rule + 1e-6) <= s + 1e-9) notes.push('rcSheets.elev.n.ruleHolds');
      else if (room < rule) notes.push('rcSheets.elev.n.shearHolds');
    }
  };
  /** The project's denser ends over a code that asks for one spacing. */
  const projectEnds = (clause: string) => {
    const z = columnEndZone(row.b, row.h, clear, s);
    const lo = Math.min(z.endLength, clear / 2);
    zones.push({ kind: 'end', from: 0, to: lo, spacing: z.endSpacing, clause }, { kind: 'end', from: clear - lo, to: clear, spacing: z.endSpacing, clause });
    notes.push('rcSheets.elev.n.projectEnds');
  };

  if (fam === 'aci' && row.confinement) {
    const lo = Math.min(row.confinement.lo, clear / 2);
    middle(Math.min(0.006 * thinnest, 0.15, row.checks.tieMax), '§18.7.5.5', '§22.5');
    zones.push({ kind: 'end', from: 0, to: lo, spacing: s, clause: '§18.7.5.1, §18.7.5.3' }, { kind: 'end', from: clear - lo, to: clear, spacing: s, clause: '§18.7.5.1, §18.7.5.3' });
    if (row.lap) {
      const l = Math.min(row.lap.length, clear / 2);
      lap = { from: clear / 2 - l / 2, to: clear / 2 + l / 2 };
      zones.push({ kind: 'lap', ...lap, spacing: s, clause: '§18.7.4.3' });
    }
    if (jointTop > 0) zones.push({ kind: 'joint', from: clear, to: clear + jointTop, spacing: s, clause: '§18.8.3.1' });
  } else if (fam === 'ec2') {
    const scl = row.checks.tieMax / 0.6;
    const near = Math.min(Math.max(row.b, row.h), clear / 2);
    middle(scl, '9.5.3(3)', '6.2');
    zones.push({ kind: 'end', from: 0, to: near, spacing: s, clause: '9.5.3(4)' }, { kind: 'end', from: clear - near, to: clear, spacing: s, clause: '9.5.3(4)' });
    if (row.lap) {
      lap = { from: 0, to: Math.min(row.lap.length, clear) };
      if (longest > 14) zones.push({ kind: 'lap', ...lap, spacing: Math.min(s, roundDown((lap.to - lap.from) / 3, 0.005)), clause: '9.5.3(4)' });
    }
    if (jointTop > 0) zones.push({ kind: 'joint', from: clear, to: clear + jointTop, spacing: s, clause: '9.5.3(4)' });
  } else {
    middle(s, fam === 'aci' ? '§25.7.2.1, §10.7.6.2' : '7.4.1');
    if (opts.endZones) projectEnds(fam === 'aci' ? '§25.7.2.1' : '7.4.1');
    else notes.push(fam === 'aci' ? 'rcSheets.elev.n.oneSpacingAci' : 'rcSheets.elev.n.oneSpacingTs500');
    if (row.lap) {
      lap = { from: 0, to: Math.min(row.lap.length, clear) };
      zones.push({ kind: 'lap', ...lap, spacing: s, clause: fam === 'aci' ? (row.lap.tension ? '§25.5.2' : '§25.5.5.1') : '9.3' });
    }
    if (jointTop > 0) zones.push({ kind: 'joint', from: clear, to: clear + jointTop, spacing: s, clause: fam === 'aci' ? '§15.7.1' : '7.4.1' });
  }
  return { clear, jointBottom, jointTop, lap, zones, ties: placeTies(zones, clear + jointTop), dia: a.tieDia, notes };
}

/** The densest spacing of the zones over [y, y + ahead]. */
function spacingOver(zones: readonly TieZone[], y: number, ahead: number): number {
  let s = Infinity;
  for (const z of zones) if (z.from < y + ahead + 1e-9 && z.to > y - 1e-9) s = Math.min(s, z.spacing);
  return s;
}

/** Ties from half a spacing above the joint below to half a spacing below the top, never farther apart than any zone they cross asks. */
function placeTies(zones: readonly TieZone[], top: number): number[] {
  const out: number[] = [];
  let y = spacingOver(zones, 0, 0) / 2;
  while (y < top - 1e-6 && out.length < 2000) {
    out.push(y);
    let step = spacingOver(zones, y, 0);
    step = Math.min(step, spacingOver(zones, y, step));
    y += step;
  }
  const last = out[out.length - 1];
  const end = top - spacingOver(zones, top, 0) / 2;
  if (last !== undefined && end - last > 1e-6) out.push(end);
  return out;
}

/** How many ties fall in a zone, its ends included. */
export const tiesIn = (layout: ColumnTieLayout, z: TieZone): number => layout.ties.filter((y) => y >= z.from - 1e-6 && y <= z.to + 1e-6).length;

const PRECEDENCE: Record<TieZoneKind, number> = { lap: 3, end: 2, joint: 1, middle: 0 };

/** The storey cut where any zone starts or ends, each piece under the densest zone over it, the same pieces in a row joined: what the elevation dimensions. */
export function tieSegments(layout: ColumnTieLayout): TieZone[] {
  const top = layout.clear + layout.jointTop;
  const cuts = [...new Set([0, top, ...layout.zones.flatMap((z) => [z.from, z.to])].map((x) => Math.round(Math.min(top, Math.max(0, x)) * 1e4) / 1e4))].sort((p, q) => p - q);
  const out: TieZone[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]!, to = cuts[i + 1]!;
    if (to - from < 1e-6) continue;
    const mid = (from + to) / 2;
    const over = layout.zones.filter((z) => z.from <= mid && z.to >= mid);
    if (!over.length) continue;
    const pick = over.reduce((p, q) => (q.spacing < p.spacing - 1e-9 || (Math.abs(q.spacing - p.spacing) < 1e-9 && PRECEDENCE[q.kind] > PRECEDENCE[p.kind]) ? q : p));
    // An end no denser than the middle is middle: dimensioned apart it would read as a densification.
    const middleSpacing = layout.zones.find((z) => z.kind === 'middle')?.spacing;
    const kind = pick.kind === 'end' && middleSpacing !== undefined && Math.abs(pick.spacing - middleSpacing) < 1e-9 ? 'middle' : pick.kind;
    const piece = { ...pick, kind, ...(kind !== pick.kind ? { clause: layout.zones.find((z) => z.kind === 'middle')!.clause } : {}), from, to };
    const prev = out[out.length - 1];
    if (prev && prev.kind === piece.kind && Math.abs(prev.spacing - piece.spacing) < 1e-9 && Math.abs(prev.to - from) < 1e-6) prev.to = to;
    else out.push(piece);
  }
  return out;
}
