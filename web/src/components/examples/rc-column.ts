import { withSection, type Bar, type Materials, type Outline } from '../../lib/engine/codes/argentina/cirsoc201-section';
import { ES_MPA, EPSILON_CU } from '../../lib/engine/codes/argentina/cirsoc201-basis';
import { defineExample, type Readout, type Values, type View } from './define';
import { Sketch, boundsOf } from './draw';

export const TIE_MM = 10;
export const HEIGHT = 3;
const STEELS = [420, 500] as const;
const THETA = Math.PI / 2;

type Model = { b: number; h: number; outline: Outline; bars: Bar[]; mat: Materials; barDia: number; perFace: number; cover: number; pu: number; mu: number };

export function barLayer(v: Values): number {
  return v.h / 2 - v.cover - TIE_MM / 1000 - v.barDia / 2000;
}

export function build(v: Values): Model {
  const area = Math.PI * (v.barDia / 1000) ** 2 / 4;
  const y = barLayer(v);
  const xEdge = v.b / 2 - v.cover - TIE_MM / 1000 - v.barDia / 2000;
  const bars: Bar[] = [];
  for (const side of [1, -1]) for (let k = 0; k < v.perFace; k++) bars.push({ x: -xEdge + 2 * xEdge * k / (v.perFace - 1), y: side * y, area });
  return {
    b: v.b, h: v.h, outline: { kind: 'rect', b: v.b, h: v.h }, bars,
    mat: { fc: v.fc, fy: STEELS[v.steel], edition: '2025' },
    barDia: v.barDia, perFace: v.perFace, cover: v.cover, pu: v.pu, mu: v.mu,
  };
}

export function beta1(fc: number): number {
  return Math.min(0.85, Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7));
}

export function squashLoad(m: Model): number {
  const ast = m.bars.reduce((s, b) => s + b.area, 0);
  return (0.85 * m.mat.fc * (m.b * m.h - ast) + m.mat.fy * ast) * 1000;
}

export function balancedPoint(m: Model): { c: number; pn: number; mn: number } {
  const fc = m.mat.fc, fy = m.mat.fy;
  const d = m.h / 2 + Math.max(...m.bars.map(b => b.y));
  const c = d * EPSILON_CU / (EPSILON_CU + fy / ES_MPA);
  const a = beta1(fc) * c;
  const top = m.h / 2;
  let pn = 0.85 * fc * a * m.b, mn = pn * (top - a / 2);
  for (const bar of m.bars) {
    const depth = top - bar.y;
    const strain = EPSILON_CU * (c - depth) / c;
    let stress = Math.max(-fy, Math.min(fy, ES_MPA * strain));
    if (depth < a) stress -= 0.85 * fc;
    pn += stress * bar.area;
    mn += stress * bar.area * bar.y;
  }
  return { c, pn: pn * 1000, mn: mn * 1000 };
}

export function tieSpacing(m: Model): number {
  return Math.min(12 * m.barDia / 1000, 48 * TIE_MM / 1000, Math.min(m.b, m.h));
}

function circle(s: Sketch, x: number, y: number, r: number) {
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a0 = 2 * Math.PI * k / n, a1 = 2 * Math.PI * (k + 1) / n;
    s.line(x + r * Math.cos(a0), y + r * Math.sin(a0), x + r * Math.cos(a1), y + r * Math.sin(a1));
  }
}

function rect(s: Sketch, x0: number, y0: number, x1: number, y1: number) {
  s.line(x0, y0, x1, y0); s.line(x1, y0, x1, y1); s.line(x1, y1, x0, y1); s.line(x0, y1, x0, y0);
}

function sectionView(m: Model): View {
  const s = new Sketch();
  rect(s, -m.b / 2, -m.h / 2, m.b / 2, m.h / 2);
  const t = m.cover + TIE_MM / 2000;
  s.category = 1;
  rect(s, -m.b / 2 + t, -m.h / 2 + t, m.b / 2 - t, m.h / 2 - t);
  for (const bar of m.bars) circle(s, bar.x, bar.y, m.barDia / 2000);
  return s.view('section', 'm', boundsOf([-m.b / 2, -m.h / 2, m.b / 2, m.h / 2], 0.12));
}

