/**
 * The displacement method as a course solves it by hand ("método de las
 * incógnitas cinemáticas"): count the kinematic unknowns (GIC), lock them all
 * (estado 0), release them one at a time (estados 1…n), write the equilibrium
 * of the fictitious restraints K·D = −R⁰, solve and superpose. It takes what
 * slope-deflection and moment distribution leave out: internal hinges,
 * bielas, springs, settlements, temperature, and a switch between members
 * that keep their length and members with axial stiffness.
 */
import type { ExplainedMethod, MethodContext, MethodOption } from '../registry';
import type { Applicability, Block, Cell, CompareRow, Step, StepDoc } from '../doc';
import { tx } from '../doc';
import { num } from '../format';
import { solveDense } from '../sway-modes';
import { countIndeterminacy } from '../../force-method/primary';
import { closingSteps, deltaSym, linTex, loadedSketch, modeSketch, subtitle, type MemberData } from '../frames-common';
import { kinematicUnknowns, unknownSym, type KinSet } from '../kinematic-unknowns';
import { solveDisplacement, type DispSolution } from '../displacement-solve';
import { gicBlocks } from '../gic';
import { stiffnessStep, state0Step, superpositionStep, systemStep, unitStateStep } from '../displacement-doc';

/** Beyond this many unknowns the document stops being something to read. */
export const DM_MAX_UNKNOWNS = 12;

const AXIAL: MethodOption = { id: 'axial', default: false };
const RELEASED: MethodOption = { id: 'releasedUnknown', default: false };
const P = 'course.kinematics.';

const on = (ctx: MethodContext, o: MethodOption) => ctx.options?.[o.id] ?? o.default;

function read(ctx: MethodContext): { ok: true; ks: KinSet } | { ok: false; reason: ReturnType<typeof tx> } {
  const { pm, input } = ctx;
  const fail = (k: string, p?: Record<string, string | number>) => ({ ok: false as const, reason: tx(k, p) });
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return fail('steps.req.constraints');
  if (pm.members.size === 0) return fail('steps.req.noMembers');
  for (const s of pm.supports.values()) {
    if (s.type === 'inclinedRoller' || (s.type === 'spring' && Math.abs(s.angle ?? 0) > 1e-12)) return fail(`${P}req.inclined`, { n: pm.nodes.get(s.node)!.name });
  }
  if (!ctx.ref) return fail('steps.req.unstable');
  for (const m of pm.members.values()) {
    if (!(m.L > 0) || !(m.EA > 0) || (!m.truss && !(m.EI > 0))) return fail('steps.req.unstable');
  }
  const r = kinematicUnknowns(input, pm, { axial: on(ctx, AXIAL), releasedUnknown: on(ctx, RELEASED) });
  if (!r.ok) return fail(r.key, r.params);
  const n = r.ks.unknowns.length;
  if (n === 0) return fail(`${P}req.noUnknowns`);
  if (n > DM_MAX_UNKNOWNS) return fail(`${P}req.tooMany`, { n, max: DM_MAX_UNKNOWNS });
  return { ok: true, ks: r.ks };
}

function applies(ctx: MethodContext): Applicability {
  const r = read(ctx);
  if (!r.ok) return r;
  const sol = solveDisplacement(r.ks);
  if (!solveDense(sol.K, sol.R0.map((v) => -v))) return { ok: false, reason: tx(`${P}req.mechanism`) };
  return { ok: true };
}

function introBlocks(ctx: MethodContext, sol: DispSolution): Block[] {
  const { ks, md } = sol;
  const withEA = ks.extensible.size > 0;
  const rows: Cell[][] = [...md.values()].map((d) => [
    d.m.name, { tex: num(d.m.L) }, d.m.truss ? '—' : { tex: num(d.m.EI) }, ...(withEA ? [ks.extensible.has(d.m.id) ? { tex: num(d.m.EA) } as Cell : '—'] : []),
  ]);
  const gh = countIndeterminacy(ctx.input).gh;
  return [
    { kind: 'p', text: tx(`${P}dm.intro`) },
    { kind: 'p', text: tx(`${P}dm.introStates`), detail: true },
    { kind: 'p', text: tx('steps.frames.intro.signs') },
    { kind: 'p', text: tx(ks.opts.axial ? `${P}dm.introAxial` : `${P}dm.introRigid`) },
    { kind: 'fig', sketch: loadedSketch(ks.pm), caption: tx('steps.common.structureCaption') },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'L\\ [\\mathrm{m}]' }, { tex: 'EI\\ [\\mathrm{kN\\,m^2}]' }, ...(withEA ? [{ tex: 'EA\\ [\\mathrm{kN}]' } as Cell] : [])], rows, caption: tx(`${P}dm.membersCaption`) },
    { kind: 'p', text: gh > 0 ? tx('steps.frames.intro.indeterminate', { g: gh }) : tx('steps.frames.intro.determinate') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
}

