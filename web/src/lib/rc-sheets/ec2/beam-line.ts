import { ec2Shear } from '../../engine/design/eurocode/ec2-beam';
import { barArea, groupsArea } from '../bars';
import { beamLine, type LineAdopted, type LineCode, type LineLayout } from '../beam-line';
import type { BeamContext, BeamRow } from '../beam-row';
import type { Fmt } from '../format';
import { check, type StepGroup } from '../types';
import { EC2_BENDS, designAnchorage, hookAlpha, lapLength, mandrel, matOf, minSteel, shearCapacity, ALPHA6, type Ec2Set } from './basis';
import { beamCapacity } from './beam-section';

const goodBond = (top: boolean, h: number) => !top || h <= 0.25 + 1e-9;

export function ec2LineCode(set: Ec2Set): LineCode {
  const mat = (c: BeamContext) => matOf(c.mat.fc, c.mat.fy, set.p);
  return {
    development: (c, dia, top, h) => designAnchorage(mat(c), dia, goodBond(top, h)),
    hooked: (c, dia) => designAnchorage(mat(c), dia, true, hookAlpha(c.cover + c.stirrupDia / 1000, dia)),
    mandrel: (dia) => mandrel(dia) / 1000,
    hookExtension: (dia) => EC2_BENDS.extension(dia, 90, 'longitudinal'),
    lap: (c, dia, top, h) => lapLength(mat(c), dia, goodBond(top, h)),
    minBottom: (c, b, d) => minSteel(mat(c), set.p, b, d) * 1e4,
    moments: (c, qs) => { const m = mat(c); return qs.map((q) => beamCapacity(q.demand, c.cover, q.sd, q.tension, q.compression, q.sagging, 0, m, set.p).mrd); },
    shear: (c, q, st) => {
      const m = mat(c), d = q.demand.h - c.cover - st.dia / 1000 - 0.01;
      const r = shearCapacity(q.demand.b, d, groupsArea(q.tension) * 1e-4, st.spacing > 0 ? (st.legs * barArea(st.dia) * 1e-4) / st.spacing : 0, m, set.p);
      return { design: r.vrd, nominal: r.vrd };
    },
    cutoff: (input) => ({ legality: input.inTensionZone ? 'lowShear' : 'notInTension', extraStirrups: null }),
    stirrupMax: (_c, _b, d) => set.p.linkMaxSpacing * d,
    text: {
      cutoff: {
        notInTension: '9.2.1.3(2): M = 0',
        lowShear: '9.2.1.3(1)–(3): al-shifted envelope, lbd past the point',
        doubleArea: '9.2.1.3(1)–(3): al-shifted envelope, lbd past the point',
        extraStirrups: '9.2.1.3(1)–(3): al-shifted envelope, lbd past the point',
        illegal: '—',
      },
      clause: { envelope: '9.2.1.3, 6.1', bottomRun: '9.2.1.4(1), 9.2.1.5(1)', fit: '8.2(2)', hooks: '8.3, 8.4.4', splices: '8.7.3' },
      formula: { capacity: 'MRd(x) ≥ MEd(x ± al) ∀x', cut: 'x(MRd,cont = MEd(x ± al)) + max(d; 12·Ø) ≥ c + lbd', third: 'As⁻/3 → x(M = 0) + max(d; 12·Ø; ln/16)' },
    },
  };
}

const DISPLAY_KEYS: Record<string, string> = {
  'rcSheets.s.lineCut': 'rcSheets.ec2.s.lineCut',
  'rcSheets.s.lineCutoff': 'rcSheets.ec2.s.lineCutoff',
  'rcSheets.s.lineThird': 'rcSheets.ec2.s.lineThird',
};

export function shiftOf(set: Ec2Set, r: BeamRow, c: BeamContext): { al: number; cot: number; d: number } {
  const m = matOf(c.mat.fc, c.mat.fy, set.p);
  const d = r.h - c.cover - c.stirrupDia / 1000 - 0.01;
  const asl = Math.min(r.req.bottom, r.req.top > 0 ? r.req.top : r.req.bottom) * 1e-4;
  const s = ec2Shear({ bw: r.b, d, fck: m.fck, fyk: m.fyk, asl, VEd: r.demand.vu.value }, set.p);
  return { al: (0.9 * d * s.cotTheta) / 2, cot: s.cotTheta, d };
}

