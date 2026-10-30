/**
 * Distributed mass and its discretization, explained: the members cut into n
 * segments, the lumped and the consistent mass matrices of a segment, the
 * static condensation onto the translations, the frequencies of the chosen
 * model, and how they converge with n for each mass model towards the exact
 * beam and the engine's modal analysis.
 */
import type { MethodContext } from '../registry';
import type { Applicability, Block, Step, StepDoc } from '../doc';
import { tx } from '../doc';
import { num, numText } from '../format';
import { plotOf } from '../plot';
import { dynamicsSettings } from '../../dynamics/course/settings';
import { modelSystem, SystemError, type MdofSystem } from '../../dynamics/course/mdof-system';
import { lumpedFrameMass, consistentFrameMass, type MassModel } from '../../dynamics/course/mass-model';
import { exactBeam, frequenciesOf, MASS_MODELS, type ConvergenceRow } from '../../dynamics/course/convergence';
import { generalizedEigen } from '../../dynamics/course/dense';
import { K as KEY, p, note, t, nodeNames, dofTextN, matrixBlock, systemSketch, engineFrequencies } from './common';

export type EngineAt = (n: number) => number[] | null;

const MODES = 4;
const LOCAL = ['u₁', 'v₁', 'θ₁', 'u₂', 'v₂', 'θ₂'];

function system(ctx: MethodContext, n: number, mm: MassModel): MdofSystem {
  const points = ctx.model!.massSource?.points ?? [];
  return modelSystem(ctx.model!, points, { nPerMember: n, massModel: mm, barMass: true });
}

export function massApplies(ctx: MethodContext): Applicability {
  if (!ctx.model) return { ok: false, reason: tx(KEY + 'mdof.err.empty') };
  try {
    const s = system(ctx, dynamicsSettings().mass.nPerMember, dynamicsSettings().mass.massModel);
    if (!s.members.length) return { ok: false, reason: tx(KEY + 'mass.err.noBars') };
    return { ok: true };
  } catch (e) {
    if (e instanceof SystemError) return { ok: false, reason: tx(KEY + `mdof.err.${e.code}`, e.params) };
    throw e;
  }
}

function rows(ctx: MethodContext, ns: number[], engineAt?: EngineAt): ConvergenceRow[] {
  const points = ctx.model!.massSource?.points ?? [];
  const out: ConvergenceRow[] = [];
  for (const n of ns) {
    try {
      const f = {} as Record<MassModel, number[]>, dofs = {} as Record<MassModel, number>;
      for (const mm of MASS_MODELS) {
        const r = frequenciesOf(ctx.model!, points, { nPerMember: n, massModel: mm, barMass: true }, MODES);
        f[mm] = r.f; dofs[mm] = r.dofs;
      }
      const e = engineAt?.(n) ?? null;
      out.push({ n, f, dofs, ...(e ? { engine: e.slice(0, MODES) } : {}) });
    } catch (e) {
      if (e instanceof SystemError && e.code === 'tooBig') break;
      throw e;
    }
  }
  return out;
}

