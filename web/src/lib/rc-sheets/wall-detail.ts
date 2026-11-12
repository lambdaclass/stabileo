/**
 * A wall's bars laid out for its drawings, as its code details them: the vertical bars of each
 * curtain and the boundary bars at the ends, the horizontal bars along it, how the horizontals end
 * at the edges, ties around boundary zones dense enough to need them, and cross ties between the
 * curtains where the code asks for them.
 *
 * ACI 318-19 and CIRSOC 201-2025: two curtains close each edge with U-bars of the horizontals'
 * size and spacing lapped over them (§25.5.2; §18.10.6.5(b) under chapter 18), one curtain hooks
 * its horizontals round the end bar (§25.3); bars of a zone with ρ > 1 % are tied (§11.7.4.1,
 * spacing §25.7.2.1). EN 1992-1-1: the same edge U-bars lapped as 8.7.3 asks, links round a zone
 * with As > 0.02·Ac (9.6.4(1), spacing 9.5.3(3)) and at least four links per m² between the two
 * curtains (9.6.4(2)). TS 500: the edge U-bars lapped as 9.3 asks.
 */
import { wallVerticalBars } from '../engine/detailing/wall-member';
import { barArea } from './bars';
import { tieDiaFor, tieSpacingLimit } from './column-row';
import type { WallRow } from './wall-row';
import type { SheetCode } from './types';

export interface WallDetailNote { key: string; clause: string; params?: Record<string, string | number> }

export interface WallDetail {
  length: number; thickness: number; cover: number;
  /** x from the left end, y across from the first face, m; `boundary` for the extra bars at the ends. */
  verticals: Array<{ x: number; y: number; dia: number; boundary: boolean }>;
  horizontals: { dia: number; spacing: number; y: number[] };
  ends: { kind: 'ubar' | 'hook'; dia: number; spacing: number; lap: number; clause: string };
  /** The zone from each end to past its last boundary bar, its ratio, and its ties when it needs them. */
  boundary: { length: number; rho: number; ties: { dia: number; spacing: number; clause: string; legs?: number } | null; special?: boolean } | null;
  crossTies: { along: number; up: number; dia: number; clause: string } | null;
  notes: WallDetailNote[];
}

const family = (code: SheetCode): 'aci' | 'ec2' | 'ts500' => (code === 'en1992-1-1' || code === 'bs-en1992-1-1' ? 'ec2' : code === 'ts500-2000' ? 'ts500' : 'aci');
const floorTo = (x: number, step: number) => Math.round(Math.max(step, Math.floor(x / step + 1e-9) * step) * 1e6) / 1e6;