function elevationView(m: Model): View {
  const s = new Sketch();
  rect(s, -m.h / 2, 0, m.h / 2, HEIGHT);
  const y = Math.max(...m.bars.map(b => b.y));
  s.category = 1;
  s.line(-y, 0, -y, HEIGHT); s.line(y, 0, y, HEIGHT);
  const spacing = tieSpacing(m), half = m.h / 2 - m.cover;
  for (let z = spacing / 2; z < HEIGHT; z += spacing) s.line(-half, z, half, z);
  return s.view('elevation', 'm', boundsOf([-m.h / 2, 0, m.h / 2, HEIGHT], 0.08));
}

export const rcColumn = defineExample<Model>({
  id: 'rc-column',
  dimension: '2d',
  params: [
    { key: 'b', value: 0.4, min: 0.2, max: 0.8, step: 0.05, unit: 'm' },
    { key: 'h', value: 0.5, min: 0.2, max: 1, step: 0.05, unit: 'm' },
    { key: 'perFace', value: 3, min: 2, max: 6, step: 1, unit: '' },
    { key: 'barDia', value: 20, min: 12, max: 32, step: 2, unit: 'mm' },
    { key: 'cover', value: 0.04, min: 0.025, max: 0.06, step: 0.005, unit: 'm' },
    { key: 'fc', value: 25, min: 20, max: 50, step: 5, unit: 'MPa' },
    { key: 'steel', value: 0, min: 0, max: 1, step: 1, unit: '', options: ['adn420', 'adn500'] },
    { key: 'pu', value: 1500, min: 0, max: 8000, step: 50, unit: 'kN' },
    { key: 'mu', value: 200, min: 0, max: 1500, step: 10, unit: 'kN·m' },
  ],
  build,
  analyses(m) {
    return withSection(m.outline, m.bars, m.mat, (section) => {
      const info = section.info();
      const curve = section.curve(THETA, 60);
      const nominal = section.point(THETA, balancedPoint(m).c);
      const use = section.ray(m.pu, m.mu);
      const pureBending = section.atAxial(THETA, 0);
      const values = [info.Po, info.phiPnMax, use.ratio, nominal.Pn, nominal.Mnx, ...curve.flatMap(p => [p.phiPn, p.phiMnx])];
      if (!values.every(Number.isFinite)) return { status: 'refused' as const, code: 'nonFinite' as const };
      const exact = balancedPoint(m);
      const readouts: Readout[] = [
        { key: 'utilisation', value: use.ratio, unit: '' },
        { key: 'squashLoad', value: info.Po, unit: 'kN', reference: { value: squashLoad(m), source: '0.85f′c(Ag−Ast)+fyAst' } },
        { key: 'axialCap', value: info.phiPnMax, unit: 'kN' },
        { key: 'balancedP', value: nominal.Pn, unit: 'kN', reference: { value: exact.pn, source: 'c_b = d·εcu/(εcu+εy)' } },
        { key: 'balancedM', value: Math.abs(nominal.Mnx), unit: 'kN·m', reference: { value: Math.abs(exact.mn), source: 'c_b = d·εcu/(εcu+εy)' } },
        { key: 'pureBending', value: pureBending ? Math.abs(pureBending.phiMnx) : 0, unit: 'kN·m' },
        { key: 'steelRatio', value: m.bars.reduce((s, b) => s + b.area, 0) / (m.b * m.h) * 100, unit: '%' },
        { key: 'tieSpacing', value: tieSpacing(m) * 100, unit: 'cm' },
      ];
      return {
        status: 'ok' as const, readouts, notes: ['drawing'],
        certificate: { status: 'unavailable' as const, kind: 'section' as const, code: 'noCertifier' as const },
        views: { section: sectionView(m), elevation: elevationView(m) },
        charts: [{
          key: 'interaction', xUnit: 'kN·m', yUnit: 'kN', xLabel: 'φMn (kN·m)',
          points: curve.map(p => [Math.abs(p.phiMnx), p.phiPn] as [number, number]),
          overlays: [{ key: 'demand', points: [[m.mu, m.pu] as [number, number]], markers: true }],
        }],
      };
    });
  },
});
