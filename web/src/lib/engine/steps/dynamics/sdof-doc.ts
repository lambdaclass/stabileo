/**
 * The single degree of freedom system explained: stiffness and mass (typed or
 * from a node of the model), natural frequency, damping and its regimes,
 * free vibration from u₀ and v₀, the harmonic force (amplification factor,
 * phase, resonance), the total response, and the engine's answer for the same
 * system.
 */
import type { MethodContext } from '../registry';
import type { Applicability, Block, Step, StepDoc, CompareRow } from '../doc';
import { tx, compareNoteFor } from '../doc';
import { num, numText } from '../format';
import { plotOf, type Plot } from '../plot';
import { dynamicsSettings, type SdofSettings } from '../../dynamics/course/settings';
import { sdofProps, freeConstants, freeResponse, harmonic, forcedResponse, dynamicAmplification, resonancePeak, sample, timeWindow, type SdofProps, type Harmonic } from '../../dynamics/course/sdof';
import { sdofFromModel, defaultSdofNode, type SdofFromModel } from '../../dynamics/course/sdof-model';
import { engineCheck, type EngineCheck } from '../../dynamics/course/sdof-engine';
import { K, p, note, t, nodeNames } from './common';

export interface ResolvedSdof { m: number; k: number; fromModel: SdofFromModel | null; s: SdofSettings }

/** The system the reader set: typed, or taken from the model; or why it cannot be built. */
export function resolveSdof(ctx: MethodContext, s: SdofSettings = dynamicsSettings().sdof): ResolvedSdof | { refusal: string } {
  if (s.source === 'manual' || !ctx.model) {
    if (!(s.m > 0) || !(s.k > 0)) return { refusal: 'sdof.err.mk' };
    return { m: s.m, k: s.k, fromModel: null, s };
  }
  const pts = ctx.model.massSource?.points ?? [];
  const node = s.nodeId ?? defaultSdofNode(ctx.model, pts);
  const r = sdofFromModel(ctx.model, pts, node, s.dir);
  if (typeof r === 'string') return { refusal: `sdof.err.${r}` };
  return { m: r.m, k: r.k, fromModel: r, s };
}

export function sdofApplies(ctx: MethodContext): Applicability {
  const r = resolveSdof(ctx);
  return 'refusal' in r ? { ok: false, reason: tx(K + r.refusal) } : { ok: true };
}

const MM = 1000;
const mmPts = (pts: Array<[number, number]>) => pts.map(([x, y]) => [x, y * MM] as [number, number]);

export interface SdofSolution {
  props: SdofProps;
  h: Harmonic | null;
  Omega: number;
  tEnd: number;
  free: Array<[number, number]>;
  total: Array<[number, number]> | null;
  steady: Array<[number, number]> | null;
  transient: Array<[number, number]> | null;
}

export function solveSdof(m: number, k: number, s: SdofSettings): SdofSolution {
  const props = sdofProps(m, k, s.xi);
  const Omega = s.Omega ?? 0.8 * props.omega;
  const h = s.F0 !== 0 && Omega > 0 ? harmonic(props, s.F0, Omega) : null;
  const tEnd = timeWindow(props, h ? Omega : 0);
  const free = sample(freeResponse(props, s.u0, s.v0), tEnd);
  if (!h) return { props, h, Omega, tEnd, free, total: null, steady: null, transient: null };
  const r = forcedResponse(props, h, s.u0, s.v0);
  return { props, h, Omega, tEnd, free, total: sample(r.total, tEnd), steady: sample(r.steady, tEnd), transient: sample(r.transient, tEnd) };
}

/** D(β) for the reader's ξ, with three reference ratios and the case marked. */
export function dafPlotOf(xi: number, beta: number): Plot {
  const bs = Array.from({ length: 301 }, (_, i) => (3 * i) / 300);
  const curve = (z: number) => bs.map((b) => [b, dynamicAmplification(b, z)] as [number, number]);
  const refs = [0.1, 0.2, 0.5].filter((z) => Math.abs(z - xi) > 1e-9);
  const D = dynamicAmplification(beta, xi);
  const top = Math.max(4, Math.min(Number.isFinite(D) ? D * 1.25 : 12, 12), xi > 0 ? Math.min((1 / (2 * xi)) * 1.1, 12) : 12);
  return plotOf('β = Ω/ω', 'D', [
    ...refs.map((z) => ({ points: curve(z), color: 'muted' as const, dashed: true, label: `ξ = ${z}` })),
    { points: curve(xi), color: 'accent' as const, label: `ξ = ${numText(xi, 3)}` },
  ], { marks: Number.isFinite(D) && D <= top ? [{ x: beta, y: D, label: `D = ${numText(D, 3)}` }] : [], vlines: [{ x: 1, label: 'β = 1' }], yRange: [0, top] });
}