function gicStep(ctx: MethodContext, sol: DispSolution): Step {
  const { ks, md } = sol;
  const b = gicBlocks(ks, countIndeterminacy(ctx.input).gh);
  if (ks.fk && ks.fk.modes.length) {
    b.push({ kind: 'p', text: tx(ks.fk.modes.length === 1 ? 'steps.frames.kin.modesOne' : 'steps.frames.kin.modes', { n: ks.fk.modes.length }) });
    b.push({ kind: 'p', text: tx('steps.frames.kin.psiSign'), detail: true });
    ks.fk.modes.forEach((mode, k) => {
      const rows: Cell[][] = [];
      for (const id of ks.pm.memberOrder) {
        const p = mode.psi.get(id)!;
        if (p === 0) continue;
        const d: MemberData = md.get(id)!;
        rows.push([d.m.name, { tex: `\\psi_{${d.ni}${d.nj}} = ${linTex(0, [p], [deltaSym(k)])}` }]);
      }
      b.push({ kind: 'sub', title: tx('steps.frames.kin.mode', { k: k + 1 }), blocks: [
        { kind: 'fig', sketch: modeSketch(ks.fk!, k), caption: tx(mode.story ? 'steps.frames.kin.storyCaption' : 'steps.frames.kin.modeCaption', { k: k + 1, n: ks.pm.nodes.get(mode.lead)!.name }) },
        ...(rows.length ? [{ kind: 'table' as const, head: [tx('steps.common.member'), { tex: '\\psi' }] as Cell[], rows, caption: tx('steps.frames.kin.psiCaption', { k: k + 1 }) }] : []),
      ] });
    });
  } else if (ks.opts.axial && ks.nDelta) {
    b.push({ kind: 'p', text: tx(`${P}dm.unitTranslations`) });
  }
  return { title: tx(`${P}gic.title`), blocks: b };
}

function displacementRows(ctx: MethodContext, sol: DispSolution): CompareRow[] {
  const ref = ctx.ref!;
  const rows: CompareRow[] = [];
  const { ks } = sol;
  ks.unknowns.forEach((u, k) => {
    if (u.kind === 'rot') {
      const r = ref.displacements.get(u.node);
      if (!u.hinge && r) rows.push({ label: unknownSym(ks, k).tex, method: sol.D[k], matrix: r.ry, unit: 'rad' });
      return;
    }
    const r = ref.displacements.get(u.lead), mine = sol.u.get(u.lead);
    if (!r || !mine) return;
    const nn = ks.pm.nodes.get(u.lead)!.name;
    const p = u.phi.get(u.lead)!;
    const x = u.dir ? u.dir === 'x' : Math.abs(p.x) >= Math.abs(p.z);
    rows.push(x ? { label: `u_{x,${nn}}`, method: mine.x * 1000, matrix: r.ux * 1000, unit: 'mm' } : { label: `u_{z,${nn}}`, method: mine.z * 1000, matrix: r.uz * 1000, unit: 'mm' });
  });
  return rows;
}

function build(ctx: MethodContext): StepDoc {
  const r = read(ctx);
  if (!r.ok) throw new Error(r.reason.key);
  const sol = solveDisplacement(r.ks);
  const steps: Step[] = [
    gicStep(ctx, sol),
    stiffnessStep(sol.ks, sol.md),
    state0Step(sol),
    ...sol.ks.unknowns.map((_, j) => unitStateStep(sol, j)),
    systemStep(sol),
    superpositionStep(sol),
    ...closingSteps(ctx, sol.fk, sol.md, sol.M, displacementRows(ctx, sol), { N: sol.N, springs: sol.springs }),
  ];
  return { method: 'displacement', title: tx('steps.m.displacement.title'), subtitle: subtitle(sol.fk), intro: introBlocks(ctx, sol), steps };
}

export const methods: ExplainedMethod[] = [{ id: 'displacement', group: 'frames', example: 'portal-frame', options: [AXIAL, RELEASED], applies, build }];

/** The solution itself, for tests and for whoever needs the numbers without the document. */
export function displacementSolution(ctx: MethodContext): DispSolution | null {
  const r = read(ctx);
  return r.ok ? solveDisplacement(r.ks) : null;
}
