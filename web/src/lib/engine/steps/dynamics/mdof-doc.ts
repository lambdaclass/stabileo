/**
 * The n degree of freedom system and its modal decomposition, explained:
 * degrees of freedom and masses, K and M, the eigenproblem, the modes and
 * their orthogonality, participation, the uncoupled modal equations, each
 * mode solved as a single degree of freedom system, and the superposition
 * u(t) = Σ φᵢ·qᵢ(t) against a direct integration of the coupled system.
 */
import type { MethodContext } from '../registry';
import type { Applicability, Block, Step, StepDoc } from '../doc';
import { tx } from '../doc';
import { num, numText } from '../format';
import { plotOf, type Plot, type PlotColor } from '../plot';
import type { Sketch } from '../sketch';
import { sketchOf } from '../sketch';
import { resolveMdof, type MdofCase } from './mdof-build';
import { K as KEY, p, note, dt, nodeNames, dofTexN, dofTextN, matrixBlock, systemSketch, shapeSketch, shapeScale, expand, MAX_SHOWN, engineFrequencies } from './common';
import { mdofSystemBlocks, shearBlocks } from './mdof-system-blocks';

export type EngineModal = () => number[] | null;

export function mdofApplies(ctx: MethodContext): Applicability {
  const r = resolveMdof(ctx);
  return 'refusal' in r ? { ok: false, reason: tx(KEY + r.refusal, r.params) } : { ok: true };
}

const SHOWN_MODES = 4;
const MM = 1000;
const COLORS: PlotColor[] = ['load', 'reaction', 'moment', 'diagram', 'dof', 'deformed'];

function shearShape(ctx: MethodContext, c: MdofCase, phi: number[]): Sketch {
  const base = sketchOf(ctx.pm, { labels: false });
  const floors = c.shear!.floors;
  const ux = new Map<number, number>();
  floors.forEach((f, i) => f.nodes.forEach((n) => ux.set(n, phi[i])));
  const xs = base.nodes.map((n) => n.x), zs = base.nodes.map((n) => n.z);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const s = (0.15 * size) / Math.max(...phi.map(Math.abs), 1e-12);
  const at = (id: number) => { const n = base.nodes.find((q) => q.id === id)!; return { x: n.x + s * (ux.get(id) ?? 0), z: n.z }; };
  return { ...base, members: base.members.map((m) => ({ ...m, style: 'faint' as const })), deformed: base.members.map((m) => ({ points: [at(m.i), at(m.j)] })) };
}

/** The response at the degree of freedom that moves most: each mode's share, their sum and the direct integration, in mm. */
export function superpositionPlotOf(c: MdofCase, label: string, shown = SHOWN_MODES): Plot {
  const j = c.at;
  const contrib = c.sol.modes.slice(0, shown).map((m, i) => ({ points: c.times.map((tt) => [tt, m.phi[j] * c.resp.q[i](tt) * MM] as [number, number]), color: COLORS[i % COLORS.length], dashed: true, label: dt('mdof.sup.modeLabel', { i: i + 1 }) }));
  const total = { points: c.times.map((tt, k) => [tt, c.modal[k][j] * MM] as [number, number]), color: 'accent' as PlotColor, label: dt('mdof.sup.total') };
  const direct = { points: c.times.map((tt, k) => [tt, c.direct[k][j] * MM] as [number, number]), color: 'muted' as PlotColor, dashed: true, label: dt('mdof.sup.direct') };
  return plotOf('t (s)', `${label} (mm)`, [...contrib, direct, total]);
}