/** u(t) in mm: the free vibration, or under the force the total with its transient and steady parts. */
export function responsePlotOf(sol: SdofSolution, forced: boolean): Plot {
  if (forced && sol.total) {
    return plotOf('t (s)', 'u (mm)', [
      { points: mmPts(sol.transient!), color: 'deformed', dashed: true, label: t('sdof.total.transient') },
      { points: mmPts(sol.steady!), color: 'muted', dashed: true, label: t('sdof.total.steady') },
      { points: mmPts(sol.total), color: 'accent', label: 'u(t)' },
    ]);
  }
  return plotOf('t (s)', 'u (mm)', [{ points: mmPts(sol.free), color: 'accent', label: 'u(t)' }]);
}

export function buildSdof(ctx: MethodContext): StepDoc {
  const r = resolveSdof(ctx);
  if ('refusal' in r) throw new Error(r.refusal);
  const { m, k, fromModel, s } = r;
  const sol = solveSdof(m, k, s);
  const P = sol.props;
  const names = nodeNames(ctx.pm);
  const nodeName = fromModel ? names.get(fromModel.nodeId) ?? String(fromModel.nodeId) : '';
  const dirWord = tx(K + (s.dir === 'ux' ? 'common.dirX' : 'common.dirZ'));
  const steps: Step[] = [];

  const intro: Block[] = [
    p('sdof.intro.what'),
    { kind: 'eq', tex: 'm\\,\\ddot u + c\\,\\dot u + k\\,u = F(t)', note: t('sdof.intro.eqNote') },
    p('sdof.intro.units', undefined, true),
    fromModel ? p('sdof.intro.fromModel', { node: nodeName }) : p('sdof.intro.manual'),
    {
      kind: 'table', head: [t('common.quantity'), t('common.value')], rows: [
        [{ tex: 'm' }, { tex: `${num(m)}\\ \\text{t}` }],
        [{ tex: 'k' }, { tex: `${num(k)}\\ \\text{kN/m}` }],
        [{ tex: '\\xi' }, { tex: `${num(s.xi)}` }],
        [{ tex: 'u_0' }, { tex: `${num(s.u0 * MM)}\\ \\text{mm}` }],
        [{ tex: 'v_0' }, { tex: `${num(s.v0 * MM)}\\ \\text{mm/s}` }],
        [{ tex: 'F_0' }, { tex: `${num(s.F0)}\\ \\text{kN}` }],
        [{ tex: '\\Omega' }, { tex: sol.h ? `${num(sol.Omega)}\\ \\text{rad/s}` : '\\text{—}' }],
      ], caption: t('sdof.dataCaption'),
    },
  ];

  const s1: Block[] = [];
  if (fromModel) {
    s1.push(
      p('sdof.k.lead', { node: nodeName }),
      { kind: 'note', tone: 'info', text: dirWord },
      p('sdof.k.why', undefined, true),
      { kind: 'calc', label: t('sdof.k.deltaLabel'), formula: '\\delta = \\frac{u}{F}\\Big|_{F=1}', result: `\\delta = ${num(fromModel.delta)}\\ \\text{m/kN}` },
      { kind: 'calc', formula: 'k = \\frac{1}{\\delta} = K_{mm} - K_{ms}\\,K_{ss}^{-1}\\,K_{sm}', subst: `k = \\frac{1}{${num(fromModel.delta)}}`, result: `k = ${num(k)}\\ \\text{kN/m}` },
      p('sdof.m.fromPoint', { node: nodeName, m: numText(m) }),
      p('sdof.m.why', undefined, true),
    );
  } else {
    s1.push(p('sdof.k.manual', { k: numText(k), m: numText(m) }), p('sdof.m.why', undefined, true));
  }
  steps.push({ title: t('sdof.s1'), blocks: s1 });

  steps.push({
    title: t('sdof.s2'),
    blocks: [
      p('sdof.omega.lead'),
      { kind: 'calc', label: t('sdof.omega.label'), formula: '\\omega = \\sqrt{\\frac{k}{m}}', subst: `\\omega = \\sqrt{\\frac{${num(k)}}{${num(m)}}}`, result: `\\omega = ${num(P.omega)}\\ \\text{rad/s}` },
      { kind: 'calc', formula: 'f = \\frac{\\omega}{2\\pi}, \\quad T = \\frac{1}{f}', subst: `f = \\frac{${num(P.omega)}}{2\\pi}`, result: `f = ${num(P.f)}\\ \\text{Hz}, \\quad T = ${num(P.T)}\\ \\text{s}` },
      p('sdof.omega.why', undefined, true),
    ],
  });

  const regimeRows = ([['undamped', '\\xi = 0', 'u_0\\cos\\omega t + \\frac{v_0}{\\omega}\\sin\\omega t'],
    ['underdamped', '0 < \\xi < 1', 'e^{-\\xi\\omega t}(A\\cos\\omega_D t + B\\sin\\omega_D t)'],
    ['critical', '\\xi = 1', 'e^{-\\omega t}(A + B\\,t)'],
    ['overdamped', '\\xi > 1', 'e^{-\\xi\\omega t}(A\\cosh\\omega^* t + B\\sinh\\omega^* t)']] as const)
    .map(([key, cond, form]) => [t(`sdof.regime.${key}`), { tex: cond }, { tex: form }, P.regime === key ? '◀' : '']);
  const damp: Block[] = [
    p('sdof.damp.lead'),
    { kind: 'calc', formula: 'c_{cr} = 2\\,m\\,\\omega, \\quad c = \\xi\\,c_{cr}', subst: `c_{cr} = 2 \\cdot ${num(m)} \\cdot ${num(P.omega)}`, result: `c_{cr} = ${num(P.cCr)}\\ \\text{kN·s/m}, \\quad c = ${num(P.c)}\\ \\text{kN·s/m}` },
    { kind: 'table', head: [t('sdof.regime.head'), t('sdof.regime.cond'), t('sdof.regime.form'), ''], rows: regimeRows, caption: t(`sdof.regime.is.${P.regime}`) },
  ];
  if (P.regime === 'underdamped') {
    damp.push(
      { kind: 'calc', label: t('sdof.damp.wdLabel'), formula: '\\omega_D = \\omega\\sqrt{1-\\xi^2}', subst: `\\omega_D = ${num(P.omega)}\\sqrt{1-${num(s.xi)}^2}`, result: `\\omega_D = ${num(P.omegaD)}\\ \\text{rad/s}, \\quad T_D = ${num(P.TD)}\\ \\text{s}` },
      { kind: 'calc', label: t('sdof.damp.decLabel'), formula: '\\delta = \\ln\\frac{u_n}{u_{n+1}} = \\frac{2\\pi\\xi}{\\sqrt{1-\\xi^2}}', subst: `\\delta = \\frac{2\\pi \\cdot ${num(s.xi)}}{\\sqrt{1-${num(s.xi)}^2}}`, result: `\\delta = ${num(P.logDec)}`, check: `\\frac{u_n}{u_{n+1}} = e^{\\delta} = ${num(Math.exp(P.logDec))}` },
      p('sdof.damp.decWhy', { pct: numText((1 - Math.exp(-P.logDec)) * 100, 3) }, true),
    );
  } else if (P.regime === 'undamped') {
    damp.push(p('sdof.damp.none', undefined, true));
  } else {
    damp.push(p('sdof.damp.noOscillation', undefined, true));
  }
  steps.push({ title: t('sdof.s3'), blocks: damp });

  const c = freeConstants(P, s.u0, s.v0);
  const freeTex = P.regime === 'undamped'
    ? `u(t) = ${num(c.A)}\\cos(${num(P.omega)}\\,t) + ${num(c.B)}\\sin(${num(P.omega)}\\,t)`
    : P.regime === 'underdamped'
      ? `u(t) = e^{-${num(s.xi * P.omega)}\\,t}\\,\\big(${num(c.A)}\\cos(${num(P.omegaD)}\\,t) + ${num(c.B)}\\sin(${num(P.omegaD)}\\,t)\\big)`
      : P.regime === 'critical'
        ? `u(t) = e^{-${num(P.omega)}\\,t}\\,\\big(${num(c.A)} + ${num(c.B)}\\,t\\big)`
        : `u(t) = e^{-${num(s.xi * P.omega)}\\,t}\\,\\big(${num(c.A)}\\cosh(${num(P.omega * Math.sqrt(s.xi ** 2 - 1))}\\,t) + ${num(c.B)}\\sinh(${num(P.omega * Math.sqrt(s.xi ** 2 - 1))}\\,t)\\big)`;
  const constTex = P.regime === 'undamped' ? 'A = u_0, \\quad B = \\frac{v_0}{\\omega}'
    : P.regime === 'underdamped' ? 'A = u_0, \\quad B = \\frac{v_0 + \\xi\\omega u_0}{\\omega_D}'
      : P.regime === 'critical' ? 'A = u_0, \\quad B = v_0 + \\omega u_0' : 'A = u_0, \\quad B = \\frac{v_0 + \\xi\\omega u_0}{\\omega^*}, \\ \\omega^* = \\omega\\sqrt{\\xi^2-1}';
  const env = P.regime === 'underdamped' || P.regime === 'undamped'
    ? [{ points: mmPts(sol.free.map(([x]) => [x, c.rho * Math.exp(-s.xi * P.omega * x)] as [number, number])), color: 'muted' as const, dashed: true, label: t('sdof.envelope') },
      { points: mmPts(sol.free.map(([x]) => [x, -c.rho * Math.exp(-s.xi * P.omega * x)] as [number, number])), color: 'muted' as const, dashed: true }]
    : [];
  steps.push({
    title: t('sdof.s4'),
    blocks: [
      p('sdof.free.lead'),
      { kind: 'calc', label: t('sdof.free.constLabel'), formula: constTex, result: `A = ${num(c.A)}\\ \\text{m}, \\quad B = ${num(c.B)}\\ \\text{m}${P.regime === 'critical' ? '/\\text{s}' : ''}` },
      { kind: 'eq', tex: freeTex },
      ...(P.regime === 'underdamped' || P.regime === 'undamped' ? [{ kind: 'calc', label: t('sdof.free.ampLabel'), formula: '\\rho = \\sqrt{A^2 + B^2}', result: `\\rho = ${num(c.rho * MM)}\\ \\text{mm}` } as Block] : []),
      { kind: 'plot', plot: plotOf('t (s)', 'u (mm)', [...env, { points: mmPts(sol.free), color: 'accent', label: 'u(t)' }]), caption: t('sdof.free.caption') },
      p('sdof.free.why', undefined, true),
    ],
  });

  if (!sol.h) {
    steps.push({ title: t('sdof.s5'), blocks: [note('info', 'sdof.noForce')] });
  } else {
    const h = sol.h;
    const peak = resonancePeak(s.xi);
    steps.push({
      title: t('sdof.s5'),
      blocks: [
        p('sdof.harm.lead'),
        { kind: 'eq', tex: 'm\\,\\ddot u + c\\,\\dot u + k\\,u = F_0\\sin\\Omega t' },
        { kind: 'calc', label: t('sdof.harm.betaLabel'), formula: '\\beta = \\frac{\\Omega}{\\omega}', subst: `\\beta = \\frac{${num(h.Omega)}}{${num(P.omega)}}`, result: `\\beta = ${num(h.beta)}` },
        { kind: 'calc', label: t('sdof.harm.dLabel'), formula: 'D = \\frac{1}{\\sqrt{(1-\\beta^2)^2 + (2\\xi\\beta)^2}}', subst: `D = \\frac{1}{\\sqrt{(1-${num(h.beta)}^2)^2 + (2 \\cdot ${num(s.xi)} \\cdot ${num(h.beta)})^2}}`, result: h.resonant ? 'D \\to \\infty' : `D = ${num(h.D)}` },
        ...(h.resonant ? [note('warn', 'sdof.harm.resonantUndamped')] : [
          { kind: 'calc', label: t('sdof.harm.xLabel'), formula: 'u_{st} = \\frac{F_0}{k}, \\quad X = D\\,u_{st}', subst: `u_{st} = \\frac{${num(h.F0)}}{${num(k)}} = ${num(h.ust * MM)}\\ \\text{mm}`, result: `X = ${num(h.X * MM)}\\ \\text{mm}` } as Block,
          { kind: 'calc', label: t('sdof.harm.phiLabel'), formula: '\\tan\\varphi = \\frac{2\\xi\\beta}{1-\\beta^2}', result: `\\varphi = ${num(h.phi)}\\ \\text{rad} = ${num((h.phi * 180) / Math.PI)}°` } as Block,
          { kind: 'eq', tex: `u_p(t) = X\\sin(\\Omega t - \\varphi) = ${num(h.X)}\\sin(${num(h.Omega)}\\,t - ${num(h.phi)})` } as Block,
        ]),
        { kind: 'plot', plot: dafPlotOf(s.xi, h.beta), caption: t('sdof.dafCaption') },
        p(h.beta < 0.9 ? 'sdof.harm.below' : h.beta > 1.1 ? 'sdof.harm.above' : 'sdof.harm.near', undefined, true),
        ...(peak && Number.isFinite(peak.D) ? [p('sdof.harm.peak', { beta: numText(peak.beta, 4), d: numText(peak.D, 4) }, true)] : []),
      ],
    });
    const fr = forcedResponse(P, h, s.u0, s.v0);
    steps.push({
      title: t('sdof.s6'),
      blocks: [
        p('sdof.total.lead'),
        { kind: 'eq', tex: 'u(t) = u_h(t) + u_p(t)', note: t('sdof.total.eqNote') },
        { kind: 'calc', label: t('sdof.total.icLabel'), formula: 'u_h(0) = u_0 - u_p(0), \\quad \\dot u_h(0) = v_0 - \\dot u_p(0)', result: `u_h(0) = ${num(fr.u0t * MM)}\\ \\text{mm}, \\quad \\dot u_h(0) = ${num(fr.v0t * MM)}\\ \\text{mm/s}` },
        { kind: 'plot', plot: responsePlotOf(sol, true), caption: t('sdof.total.caption') },
        p(h.resonant ? 'sdof.total.whyResonant' : 'sdof.total.why', undefined, true),
      ],
    });
  }

  const eng = engineCheck(P, sol.h, sol.tEnd, 8);
  steps.push({ title: t('sdof.s7'), blocks: engineBlocks(P, sol, eng, s) });

  return {
    method: 'sdof',
    title: tx('steps.m.sdof.title'),
    subtitle: fromModel ? t('sdof.subtitleModel', { node: nodeName }) : t('sdof.subtitleManual'),
    intro,
    steps,
  };
}