export function wallDetail(row: WallRow, code: SheetCode): WallDetail {
  const fam = family(code);
  const a = row.adopted, L = row.length, t = row.thickness, cover = row.cover;
  const hd = a.horizontal.diameter / 1000;
  const bars = wallVerticalBars(L, t, cover, a);
  const curtains = a.curtains === 2 ? 2 : 1;
  const nDistributed = curtains * Math.max(2, Math.floor(L / a.vertical.spacing) + 1);
  const verticals = bars.map((b, i) => ({ x: b.x + L / 2, y: b.y + t / 2, dia: i < nDistributed ? a.vertical.diameter : a.boundary!.diameter, boundary: i >= nDistributed }));
  const hy = curtains === 2 ? [cover + hd / 2, t - cover - hd / 2] : [t / 2];
  const notes: WallDetailNote[] = [];

  const seis = row.seismic;
  const lapClause = fam === 'aci' ? (seis?.anchorEnds ? '§25.5.2, §18.10.6.5(b)' : '§25.5.2') : fam === 'ec2' ? '8.7.3' : '9.3';
  const ends: WallDetail['ends'] = curtains === 2
    ? { kind: 'ubar', dia: a.horizontal.diameter, spacing: a.horizontal.spacing, lap: row.hLap, clause: lapClause }
    : { kind: 'hook', dia: a.horizontal.diameter, spacing: a.horizontal.spacing, lap: 0, clause: fam === 'aci' ? (seis?.anchorEnds ? '§25.3, §18.10.6.5(b)' : '§25.3') : fam === 'ec2' ? '8.5' : '' };
  notes.push(ends.kind === 'ubar'
    ? { key: 'rcSheets.wallFig.n.ubar', clause: ends.clause, params: { dia: ends.dia, s: Math.round(ends.spacing * 1000) / 10, lap: Math.round(ends.lap * 100) } }
    : { key: 'rcSheets.wallFig.n.hook', clause: ends.clause });

  let boundary: WallDetail['boundary'] = null;
  const ext = verticals.filter((v) => v.boundary && v.x < L / 2);
  if (seis?.hoops && seis.boundaryLength > 0) {
    const zone = seis.boundaryLength;
    const inZone = verticals.filter((v) => v.x <= zone + 1e-9);
    const rho = inZone.reduce((s, v) => s + barArea(v.dia), 0) * 1e-4 / (zone * t);
    const h = seis.hoops;
    boundary = { length: zone, rho, special: seis.special, ties: { dia: h.dia, spacing: h.spacing, clause: h.clause, legs: h.legsAcross } };
    notes.push(seis.special
      ? { key: 'rcSheets.wallFig.n.special', clause: '§18.10.6.3, §18.10.6.4', params: { l: Math.round(zone * 100), sigma: seis.sigma.toFixed(1), tdia: h.dia, ts: Math.round(h.spacing * 1000) / 10, legs: h.legsAcross } }
      : { key: 'rcSheets.wallFig.n.edgeTies', clause: '§18.10.6.5(a)', params: { l: Math.round(zone * 100), tdia: h.dia, ts: Math.round(h.spacing * 1000) / 10 } });
  } else if (ext.length) {
    const pitch = Math.max(0.05, 2 * a.boundary!.diameter / 1000);
    const zone = Math.min(L / 2, Math.max(...ext.map((v) => v.x)) + pitch / 2);
    const inZone = verticals.filter((v) => v.x <= zone + 1e-9);
    const rho = inZone.reduce((s, v) => s + barArea(v.dia), 0) * 1e-4 / (zone * t);
    const big = Math.max(...inZone.map((v) => v.dia)), small = Math.min(...inZone.map((v) => v.dia));
    let ties: NonNullable<WallDetail['boundary']>['ties'] = null;
    if (fam === 'aci' && rho > 0.01) {
      const dia = tieDiaFor(big);
      ties = { dia, spacing: floorTo(tieSpacingLimit(small, dia, t), 0.025), clause: '§11.7.4.1, §25.7.2.1' };
    } else if (fam === 'ec2' && rho > 0.02) {
      ties = { dia: Math.max(6, Math.ceil(big / 4)), spacing: floorTo(Math.min(20 * small / 1000, t, 0.4), 0.025), clause: '9.6.4(1), 9.5.3(3)' };
    }
    boundary = { length: zone, rho, ties };
    notes.push(ties
      ? { key: 'rcSheets.wallFig.n.boundaryTied', clause: ties.clause, params: { n: ext.length, dia: a.boundary!.diameter, rho: (rho * 100).toFixed(2), tdia: ties.dia, ts: Math.round(ties.spacing * 1000) / 10 } }
      : { key: 'rcSheets.wallFig.n.boundary', clause: fam === 'aci' ? '§11.7.4.1' : fam === 'ec2' ? '9.6.4(1)' : '', params: { n: ext.length, dia: a.boundary!.diameter, rho: (rho * 100).toFixed(2) } });
  }

  if (fam === 'aci' && !seis) notes.push({ key: 'rcSheets.wallFig.n.ordinary', clause: '§11.7, §18.10' });
  else if (seis && !seis.hoops) notes.push({ key: 'rcSheets.wallFig.n.noBoundary', clause: '§18.10.6.3', params: { sigma: seis.sigma.toFixed(1) } });

  let crossTies: WallDetail['crossTies'] = null;
  const rhoV = curtains * barArea(a.vertical.diameter) * 1e-4 / (a.vertical.spacing * t);
  if (fam === 'ec2' && curtains === 2) {
    const along = floorTo(0.5, a.vertical.spacing);
    crossTies = { along, up: floorTo(0.25 / along, a.horizontal.spacing), dia: 6, clause: '9.6.4(2)' };
    notes.push({ key: 'rcSheets.wallFig.n.links', clause: '9.6.4(2)', params: { a: Math.round(crossTies.along * 100), u: Math.round(crossTies.up * 100) } });
  } else if (fam === 'aci' && curtains === 2 && rhoV > 0.01) {
    const dia = tieDiaFor(a.vertical.diameter);
    crossTies = { along: 2 * a.vertical.spacing, up: floorTo(tieSpacingLimit(a.vertical.diameter, dia, t), a.horizontal.spacing), dia, clause: '§11.7.4.1' };
    notes.push({ key: 'rcSheets.wallFig.n.ties', clause: '§11.7.4.1', params: { a: Math.round(crossTies.along * 100), u: Math.round(crossTies.up * 100) } });
  } else if (fam === 'aci' && curtains === 2) {
    notes.push({ key: 'rcSheets.wallFig.n.noTies', clause: '§11.7.4.1', params: { rho: (rhoV * 100).toFixed(2) } });
  }
  return { length: L, thickness: t, cover, verticals, horizontals: { dia: a.horizontal.diameter, spacing: a.horizontal.spacing, y: hy }, ends, boundary, crossTies, notes };
}
