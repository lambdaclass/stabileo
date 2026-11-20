import { faceLayout, groupsArea } from '../bars';
import { SECTION_NAMES, type BeamContext, type BeamDemand, type FlexureCheck, type SectionName } from '../beam-row';
import type { BarGroup, BeamAdopted, Signed } from '../types';
import { rhoMinBeam, type Ts500Mat } from './basis';
import { balancedArea, designFlexure, limitStrain, stripAtAxial, stripCapacity, type FlexureDesign, type Strip } from './section';

export type BeamGeom = { b: number; h: number; flange?: { bf: number; hf: number } };

export function beamStrip(g: BeamGeom, c: BeamContext, tension: BarGroup[], compression: BarGroup[], sd: number, sagging: boolean): { strip: Strip; d: number; dPrime: number; as: number; asComp: number } {
  const t = faceLayout(tension, g.b, c.cover, sd), k = faceLayout(compression, g.b, c.cover, sd);
  const as = groupsArea(tension), asComp = groupsArea(compression);
  const d = g.h - t.centroidFromFace;
  return {
    strip: { b: g.b, h: g.h, ...(sagging && g.flange ? { flange: g.flange } : {}), layers: [{ depth: d, area: as * 1e-4 }, { depth: k.centroidFromFace, area: asComp * 1e-4 }] },
    d, dPrime: k.centroidFromFace, as, asComp,
  };
}

export const mrOf = (g: BeamGeom, c: BeamContext, t: Ts500Mat, tension: BarGroup[], compression: BarGroup[], sd: number, sagging: boolean, n = 0): number =>
  stripCapacity(beamStrip(g, c, tension, compression, sd, sagging).strip, t, n);

export const barsAt = (a: BeamAdopted, s: SectionName) => a.at?.[s] ?? { top: a.top, bottom: a.bottom };

export const sectionOf = (d: BeamDemand, s: SectionName) => (s === 'start' ? d.start : s === 'span' ? d.span : d.end);

export interface Ts500Flexure extends FlexureCheck { rho: number; rhoNet: number; rhoLimit: number; asb: number }

export function flexChecks(c: BeamContext, t: Ts500Mat, d: BeamDemand, a: BeamAdopted): Ts500Flexure[] {
  const sd = a.stirrups.dia;
  const items: Array<{ section: SectionName; sign: 'pos' | 'neg'; mu: number; nc: number }> = [];
  for (const s of SECTION_NAMES) {
    const e = sectionOf(d, s);
    items.push({ section: s, sign: 'pos', mu: e.pos.value, nc: e.nPos }, { section: s, sign: 'neg', mu: e.neg.value, nc: e.nNeg });
  }
  if (d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6) items.push({ section: 'span', sign: 'neg', mu: d.negAny.value, nc: d.nNegAny });
  return items.map((i) => {
    const g = barsAt(a, i.section);
    const sag = i.sign === 'pos';
    const bs = sag ? beamStrip(d, c, g.bottom, g.top, sd, true) : beamStrip(d, c, g.top, g.bottom, sd, false);
    const st = stripAtAxial(bs.strip, t, i.nc);
    const phiMn = Math.max(0, st?.m ?? 0);
    const asb = balancedArea({ ...bs.strip, layers: [] }, t, bs.d) * 1e4;
    const bd = d.b * bs.d * 1e4;
    const rho = bs.as / bd, rhoNet = (bs.as - bs.asComp) / bd, rhoLimit = 0.85 * asb / bd;
    const loaded = i.mu > 1e-6;
    const ductile = !loaded || (rhoNet <= rhoLimit + 1e-9 && rho <= 0.02 + 1e-9);
    return {
      ...i, phiMn, epsT: st?.epsT ?? 0, epsTMin: limitStrain({ ...bs.strip, layers: [] }, t, bs.d), d: bs.d, ductile,
      ok: !loaded || (phiMn >= i.mu - 1e-6 && ductile), rho, rhoNet, rhoLimit, asb,
    };
  });
}

export interface SectionNeed { s: SectionName; sign: 'pos' | 'neg'; env: Signed; n: number; r: FlexureDesign & { asMin: number; asReq: number; d: number } }

export function flexureNeeds(c: BeamContext, t: Ts500Mat, d: BeamDemand): { pos: SectionNeed[]; neg: SectionNeed[] } {
  const d0 = d.h - c.cover - c.stirrupDia / 1000 - 0.008;
  const need = (s: SectionName, sign: 'pos' | 'neg', env: Signed, n: number): SectionNeed => {
    const geom = { b: d.b, h: d.h, ...(sign === 'pos' && d.flange ? { flange: d.flange } : {}) };
    const r = designFlexure(geom, t, env.value, n, d0, d.h - d0);
    const asMin = rhoMinBeam(t) * d.b * d0 * 1e4;
    return { s, sign, env, n, r: { ...r, asMin, asReq: Math.max(r.as, asMin), d: d0 } };
  };
  const pos = SECTION_NAMES.map((s) => need(s, 'pos', sectionOf(d, s).pos, sectionOf(d, s).nPos));
  const neg = SECTION_NAMES.map((s) => need(s, 'neg', sectionOf(d, s).neg, sectionOf(d, s).nNeg));
  if (d.negAny.value > Math.max(...neg.map((x) => x.env.value)) + 1e-6) neg.push(need('span', 'neg', d.negAny, d.nNegAny));
  return { pos, neg };
}