function engineBlocks(P: SdofProps, sol: SdofSolution, eng: EngineCheck, s: SdofSettings): Block[] {
  if (eng.omega === null) return [note('info', 'sdof.engine.unavailable')];
  const rows: CompareRow[] = [{ label: '\\omega', method: P.omega, matrix: eng.omega, unit: 'rad/s' }];
  if (sol.h && eng.X !== null) rows.push({ label: 'X', method: sol.h.X * MM, matrix: eng.X * MM, unit: 'mm' });
  if (sol.h && eng.history) {
    const fr = forcedResponse(P, sol.h, 0, 0);
    for (const [tt, u] of eng.history.slice(1).filter((_, i) => i % 2 === 1)) rows.push({ label: `u(${numText(tt, 3)}\\ \\text{s})`, method: fr.total(tt) * MM, matrix: u * MM, unit: 'mm' });
  }
  return [
    p('sdof.engine.lead'),
    p('sdof.engine.how', undefined, true),
    ...(sol.h && (s.u0 !== 0 || s.v0 !== 0) ? [note('info', 'sdof.engine.fromRest')] : []),
    { kind: 'compare', rows, caption: compareNoteFor(rows).key.endsWith('Exact') ? tx('steps.common.compareExact') : t('sdof.engine.diff') },
  ];
}