export function shiftedRow(r: BeamRow, al: number): BeamRow {
  const env = r.demand.env;
  if (!env?.length) return r;
  const at = (x: number, k: 'pos' | 'neg') => {
    if (x <= env[0]!.x) return env[0]![k];
    for (let i = 1; i < env.length; i++) {
      const a = env[i - 1]!, b = env[i]!;
      if (x <= b.x) return b.x - a.x > 1e-12 ? a[k] + ((b[k] - a[k]) * (x - a.x)) / (b.x - a.x) : b[k];
    }
    return env[env.length - 1]![k];
  };
  const window = (x: number, k: 'pos' | 'neg') => Math.max(at(x - al, k), at(x + al, k), ...env.filter((o) => Math.abs(o.x - x) <= al + 1e-9).map((o) => o[k]));
  const shifted = env.map((e) => ({ ...e, pos: window(e.x, 'pos'), neg: window(e.x, 'neg') }));
  return { ...r, demand: { ...r.demand, env: shifted } };
}

export function makeBeamLine(set: Ec2Set) {
  const code = ec2LineCode(set);
  return function ec2BeamLine(rows: BeamRow[], c: BeamContext, adopted: LineAdopted | undefined, fmt: Fmt): LineLayout {
    const shifts = rows.map((r) => shiftOf(set, r, c));
    const layout = beamLine(rows.map((r, k) => shiftedRow(r, shifts[k]!.al)), c, adopted, fmt, code);
    const m = matOf(c.mat.fc, c.mat.fy, set.p);
    const hMax = Math.max(...rows.map((r) => r.h));
    const method = layout.steps[0]!;
    const steps: StepGroup[] = [
      {
        title: method.title,
        steps: [
          ...rows.map((r, k) => ({ label: 'rcSheets.ec2.s.lineShift', formula: `${r.name}: al = z·(cotθ − cotα)/2 = 0.45·d·cotθ, cotθ = ${fmt(shifts[k]!.cot, 2)} (9.2.1.3(2))`, value: `${fmt(shifts[k]!.al * 100, 1)} cm` })),
          ...method.steps.map((s) => ({ ...s, label: DISPLAY_KEYS[s.label] ?? s.label })),
        ],
      },
      {
        title: 'rcSheets.g.anchorage',
        steps: [
          { label: 'rcSheets.ec2.s.bond', formula: `fbd = 2.25·η1·η2·fctd (8.4.2(2)); η1 = ${hMax > 0.25 ? '0.7' : '1'} for the top bars (h ${hMax > 0.25 ? '>' : '≤'} 250 mm)`, value: `fctd = ${fmt(m.fctd, 2)} MPa` },
          { label: 'rcSheets.ec2.s.alphas', formula: `lbd = α1·…·α5·lb,rqd, lb,rqd = (Ø/4)·(fyd/fbd); α1..α5 = 1 straight, α1 = 0.7 hooked where cd > 3Ø; l0 = α6·lb,rqd, α6 = ${fmt(ALPHA6, 1)} (8.4.3, 8.4.4, 8.7.3)`, value: '' },
          ...layout.anchorage.map((x) => ({
            label: 'rcSheets.s.ldRow', formula: `Ø${x.dia} · φm ≥ ${mandrel(x.dia)} mm (8.3(2))`,
            value: `lbd = ${fmt(x.ld * 100, 0)} · lbd,top = ${fmt(x.ldTop * 100, 0)} · lbd,hook = ${fmt(x.ldh * 100, 0)} · l0 = ${fmt(x.lap * 100, 0)} cm`,
          })),
        ],
      },
      ...layout.steps.slice(2),
    ];
    const verifications = layout.verifications.map((v) => (v.label === 'rcSheets.v.lineHooks'
      ? check(v.label, v.ok, { clause: v.clause, capacity: layout.anchorage.map((x) => `Ø${x.dia}: lbd,hook ${fmt(x.ldh * 100, 0)} cm`).join(' · ') })
      : v));
    return { ...layout, steps, verifications };
  };
}
