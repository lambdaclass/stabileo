import { faceLayout } from '../bars';
import { beamLine as layoutLine, type CutoffInput, type LineAdopted, type LineCode, type LineLayout } from '../beam-line';
import type { BeamContext, BeamRow } from '../beam-row';
import type { Fmt } from '../format';
import type { CutoffLegality } from '../../engine/detailing/generate-beam';
import { isTopBar, lapOf, lbOf, rhoMinBeam, ts500Mat } from './basis';
import { beamStrip } from './beam-flexure';
import { shearState, vrOf } from './beam-shear';
import { stripCapacity } from './section';

function shearAt(stations: CutoffInput['stations'], x: number): number {
  if (!stations.length) return 0;
  const s = [...stations].sort((p, q) => p.x - q.x);
  if (x <= s[0]!.x) return Math.abs(s[0]!.v);
  for (let i = 0; i + 1 < s.length; i++) {
    const p = s[i]!, q = s[i + 1]!;
    if (x <= q.x) { const u = q.x > p.x ? (x - p.x) / (q.x - p.x) : 0; return Math.abs(p.v + u * (q.v - p.v)); }
  }
  return Math.abs(s[s.length - 1]!.v);
}

/** A bar stopped in a tension zone: allowed where Vd ≤ ⅔·Vr, or where the continuing bars give twice the area needed and Vd ≤ ¾·Vr; the extra-stirrup alternative is not taken, so the bar runs on. */
function cutoff(input: CutoffInput): { legality: CutoffLegality; extraStirrups: null } {
  if (!input.inTensionZone) return { legality: 'notInTension', extraStirrups: null };
  const ext = Math.max(input.d, 12 * input.diameterMm / 1000);
  const vd = shearAt(input.stations, input.towardEnd ? input.theoretical + ext : input.theoretical - ext);
  if (vd <= (2 / 3) * input.vn + 1e-9) return { legality: 'lowShear', extraStirrups: null };
  if (input.continuingDoubleArea && vd <= 0.75 * input.vn + 1e-9) return { legality: 'doubleArea', extraStirrups: null };
  return { legality: 'illegal', extraStirrups: null };
}

const topOf = (c: BeamContext, dia: number, top: boolean, h: number) => top && isTopBar(h, c.cover, c.stirrupDia, dia);

export const TS500_LINE: LineCode = {
  development: (c, dia, top, h) => lbOf(ts500Mat(c.mat), dia, topOf(c, dia, top, h)),
  hooked: (c, dia) => lbOf(ts500Mat(c.mat), dia, false),
  lap: (c, dia, top, h) => lapOf(ts500Mat(c.mat), dia, topOf(c, dia, top, h), 1),
  minBottom: (c, b, d) => rhoMinBeam(ts500Mat(c.mat)) * b * d * 1e4,
  moments: (c, qs) => { const t = ts500Mat(c.mat); return qs.map((q) => stripCapacity(beamStrip(q.demand, c, q.tension, q.compression, q.sd, q.sagging).strip, t, 0)); },
  shear: (c, q, st) => {
    const t = ts500Mat(c.mat);
    const d = q.demand.h - faceLayout(q.tension, q.demand.b, c.cover, q.sd).centroidFromFace;
    const vr = vrOf(t, shearState(t, q.demand.b, q.demand.h, d, 0, 0), st);
    return { design: vr, nominal: vr };
  },
  cutoff,
  stirrupMax: (_c, _b, d) => Math.min(d / 2, 0.6),
  text: {
    cutoff: {
      notInTension: 'TS 500: M = 0',
      lowShear: 'TS 500: Vd ≤ ⅔·Vr',
      doubleArea: 'TS 500: As,cont ≥ 2·As,req; Vd ≤ ¾·Vr',
      extraStirrups: '—',
      illegal: '—',
    },
    clause: { envelope: '7.1, 7.3', bottomRun: 'TS 500', fit: 'TS 500', hooks: 'TS 500', splices: '9.3' },
    formula: {
      capacity: 'Mr(x) ≥ Md(x) ∀x',
      cut: 'x(Mr,cont = Md) + max(d; 12·Ø) ≥ c + lb; lb = max(0.12·(fyd/fctd)·Ø; 20·Ø)',
      third: 'As⁻/3 → x(M = 0) + max(d; 12·Ø; ln/16)',
    },
  },
};

export const beamLine = (rows: BeamRow[], c: BeamContext, a: LineAdopted | undefined, fmt: Fmt): LineLayout => layoutLine(rows, c, a, fmt, TS500_LINE);