export function buildMdof(ctx: MethodContext, engineModal?: EngineModal): StepDoc {
  const c = resolveMdof(ctx);
  if ('refusal' in c) throw new Error(c.refusal);
  const n = c.dofs.length;
  const names = nodeNames(ctx.pm, c.sys ?? undefined);
  const labels = c.dofs.map((d) => dofTextN(d, names));
  const texs = c.dofs.map((d) => dofTexN(d, names));
  const nModes = c.sol.modes.length;
  const shown = Math.min(SHOWN_MODES, nModes);
  const steps: Step[] = [];
  const modeCols = c.sol.modes.map((_, i) => `φ${i + 1}`);

  const intro: Block[] = [
    p('mdof.intro.what'),
    { kind: 'eq', tex: '\\mathbf{M}\\,\\ddot{\\mathbf u} + \\mathbf{C}\\,\\dot{\\mathbf u} + \\mathbf{K}\\,\\mathbf u = \\mathbf F(t)' },
    p('mdof.intro.idea', undefined, true),
    c.kind === 'shear' ? p('mdof.intro.shear') : p(`mdof.intro.model.${c.settings.mass.massModel}`, { n: c.settings.mass.nPerMember }),
    c.ex.kind === 'free' ? p('mdof.intro.free') : p('mdof.intro.harmonic', { r: numText(c.settings.mdof.ratio, 3) }),
    p('mdof.intro.damping', { xi: numText(c.xi, 3) }),
    c.sys
      ? { kind: 'fig', sketch: systemSketch(ctx.pm, c.sys, names), caption: dt('mdof.intro.figCaption') }
      : { kind: 'fig', sketch: sketchOf(ctx.pm), caption: dt('mdof.intro.figCaption') },
    ...(n > MAX_SHOWN ? [note('info', 'mdof.intro.large', { n, max: MAX_SHOWN, shown })] : []),
  ];

  steps.push(...(c.sys ? mdofSystemBlocks(c, names, labels) : shearBlocks(c, labels)));

  const eqs: Block[] = [
    p('mdof.eig.lead'),
    { kind: 'eq', tex: '(\\mathbf K - \\omega^2\\mathbf M)\\,\\boldsymbol\\phi = \\mathbf 0 \\;\\Rightarrow\\; \\det(\\mathbf K - \\omega^2\\mathbf M) = 0' },
    p('mdof.eig.why', undefined, true),
  ];
  if (n === 2) {
    const [[k11, k12], [, k22]] = c.K, [[m11, m12], [, m22]] = c.M;
    const a = m11 * m22 - m12 * m12, b = -(k11 * m22 + k22 * m11 - 2 * k12 * m12), cc = k11 * k22 - k12 * k12;
    eqs.push(
      { kind: 'calc', label: dt('mdof.eig.polyLabel'), formula: '(k_{11}-\\omega^2 m_{11})(k_{22}-\\omega^2 m_{22}) - (k_{12}-\\omega^2 m_{12})^2 = 0', subst: `${num(a)}\\,\\omega^4 ${b < 0 ? '-' : '+'} ${num(Math.abs(b))}\\,\\omega^2 + ${num(cc)} = 0`, result: `\\omega_1^2 = ${num(c.sol.modes[0].omega ** 2)}, \\quad \\omega_2^2 = ${num(c.sol.modes[1].omega ** 2)}` },
    );
  } else {
    eqs.push(p('mdof.eig.numeric', { n }));
  }
  eqs.push({ kind: 'table', head: [dt('mdof.mode'), { tex: '\\omega\\ [\\text{rad/s}]' }, { tex: 'f\\ [\\text{Hz}]' }, { tex: 'T\\ [\\text{s}]' }], rows: c.sol.modes.slice(0, Math.max(shown, Math.min(nModes, 8))).map((m, i) => [i + 1, m.omega, m.f, m.T]), caption: dt('mdof.eig.tableCaption') });
  const eng = engineModal?.() ?? null;
  if (eng?.length) {
    const rows = c.sol.modes.slice(0, Math.min(6, eng.length)).map((m, i) => ({ label: `f_{${i + 1}}`, method: m.f, matrix: eng[i], unit: 'Hz' }));
    eqs.push(
      p(c.kind === 'shear' ? 'mdof.eig.engineShear' : c.settings.mass.massModel === 'consistent' ? 'mdof.eig.engineSame' : 'mdof.eig.engineOther'),
      engineFrequencies(rows, c.kind !== 'shear' && c.settings.mass.massModel === 'consistent', dt('mdof.eig.engineCaption')),
    );
  }
  steps.push({ title: dt('mdof.s4'), blocks: eqs });

  const figs: Block[] = c.sol.modes.slice(0, shown).map((m, i) => {
    const sketch = c.sys ? shapeSketch(ctx.pm, c.sys, names, expand(c.sys, m.phi), shapeScale(c.sys, expand(c.sys, m.phi))) : shearShape(ctx, c, m.phi);
    return { kind: 'fig', sketch, caption: dt('mdof.shape.caption', { i: i + 1, f: numText(m.f, 4), T: numText(m.T, 4) }) } as Block;
  });
  steps.push({
    title: dt('mdof.s5'),
    blocks: [
      p('mdof.shape.lead'),
      p('mdof.shape.norm', undefined, true),
      matrixBlock('\\boldsymbol\\Phi', c.sol.Phi, labels, dt('mdof.shape.matrixCaption'), modeCols),
      ...figs,
      ...(c.sys?.condensation ? [p('mdof.shape.drawn', undefined, true)] : []),
    ],
  });

  steps.push({
    title: dt('mdof.s6'),
    blocks: [
      p('mdof.orth.lead'),
      { kind: 'eq', tex: '\\boldsymbol\\phi_i^T\\,\\mathbf M\\,\\boldsymbol\\phi_j = 0, \\quad \\boldsymbol\\phi_i^T\\,\\mathbf K\\,\\boldsymbol\\phi_j = 0 \\quad (i \\ne j)' },
      matrixBlock('\\boldsymbol\\Phi^T\\mathbf M\\boldsymbol\\Phi', c.sol.PtMP, modeCols),
      matrixBlock('\\boldsymbol\\Phi^T\\mathbf K\\boldsymbol\\Phi', c.sol.PtKP, modeCols),
      { kind: 'note', tone: c.sol.offM < 1e-8 && c.sol.offK < 1e-8 ? 'ok' : 'warn', text: dt('mdof.orth.check', { m: numText(c.sol.offM, 2), k: numText(c.sol.offK, 2) }) },
      { kind: 'table', head: [dt('mdof.mode'), { tex: 'M_i = \\phi_i^T M \\phi_i' }, { tex: 'K_i = \\phi_i^T K \\phi_i' }, { tex: 'K_i / M_i' }, { tex: '\\omega_i^2' }], rows: c.sol.modes.slice(0, Math.min(nModes, 8)).map((m, i) => [i + 1, m.Mg, m.Kg, m.Kg / m.Mg, m.omega ** 2]), caption: dt('mdof.orth.tableCaption') },
      p('mdof.orth.why', undefined, true),
    ],
  });

  const totX = c.sol.totalMassX, totZ = c.sol.totalMassZ;
  steps.push({
    title: dt('mdof.s7'),
    blocks: [
      p('mdof.part.lead'),
      { kind: 'eq', tex: '\\Gamma_i = \\frac{\\boldsymbol\\phi_i^T\\mathbf M\\,\\mathbf r}{M_i}, \\qquad M_{ef,i} = \\frac{(\\boldsymbol\\phi_i^T\\mathbf M\\,\\mathbf r)^2}{M_i}' },
      p('mdof.part.r', undefined, true),
      { kind: 'table', head: [dt('mdof.mode'), { tex: '\\Gamma_x' }, { tex: 'M_{ef,x}\\ [\\text{t}]' }, { tex: '\\%' }, { tex: '\\Gamma_z' }, { tex: 'M_{ef,z}\\ [\\text{t}]' }, { tex: '\\%' }],
        rows: c.sol.modes.slice(0, Math.min(nModes, 8)).map((m, i) => [i + 1, m.gammaX, m.meffX, totX > 0 ? (100 * m.meffX) / totX : 0, m.gammaZ, m.meffZ, totZ > 0 ? (100 * m.meffZ) / totZ : 0]),
        caption: dt('mdof.part.caption', { mx: numText(totX), mz: numText(totZ) }) },
      p('mdof.part.why', undefined, true),
    ],
  });

  const r = c.resp;
  steps.push({
    title: dt('mdof.s8'),
    blocks: [
      p('mdof.dec.lead'),
      { kind: 'eq', tex: '\\mathbf u(t) = \\boldsymbol\\Phi\\,\\mathbf q(t) = \\sum_i \\boldsymbol\\phi_i\\,q_i(t)' },
      { kind: 'eq', tex: 'M_i\\,\\ddot q_i + C_i\\,\\dot q_i + K_i\\,q_i = P_i(t), \\qquad C_i = 2\\,\\xi\\,\\omega_i\\,M_i, \\quad P_i(t) = \\boldsymbol\\phi_i^T\\,\\mathbf F(t)', note: dt('mdof.dec.eqNote') },
      p('mdof.dec.why', undefined, true),
      ...(c.ex.kind === 'free'
        ? [p('mdof.dec.ic'), { kind: 'eq', tex: 'q_i(0) = \\frac{\\boldsymbol\\phi_i^T\\mathbf M\\,\\mathbf u_0}{M_i}, \\qquad \\dot q_i(0) = \\frac{\\boldsymbol\\phi_i^T\\mathbf M\\,\\mathbf v_0}{M_i}' } as Block]
        : [p('mdof.dec.force', { W: numText(c.Omega, 4) })]),
      { kind: 'table', head: [dt('mdof.mode'), { tex: 'M_i' }, { tex: 'K_i' }, { tex: 'C_i' }, c.ex.kind === 'free' ? { tex: 'q_i(0)' } : { tex: 'P_i\\ [\\text{kN}]' }],
        rows: c.sol.modes.slice(0, Math.min(nModes, 8)).map((m, i) => [i + 1, m.Mg, m.Kg, 2 * c.xi * m.omega * m.Mg, c.ex.kind === 'free' ? r.q0[i] : r.P[i]]), caption: dt('mdof.dec.tableCaption') },
    ],
  });

  const tEnd = c.times[c.times.length - 1];
  const subs: Block[] = c.sol.modes.slice(0, shown).map((m, i) => {
    const sp = r.sdof[i], h = r.harmonics[i];
    const blocks: Block[] = [{ kind: 'calc', formula: '\\omega_i = \\sqrt{K_i / M_i}', subst: `\\omega_{${i + 1}} = \\sqrt{${num(m.Kg)} / ${num(m.Mg)}}`, result: `\\omega_{${i + 1}} = ${num(sp.omega)}\\ \\text{rad/s}` }];
    if (h) {
      blocks.push(h.resonant
        ? note('warn', 'mdof.solve.resonant', { i: i + 1 })
        : { kind: 'calc', formula: '\\beta_i = \\Omega/\\omega_i, \\quad X_i = \\frac{P_i}{K_i}\\,D(\\beta_i, \\xi)', subst: `\\beta_{${i + 1}} = ${num(h.beta)}, \\quad D = ${num(h.D)}`, result: `X_{${i + 1}} = ${num(h.X)}` });
    } else {
      blocks.push({ kind: 'eq', tex: `q_{${i + 1}}(t) = e^{-\\xi\\omega_{${i + 1}} t}\\big(${num(r.q0[i])}\\cos\\omega_{D${i + 1}} t + ${num((r.qd0[i] + c.xi * sp.omega * r.q0[i]) / (sp.omegaD || sp.omega))}\\sin\\omega_{D${i + 1}} t\\big)` });
    }
    return { kind: 'sub', title: dt('mdof.solve.modeTitle', { i: i + 1 }), blocks };
  });
  const qSeries = c.sol.modes.slice(0, shown).map((_, i) => ({ points: c.times.map((tt) => [tt, r.q[i](tt)] as [number, number]), color: COLORS[i % COLORS.length], label: `q${i + 1}` }));
  steps.push({
    title: dt('mdof.s9'),
    blocks: [
      p('mdof.solve.lead'),
      ...subs,
      { kind: 'plot', plot: plotOf('t (s)', 'q', qSeries), caption: dt('mdof.solve.caption') },
      ...(nModes > shown ? [note('info', 'mdof.solve.more', { n: nModes, shown })] : []),
    ],
  });

  const j = c.at;
  const peak = Math.max(...c.modal.map((u) => Math.abs(u[j])), 1e-15);
  const maxDiff = Math.max(...c.modal.map((u, k) => Math.abs(u[j] - c.direct[k][j])));
  const picks = [0.1, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (c.times.length - 1)));
  steps.push({
    title: dt('mdof.s10'),
    blocks: [
      p('mdof.sup.lead', { dof: labels[j] }),
      { kind: 'eq', tex: `${texs[j]}(t) = \\sum_i \\phi_{j,i}\\,q_i(t)` },
      { kind: 'plot', plot: superpositionPlotOf(c, labels[j]), caption: dt('mdof.sup.caption', { dof: labels[j], T: numText(tEnd, 3) }) },
      p('mdof.sup.direct.lead'),
      p('mdof.sup.direct.why', undefined, true),
      { kind: 'table', head: [{ tex: 't\\ [\\text{s}]' }, dt('mdof.sup.modalCol'), dt('mdof.sup.directCol'), dt('mdof.eig.diff')],
        rows: picks.map((k) => [c.times[k], c.modal[k][j] * MM, c.direct[k][j] * MM, `${numText((Math.abs(c.modal[k][j] - c.direct[k][j]) / peak) * 100, 2)} %`]),
        caption: dt('mdof.sup.tableCaption', { dof: labels[j] }) },
      { kind: 'note', tone: maxDiff / peak < 0.02 ? 'ok' : 'warn', text: dt('mdof.sup.agree', { pct: numText((maxDiff / peak) * 100, 2) }) },
    ],
  });

  return {
    method: 'mdofModal',
    title: tx('steps.m.mdofModal.title'),
    subtitle: dt(c.kind === 'shear' ? 'mdof.subtitleShear' : 'mdof.subtitleModel', { n }),
    intro,
    steps,
  };
}
