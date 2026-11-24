import { barArea, faceLayout } from '../bars';
import type { SectionName } from '../beam-row';
import type { BarGroup, BeamAdopted } from '../types';
import { momentCapacity, xuLimit, type Layer, type Mat, type Shape } from './basis';
import type { Ec2Params } from '../../engine/design/eurocode/ec2-params';

export function faceLayers(groups: readonly BarGroup[], cover: number, sd: number): Array<{ depth: number; area: number }> {
  const used = groups.filter((g) => g.count > 0);
  let y = cover + sd / 1000;
  return used.map((g, i) => {
    if (i > 0) y += used[i - 1]!.dia / 1000 + Math.max(0.025, used[i - 1]!.dia / 1000, g.dia / 1000);
    return { depth: y + g.dia / 2000, area: g.count * barArea(g.dia) * 1e-4 };
  });
}

export interface BeamGeom { b: number; h: number; flange?: { bf: number; hf: number } }

export interface SectionRead { mrd: number; x: number; d: number; xd: number; epsS: number; epsMin: number; ductile: boolean }

export function beamCapacity(g: BeamGeom, cover: number, sd: number, tension: readonly BarGroup[], compression: readonly BarGroup[], sagging: boolean, N: number, m: Mat, p: Ec2Params): SectionRead {
  const t = faceLayers(tension, cover, sd), k = faceLayers(compression, cover, sd);
  const layers: Layer[] = [...t.map((l) => ({ y: g.h - l.depth, area: l.area })), ...k.map((l) => ({ y: l.depth, area: l.area }))];
  const shape: Shape = { b: g.b, h: g.h, ...(sagging && g.flange ? { bf: g.flange.bf, hf: g.flange.hf } : {}) };
  const at = t.reduce((s, l) => s + l.area, 0);
  const d = g.h - (at > 0 ? t.reduce((s, l) => s + l.area * l.depth, 0) / at : faceLayout([...tension], g.b, cover, sd).centroidFromFace);
  const xl = xuLimit(m.fck, p);
  const epsMin = (m.ecu3 * (1 - xl)) / xl;
  const r = at > 0 ? momentCapacity(N, shape, layers, m) : null;
  if (!r) return { mrd: 0, x: 0, d, xd: 0, epsS: 0, epsMin, ductile: true };
  const epsS = (m.ecu3 * (d - r.x)) / r.x;
  return { mrd: Math.max(0, r.mrd), x: r.x, d, xd: r.x / d, epsS, epsMin, ductile: r.x / d <= xl + 1e-9 };
}

export function tensionWidth(g: BeamGeom, flangeInTension: boolean): number {
  if (!flangeInTension || !g.flange || g.flange.bf <= g.b) return g.b;
  const { bf, hf } = g.flange;
  const area = bf * hf + g.b * (g.h - hf);
  const ybar = (bf * hf * hf / 2 + g.b * (g.h - hf) * (hf + (g.h - hf) / 2)) / area;
  return (bf * Math.min(hf, ybar) + g.b * Math.max(0, ybar - hf)) / ybar;
}

export const barsAt = (a: BeamAdopted, s: SectionName) => a.at?.[s] ?? { top: a.top, bottom: a.bottom };
export const hoopPerimeter = (d: { b: number; h: number }, c: { cover: number }, sd: number) => 2 * ((d.b - 2 * c.cover - sd / 1000) + (d.h - 2 * c.cover - sd / 1000));
export const geomOf = (d: BeamGeom): BeamGeom => ({ b: d.b, h: d.h, ...(d.flange ? { flange: d.flange } : {}) });