export function buildMass(ctx: MethodContext, engineAt?: EngineAt): StepDoc {
  const st = dynamicsSettings().mass;
  const n = st.nPerMember;
  const sys = system(ctx, n, st.massModel);
  const names = nodeNames(ctx.pm, sys);
  const piece = sys.members.find((m) => m.type === 'frame') ?? sys.members[0];
  const steps: Step[] = [];
  const added = sys.coords.size - ctx.pm.nodes.size;
  const pts = ctx.model!.massSource?.points ?? [];
  const exact = exactBeam(ctx.model!, pts, MODES);

  const intro: Block[] = [
    p('mass.intro.what'),
    p('mass.intro.idea', undefined, true),
    p('mass.intro.choice', { n }),
    { kind: 'note', tone: 'info', text: t(`mass.model.${st.massModel}`) },
    { kind: 'fig', sketch: systemSketch(ctx.pm, sys, names), caption: t('mass.intro.figCaption', { n }) },
  ];

  steps.push({
    title: t('mass.s1'),
    blocks: [
      p('mass.cut.lead', { n, added, dofs: sys.fullDofs.length }),
      p('mass.cut.why', undefined, true),
      ...(n === 1 ? [note('info', 'mass.cut.one')] : []),
    ],
  });

  const L = piece.L, rhoA = piece.rhoA;
  steps.push({
    title: t('mass.s2'),
    blocks: [
      p('mass.lumped.lead'),
      { kind: 'calc', formula: 'm_1 = m_2 = \\frac{\\rho A\\,L}{2}', subst: `m_1 = \\frac{${num(rhoA)} \\cdot ${num(L)}}{2}`, result: `m_1 = ${num((rhoA * L) / 2)}\\ \\text{t}` },
      matrixBlock('\\mathbf m_{c}', lumpedFrameMass(rhoA, L), LOCAL, t('mass.lumped.caption')),
      p('mass.lumped.why', undefined, true),
    ],
  });

  steps.push({
    title: t('mass.s3'),
    blocks: [
      p('mass.cons.lead'),
      { kind: 'eq', tex: '\\mathbf m = \\frac{\\rho A L}{420}\\begin{bmatrix} 140 & 0 & 0 & 70 & 0 & 0 \\\\ 0 & 156 & 22L & 0 & 54 & -13L \\\\ 0 & 22L & 4L^2 & 0 & 13L & -3L^2 \\\\ 70 & 0 & 0 & 140 & 0 & 0 \\\\ 0 & 54 & 13L & 0 & 156 & -22L \\\\ 0 & -13L & -3L^2 & 0 & -22L & 4L^2 \\end{bmatrix}' },
      p('mass.cons.shape', undefined, true),
      { kind: 'calc', formula: '\\frac{\\rho A L}{420}', subst: `\\frac{${num(rhoA)} \\cdot ${num(L)}}{420}`, result: `${num((rhoA * L) / 420)}\\ \\text{t}` },
      matrixBlock('\\mathbf m', consistentFrameMass(rhoA, L), LOCAL, t('mass.cons.caption')),
      p('mass.cons.why', undefined, true),
    ],
  });

  const g = system(ctx, n, 'guyan');
  const cond = g.condensation;
  const full = g.fullDofs.map((d) => dofTextN(d, names));
  const kept = g.dofs.map((d) => dofTextN(d, names));
  const fG = generalizedEigen(g.K, g.M).lambda.slice(0, MODES).map((l) => Math.sqrt(l) / (2 * Math.PI));
  steps.push({
    title: t('mass.s4'),
    blocks: [
      p('mass.guyan.lead', { m: kept.length, s: cond?.slaves.length ?? 0 }),
      { kind: 'eq', tex: '\\mathbf K^* = \\mathbf K_{mm} - \\mathbf K_{ms}\\,\\mathbf K_{ss}^{-1}\\,\\mathbf K_{sm}, \\quad \\mathbf T = \\begin{bmatrix} \\mathbf I \\\\ -\\mathbf K_{ss}^{-1}\\mathbf K_{sm} \\end{bmatrix}, \\quad \\mathbf M^* = \\mathbf T^T\\mathbf M\\,\\mathbf T' },
      p('mass.guyan.why', undefined, true),
      ...(cond ? [
        matrixBlock('\\mathbf T', cond.T, [...cond.masters, ...cond.slaves].map((i) => full[i]), t('mdof.k.tCaption'), kept),
        matrixBlock('\\mathbf K^*', g.K, kept, t('mdof.k.kCaption')),
        matrixBlock('\\mathbf M^*', g.M, kept, t('mdof.m.mCaption')),
      ] : [note('info', 'mass.guyan.none')]),
      { kind: 'table', head: [t('mdof.mode'), { tex: 'f\\ [\\text{Hz}]' }], rows: fG.map((f, i) => [i + 1, f]), caption: t('mass.guyan.freqCaption') },
      p('mass.guyan.exactness', undefined, true),
    ],
  });

  const chosen = generalizedEigen(sys.K, sys.M).lambda.slice(0, MODES).map((l) => Math.sqrt(Math.max(l, 0)) / (2 * Math.PI));
  const eng = engineAt?.(n) ?? null;
  const head = [t('mdof.mode'), t(`mass.col.${st.massModel}`), ...(exact ? [t('mass.col.exact')] : [])];
  steps.push({
    title: t('mass.s5'),
    blocks: [
      p('mass.freq.lead', { n }),
      { kind: 'table', head, rows: chosen.map((f, i) => [i + 1, f, ...(exact ? [exact.modes[i]?.f ?? '—'] : [])]), caption: t('mass.freq.caption') },
      ...(eng ? [p(st.massModel === 'consistent' ? 'mdof.eig.engineSame' : 'mdof.eig.engineOther'), engineFrequencies(chosen.map((f, i) => ({ label: `f_{${i + 1}}`, method: f, matrix: eng[i] ?? NaN, unit: 'Hz' })).filter((r) => Number.isFinite(r.matrix)), st.massModel === 'consistent', t('mdof.eig.engineCaption'))] : []),
      ...(exact ? [p(`mass.exact.${exact.beamCase}`, { L: numText(exact.L) })] : [p('mass.exact.none', undefined, true)]),
      ...(exact ? [{ kind: 'eq', tex: `\\omega_1 = ${num(exactCoef(exact))}\\sqrt{\\frac{EI}{\\rho A\\,L^4}} = ${num(exactCoef(exact))}\\sqrt{\\frac{${num(exact.EI)}}{${num(exact.rhoA)} \\cdot ${num(exact.L)}^4}}` } as Block] : []),
    ],
  });

  const ns = [...new Set([1, 2, 4, 8, n])].sort((a, b) => a - b);
  const table = rows(ctx, ns, engineAt);
  const ref = exact?.modes[0]?.f ?? table[table.length - 1]?.f.consistent[0];
  const err = (f: number) => (ref ? `${numText(((f - ref) / ref) * 100, 3)} %` : '—');
  const convRows = table.map((r) => [r.n, r.dofs.lumped, r.f.lumped[0], err(r.f.lumped[0]), r.f.consistent[0], err(r.f.consistent[0]), r.f.guyan[0], err(r.f.guyan[0]), ...(r.engine ? [r.engine[0]] : [])]);
  const series = MASS_MODELS.map((mm, i) => ({ points: table.map((r) => [r.n, r.f[mm][0]] as [number, number]), color: (['load', 'accent', 'reaction'] as const)[i], label: t(`mass.col.${mm}`) }));
  steps.push({
    title: t('mass.s6'),
    blocks: [
      p('mass.conv.lead'),
      { kind: 'table', head: ['n', t('mass.col.dofs'), t('mass.col.lumped'), '%', t('mass.col.consistent'), '%', t('mass.col.guyan'), '%', ...(table.some((r) => r.engine) ? [t('mass.col.engine')] : [])], rows: convRows,
        caption: t(exact ? 'mass.conv.captionExact' : 'mass.conv.captionRef') },
      { kind: 'plot', plot: plotOf('n', 'f₁ (Hz)', [...series, ...(exact && ref ? [{ points: [[ns[0], ref], [ns[ns.length - 1], ref]] as Array<[number, number]>, color: 'muted' as const, dashed: true, label: t('mass.col.exact') }] : [])]), caption: t('mass.conv.plotCaption') },
      ...(ref && exact ? [p('mass.conv.exactLine', { f: numText(ref, 4) })] : []),
      p('mass.conv.why', undefined, true),
      ...(table.length < ns.length ? [note('info', 'mass.conv.cut', { n: table[table.length - 1]?.n ?? 1 })] : []),
    ],
  });

  return { method: 'massDiscretization', title: tx('steps.m.massDiscretization.title'), subtitle: t(`mass.subtitle.${st.massModel}`, { n }), intro, steps };
}

function exactCoef(e: NonNullable<ReturnType<typeof exactBeam>>): number {
  return (e.modes.find((m) => m.kind === 'bending')!.f * 2 * Math.PI) / Math.sqrt(e.EI / (e.rhoA * e.L ** 4));
}
