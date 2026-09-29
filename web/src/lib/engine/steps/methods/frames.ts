/**
 * The "frames" explained step-by-step methods: moment distribution without
 * sway, moment distribution with sway, and slope-deflection.
 *
 * All three read the frame the same way (steps/sway-modes): members keep
 * their length, so the unknowns are the joint rotations and a few joint
 * translations, the sway modes, each with its virtual-work equation. Signs,
 * one convention everywhere: end moments on the member, joint rotations θ
 * and chord rotations ψ are all counter-clockwise positive, so the classical
 * M_ij = FEM_ij + (2EI/L)(2θ_i + θ_j − 3ψ) holds as written. A member end at
 * a node where only that member arrives and nothing holds the rotation has a
 * known moment and is taken with the modified stiffness 3EI/L.
 *
 * This file holds what differs between the methods: the distribution (its
 * stiffnesses, factors, table, stages and superposition) and the
 * slope-deflection equations and system. The opening and closing steps they
 * share are in steps/frames-common.
 */
import type { ExplainedMethod, MethodContext } from '../registry';
import type { Block, Cell, Step, StepDoc, Txt } from '../doc';
import { tx } from '../doc';
import { num, numText, par, term } from '../format';
import { endKey as key, jointLoads, modeWork, restraint, solveDense, type EndSide, type FrameKin } from '../sway-modes';
import {
  UF, UM, allEnds, checkBlocks, type End, closingSteps, deltaSym, displacementRows, femStep, finalTable, introBlocks, kinematicsStep,
  linTex, loadStart, memberData, nodeName, readFrame, subOf, subtitle, thetaSym, Mt, type MemberData,
} from '../frames-common';

/** Distribution cycles: converge to this relative size, never more than MAX_CYCLES, show SHOW_CYCLES. */
const CROSS_TOL = 1e-6;
const MAX_CYCLES = 60;
const SHOW_CYCLES = 8;

// ─── Moment distribution: stiffnesses, factors, the table ───────────────────

/** End moments of an imposed sway (mode k, amplitude Δ) with the joints held: −6EIψ/L, or −3EIψ/L beside a released end. */
function swayStart(fk: FrameKin, md: Map<number, MemberData>, k: number, delta: number): Map<string, number> {
  const M = new Map<string, number>();
  for (const d of md.values()) {
    const psi = fk.modes[k].psi.get(d.m.id)! * delta;
    const r = d.m.EI / d.m.L;
    if (d.kj === 'released') { M.set(key(d.m.id, 'i'), -3 * r * psi); M.set(key(d.m.id, 'j'), 0); }
    else if (d.ki === 'released') { M.set(key(d.m.id, 'j'), -3 * r * psi); M.set(key(d.m.id, 'i'), 0); }
    else { M.set(key(d.m.id, 'i'), -6 * r * psi); M.set(key(d.m.id, 'j'), -6 * r * psi); }
  }
  return M;
}

/** Rotational stiffness of a member end at a joint and its carry-over factor. */
function endStiffness(md: MemberData, e: EndSide): { k: number; co: number; three: boolean } {
  const far = e === 'i' ? md.kj : md.ki;
  const three = far === 'released';
  return { k: ((three ? 3 : 4) * md.m.EI) / md.m.L, co: three ? 0 : 0.5, three };
}

interface Dist {
  ends: End[];
  df: Map<string, number>;
  start: number[];
  bal: number[][];
  co: number[][];
  final: Map<string, number>;
  cycles: number;
  converged: boolean;
}

function distFactors(fk: FrameKin, md: Map<number, MemberData>): Map<string, number> {
  const df = new Map<string, number>();
  const ends = allEnds(fk);
  for (const n of fk.joints) {
    const at = ends.filter((x) => x.node === n);
    const sum = at.reduce((s, x) => s + endStiffness(md.get(x.id)!, x.e).k, 0);
    for (const x of at) df.set(key(x.id, x.e), endStiffness(md.get(x.id)!, x.e).k / sum);
  }
  return df;
}

/**
 * Simultaneous distribution: every cycle balances all rotating joints at once
 * and then carries half of each balance to the far end (none to a released
 * end, whose 3EI/L already assumes it free). Jacobi on the joint stiffness,
 * which converges here: a carry-over is at most half of a balance.
 */
function distribute(fk: FrameKin, md: Map<number, MemberData>, start: Map<string, number>, withCouples: boolean): Dist {
  const ends = allEnds(fk);
  const df = distFactors(fk, md);
  const idx = new Map(ends.map((x, k) => [key(x.id, x.e), k]));
  const cur = ends.map((x) => start.get(key(x.id, x.e)) ?? 0);
  const startArr = cur.slice();
  const C = (n: number) => (withCouples ? fk.couple.get(n) ?? 0 : 0);
  let scale = Math.max(0, ...cur.map(Math.abs));
  for (const n of fk.joints) scale = Math.max(scale, Math.abs(C(n)));
  const bal: number[][] = [], co: number[][] = [];
  let cycles = 0, converged = true;
  if (scale > 0) {
    converged = false;
    for (let c = 0; c < MAX_CYCLES; c++) {
      const b = new Array(ends.length).fill(0);
      let worst = 0;
      for (const n of fk.joints) {
        let U = -C(n);
        ends.forEach((x, k) => { if (x.node === n) U += cur[k]; });
        worst = Math.max(worst, Math.abs(U));
        ends.forEach((x, k) => { if (x.node === n) b[k] = -df.get(key(x.id, x.e))! * U; });
      }
      if (worst <= CROSS_TOL * scale) { converged = true; break; }
      const t = new Array(ends.length).fill(0);
      ends.forEach((x, k) => {
        if (b[k] === 0) return;
        const d = md.get(x.id)!;
        const { co: f } = endStiffness(d, x.e);
        if (f === 0) return;
        t[idx.get(key(x.id, x.e === 'i' ? 'j' : 'i'))!] += f * b[k];
      });
      for (let k = 0; k < ends.length; k++) cur[k] += b[k] + t[k];
      bal.push(b); co.push(t);
      cycles++;
    }
  }
  const final = new Map(ends.map((x, k) => [key(x.id, x.e), cur[k]]));
  return { ends, df, start: startArr, bal, co, final, cycles, converged };
}

function distTable(md: Map<number, MemberData>, d: Dist, caption: Txt): Block[] {
  const head: Cell[] = [tx('steps.frames.cross.rowHead'), ...d.ends.map((x) => ({ tex: Mt(md.get(x.id)!, x.e) }))];
  const cell = (v: number) => (Math.abs(v) < 1e-12 ? '' : numText(v));
  const rows: Cell[][] = [];
  rows.push([tx('steps.frames.cross.rowDF'), ...d.ends.map((x) => { const v = d.df.get(key(x.id, x.e)); return v === undefined ? '' : numText(v); })]);
  rows.push([tx('steps.frames.cross.rowFEM'), ...d.start.map((v) => numText(v))]);
  const shown = Math.min(d.cycles, SHOW_CYCLES);
  for (let c = 0; c < shown; c++) {
    rows.push([tx('steps.frames.cross.rowBal', { n: c + 1 }), ...d.bal[c].map(cell)]);
    rows.push([tx('steps.frames.cross.rowCO', { n: c + 1 }), ...d.co[c].map(cell)]);
  }
  if (d.cycles > shown) rows.push(['…', ...d.ends.map(() => '…')]);
  rows.push([tx('steps.frames.cross.rowFinal'), ...d.ends.map((x) => numText(d.final.get(key(x.id, x.e))!))]);
  const out: Block[] = [{ kind: 'table', head, rows, caption }];
  if (d.cycles === 0) out.push({ kind: 'note', tone: 'info', text: tx('steps.frames.cross.noCycles') });
  else if (!d.converged) out.push({ kind: 'note', tone: 'warn', text: tx('steps.frames.cross.notConverged', { n: d.cycles }) });
  else out.push({ kind: 'note', tone: 'ok', text: tx(d.cycles > shown ? 'steps.frames.cross.cyclesMore' : 'steps.frames.cross.cycles', { n: d.cycles, shown }) });
  return out;
}


function restraintTex(fk: FrameKin, M: Map<string, number>, k: number, W: number, sym: string): Block {
  const terms: string[] = [];
  for (const [id, p] of fk.modes[k].psi) {
    if (p === 0) continue;
    terms.push(`${par(p)}\\big(${par(M.get(key(id, 'i'))!)} + ${par(M.get(key(id, 'j'))!)}\\big)`);
  }
  const R = restraint(fk, M, k, W);
  return {
    kind: 'calc', label: tx('steps.frames.sway.restraintLabel', { k: k + 1 }),
    formula: `${sym} = -\\sum \\psi_{ij,${k + 1}}\\,(M_{ij} + M_{ji}) - W_{${k + 1}}`,
    subst: `${sym} = -\\big[${terms.join(' + ') || '0'}\\big]${Math.abs(W) > 1e-12 ? ` ${term(-W)}` : ''}`,
    result: `\\boxed{${sym} = ${num(R)}\\ ${UF}}`,
  };
}


function stiffnessStep(fk: FrameKin, md: Map<number, MemberData>): Step {
  const b: Block[] = [{ kind: 'p', text: tx('steps.frames.cross.stiffIntro') }, { kind: 'p', text: tx('steps.frames.cross.stiffWhy'), detail: true }];
  const ends = allEnds(fk);
  const df = distFactors(fk, md);
  for (const n of fk.joints) {
    const at = ends.filter((x) => x.node === n);
    const blocks: Block[] = [];
    let sum = 0;
    for (const x of at) {
      const d = md.get(x.id)!;
      const s = endStiffness(d, x.e);
      sum += s.k;
      const c = s.three ? 3 : 4;
      blocks.push({
        kind: 'calc', label: tx(s.three ? 'steps.frames.cross.k3' : 'steps.frames.cross.k4', { m: d.m.name }),
        formula: `k_{${subOf(d, x.e)}} = \\frac{${c}EI}{L}`,
        subst: `k_{${subOf(d, x.e)}} = \\frac{${c}\\cdot(${num(d.m.EI)})}{${num(d.m.L)}}`,
        result: `\\boxed{k_{${subOf(d, x.e)}} = ${num(s.k)}\\ ${UM}}`,
      });
    }
    const nn = nodeName(fk, n);
    const sums = at.map((x) => num(endStiffness(md.get(x.id)!, x.e).k)).join(' + ');
    blocks.push({
      kind: 'calc', label: tx('steps.frames.cross.df', { n: nn }),
      formula: `d_{${nn}i} = \\frac{k_{${nn}i}}{\\sum k_{${nn}}}, \\qquad \\sum k_{${nn}} = ${sums} = ${num(sum)}\\ ${UM}`,
      subst: at.map((x) => `d_{${subOf(md.get(x.id)!, x.e)}} = \\frac{${num(endStiffness(md.get(x.id)!, x.e).k)}}{${num(sum)}}`).join(', \\quad '),
      result: at.map((x) => `\\boxed{d_{${subOf(md.get(x.id)!, x.e)}} = ${num(df.get(key(x.id, x.e))!)}}`).join(', \\quad '),
      check: `\\sum d = ${at.map((x) => num(df.get(key(x.id, x.e))!)).join(' + ')} = ${num(at.reduce((s, x) => s + df.get(key(x.id, x.e))!, 0))}\\ \\checkmark`,
    });
    b.push({ kind: 'sub', title: tx('steps.frames.jointN', { n: nn }), blocks });
  }
  return { title: tx('steps.frames.cross.stiffTitle'), blocks: b };
}


// ─── Moment distribution without sway ───────────────────────────────────────

function buildCrossNoSway(ctx: MethodContext): StepDoc {
  const r = readFrame(ctx);
  if (!r.ok) throw new Error(r.reason.key);
  const fk = r.fk;
  const md = memberData(fk);
  const F = jointLoads(fk, md.values());
  const dist = distribute(fk, md, loadStart(fk, md), true);
  const steps: Step[] = [
    kinematicsStep(fk, md, F),
    stiffnessStep(fk, md),
    femStep(fk, md),
    { title: tx('steps.frames.cross.distTitle'), blocks: [
      { kind: 'p', text: tx('steps.frames.cross.distIntro') },
      { kind: 'p', text: tx('steps.frames.cross.distWhy'), detail: true },
      ...distTable(md, dist, tx('steps.frames.cross.tableCaption')),
    ] },
    { title: tx('steps.frames.final.title'), blocks: [finalTable(md, dist.final), { kind: 'p', text: tx('steps.frames.final.checks') }, ...checkBlocks(fk, md, dist.final, F)] },
    ...closingSteps(ctx, fk, md, dist.final, []),
  ];
  return { method: 'crossNoSway', title: tx('steps.m.crossNoSway.title'), subtitle: subtitle(fk), intro: introBlocks(ctx, fk, md, 'crossNoSway'), steps };
}

// ─── Moment distribution with sway ──────────────────────────────────────────

/** A round imposed sway: the largest fixed-end moment it causes is 100 kN·m. */
function roundSway(fk: FrameKin, md: Map<number, MemberData>, k: number): number {
  const unit = swayStart(fk, md, k, 1);
  const big = Math.max(...[...unit.values()].map(Math.abs));
  return 100 / big;
}

function buildCrossSway(ctx: MethodContext): StepDoc {
  const r = readFrame(ctx);
  if (!r.ok) throw new Error(r.reason.key);
  const fk = r.fk;
  const md = memberData(fk);
  const F = jointLoads(fk, md.values());
  const nm = fk.modes.length;
  const W = fk.modes.map((_, k) => modeWork(fk, F, k));

  // Stage A: the loads with every mode held.
  const A = distribute(fk, md, loadStart(fk, md), true);
  const RA = fk.modes.map((_, k) => restraint(fk, A.final, k, W[k]));
  const stageA: Step = { title: tx('steps.frames.sway.stageATitle'), blocks: [
    { kind: 'p', text: tx('steps.frames.sway.stageAIntro') },
    { kind: 'p', text: tx('steps.frames.cross.distWhy'), detail: true },
    ...distTable(md, A, tx('steps.frames.sway.tableA')),
    { kind: 'p', text: tx('steps.frames.sway.restraintIntro'), detail: true },
    ...fk.modes.map((_, k) => restraintTex(fk, A.final, k, W[k], `R^{A}_{${k + 1}}`)),
  ] };

  // Stage B: each mode imposed alone, joints free to rotate, no loads.
  const d0 = fk.modes.map((_, k) => roundSway(fk, md, k));
  const B = fk.modes.map((_, m) => distribute(fk, md, swayStart(fk, md, m, d0[m]), false));
  const RB = B.map((b) => fk.modes.map((_, k) => restraint(fk, b.final, k, 0)));
  const stagesB: Step[] = fk.modes.map((mode, m) => {
    const start = swayStart(fk, md, m, d0[m]);
    const blocks: Block[] = [
      { kind: 'p', text: tx('steps.frames.sway.stageBIntro', { m: m + 1 }) },
      { kind: 'calc', label: tx('steps.frames.sway.deltaLabel', { m: m + 1 }),
        formula: `\\Delta^{\\circ}_{${m + 1}} = \\frac{100\\ ${UM}}{\\max\\left|\\mathrm{FEM}(\\Delta_{${m + 1}} = 1)\\right|}`,
        subst: `\\Delta^{\\circ}_{${m + 1}} = \\frac{100}{${num(100 / d0[m])}}`,
        result: `\\boxed{\\Delta^{\\circ}_{${m + 1}} = ${num(d0[m])}\\ \\mathrm{m} = ${num(d0[m] * 1000)}\\ \\mathrm{mm}}` },
      { kind: 'p', text: tx('steps.frames.sway.deltaWhy'), detail: true },
    ];
    for (const d of md.values()) {
      const p = mode.psi.get(d.m.id)!;
      if (p === 0) continue;
      const psi = p * d0[m];
      const si = subOf(d, 'i'), sj = subOf(d, 'j');
      const rel = d.kj === 'released' ? 'j' : d.ki === 'released' ? 'i' : null;
      const psiTex = `\\psi_{${d.ni}${d.nj}} = ${par(p)}\\,\\Delta^{\\circ}_{${m + 1}} = ${num(psi)}`;
      if (!rel) blocks.push({ kind: 'calc', label: tx('steps.frames.sway.femLabel', { m: d.m.name }),
        formula: `\\mathrm{FEM}_{${si}} = \\mathrm{FEM}_{${sj}} = -\\frac{6EI\\,\\psi_{${d.ni}${d.nj}}}{L}`,
        subst: `${psiTex}, \\qquad \\mathrm{FEM} = -\\frac{6\\cdot(${num(d.m.EI)})${par(psi)}}{${num(d.m.L)}}`,
        result: `\\boxed{\\mathrm{FEM}_{${si}} = \\mathrm{FEM}_{${sj}} = ${num(start.get(key(d.m.id, 'i'))!)}\\ ${UM}}` });
      else {
        const near: EndSide = rel === 'j' ? 'i' : 'j';
        const sn = subOf(d, near);
        blocks.push({ kind: 'calc', label: tx('steps.frames.sway.femLabel3', { m: d.m.name }),
          formula: `\\mathrm{FEM}_{${sn}} = -\\frac{3EI\\,\\psi_{${d.ni}${d.nj}}}{L}`,
          subst: `${psiTex}, \\qquad \\mathrm{FEM}_{${sn}} = -\\frac{3\\cdot(${num(d.m.EI)})${par(psi)}}{${num(d.m.L)}}`,
          result: `\\boxed{\\mathrm{FEM}_{${sn}} = ${num(start.get(key(d.m.id, near))!)}\\ ${UM}}` });
      }
    }
    blocks.push(...distTable(md, B[m], tx('steps.frames.sway.tableB', { m: m + 1 })));
    blocks.push(...fk.modes.map((_, k) => restraintTex(fk, B[m].final, k, 0, `R^{(${m + 1})}_{${k + 1}}`)));
    return { title: tx('steps.frames.sway.stageBTitle', { m: m + 1 }), blocks };
  });

  // Superposition: the restraints must vanish.
  const Kc = fk.modes.map((_, k) => fk.modes.map((__, m) => RB[m][k]));
  const c = solveDense(Kc, RA.map((v) => -v)) ?? new Array(nm).fill(0);
  const M = new Map<string, number>();
  for (const [kk, v] of A.final) M.set(kk, v + B.reduce((s, b, m) => s + c[m] * b.final.get(kk)!, 0));
  const eqs = fk.modes.map((_, k) => `${fk.modes.map((__, m) => `${par(RB[m][k])}\\,c_{${m + 1}}`).join(' + ')} = ${num(-RA[k])}`);
  const head: Cell[] = [tx('steps.frames.head.end'), { tex: 'M^{A}' }, ...fk.modes.map((_, m) => ({ tex: `c_{${m + 1}}\\,M^{(${m + 1})}` })), { tex: 'M' }];
  const rows: Cell[][] = A.ends.map((x) => {
    const kk = key(x.id, x.e);
    return [{ tex: Mt(md.get(x.id)!, x.e) }, numText(A.final.get(kk)!), ...B.map((b, m) => numText(c[m] * b.final.get(kk)!)), numText(M.get(kk)!)];
  });
  const superpose: Step = { title: tx('steps.frames.sway.superTitle'), blocks: [
    { kind: 'p', text: tx('steps.frames.sway.superIntro') },
    { kind: 'eq', tex: `R^{A}_{k} + \\sum_{m} c_m\\,R^{(m)}_{k} = 0` },
    { kind: 'matrix', name: '\\mathbf{R}', rows: Kc, rowLabels: fk.modes.map((_, k) => String(k + 1)), colLabels: fk.modes.map((_, m) => `c${m + 1}`), caption: tx('steps.frames.sway.matrixCaption') },
    { kind: 'calc', label: tx('steps.frames.sway.solve'),
      formula: `\\sum_{m} c_m\\,R^{(m)}_{k} = -R^{A}_{k}`,
      subst: nm === 1 ? eqs[0] : `\\begin{aligned} ${eqs.join(' \\\\ ')} \\end{aligned}`,
      result: c.map((v, m) => `\\boxed{c_{${m + 1}} = ${num(v)}}`).join(', \\quad ') },
    { kind: 'calc', label: tx('steps.frames.sway.drift'),
      formula: `\\Delta_m = c_m\\,\\Delta^{\\circ}_m`,
      subst: c.map((v, m) => `\\Delta_{${m + 1}} = ${par(v)}\\cdot(${num(d0[m] * 1000)})`).join(', \\quad '),
      result: c.map((v, m) => `\\boxed{\\Delta_{${m + 1}} = ${num(v * d0[m] * 1000)}\\ \\mathrm{mm}}`).join(', \\quad ') },
    { kind: 'eq', tex: `M_{ij} = M^{A}_{ij} + \\sum_{m} c_m\\,M^{(m)}_{ij}` },
    { kind: 'table', head, rows, caption: tx('steps.frames.sway.finalCaption') },
    { kind: 'p', text: tx('steps.frames.final.checks') },
    ...checkBlocks(fk, md, M, F),
  ] };

  const steps: Step[] = [
    kinematicsStep(fk, md, F),
    stiffnessStep(fk, md),
    femStep(fk, md),
    stageA,
    ...stagesB,
    superpose,
    ...closingSteps(ctx, fk, md, M, displacementRows(fk, ctx, null, c.map((v, m) => v * d0[m]))),
  ];
  return { method: 'crossSway', title: tx('steps.m.crossSway.title'), subtitle: subtitle(fk), intro: introBlocks(ctx, fk, md, 'crossSway'), steps };
}

// ─── Slope-deflection ───────────────────────────────────────────────────────

/** An end moment as c0 + Σ a·x over the unknowns [θ of each joint, Δ of each mode]. */
interface Lin { c0: number; a: number[] }

function buildSlopeDeflection(ctx: MethodContext): StepDoc {
  const r = readFrame(ctx);
  if (!r.ok) throw new Error(r.reason.key);
  const fk = r.fk;
  const md = memberData(fk);
  const F = jointLoads(fk, md.values());
  const nj = fk.joints.length, nm = fk.modes.length, nu = nj + nm;
  const jIdx = new Map(fk.joints.map((n, k) => [n, k]));
  const syms = [...fk.joints.map((n) => thetaSym(fk, n)), ...fk.modes.map((_, k) => deltaSym(k))];
  const plain = [...fk.joints.map((n) => `θ${nodeName(fk, n)}`), ...fk.modes.map((_, k) => `Δ${k + 1}`)];
  const start = loadStart(fk, md);
  const lin = new Map<string, Lin>();
  const memberBlocks: Block[] = [];

  for (const d of md.values()) {
    const id = d.m.id;
    const r2 = (2 * d.m.EI) / d.m.L, r3 = (3 * d.m.EI) / d.m.L;
    const psiA = fk.modes.map((mode) => mode.psi.get(id)!);
    const sway = psiA.some((p) => p !== 0);
    const psiT = `\\psi_{${d.ni}${d.nj}}`;
    // A fixed end's rotation is written as 0, so the substitution reads 2·0 + θ_B.
    const th = (n: number) => (jIdx.has(n) ? thetaSym(fk, n) : '0');
    const th2 = (n: number) => (jIdx.has(n) ? `2${thetaSym(fk, n)}` : '2 \\cdot 0');
    const blocks: Block[] = [];
    if (sway) blocks.push({ kind: 'eq', tex: `${psiT} = ${linTex(0, [...new Array(nj).fill(0), ...psiA], syms)}` });
    const rel: EndSide | null = d.kj === 'released' ? 'j' : d.ki === 'released' ? 'i' : null;
    if (!rel) {
      const mk = (e: EndSide): Lin => {
        const a = new Array(nu).fill(0);
        const near = e === 'i' ? d.m.i : d.m.j, far = e === 'i' ? d.m.j : d.m.i;
        if (jIdx.has(near)) a[jIdx.get(near)!] += 2 * r2;
        if (jIdx.has(far)) a[jIdx.get(far)!] += r2;
        psiA.forEach((p, k) => { a[nj + k] += -3 * r2 * p; });
        return { c0: e === 'i' ? d.fe.Mi : d.fe.Mj, a };
      };
      const li = mk('i'), lj = mk('j');
      lin.set(key(id, 'i'), li); lin.set(key(id, 'j'), lj);
      const si = subOf(d, 'i'), sj = subOf(d, 'j');
      const ps = sway ? ` - 3${psiT}` : '';
      const formula = `\\begin{aligned} M_{${si}} &= \\mathrm{FEM}_{${si}} + \\frac{2EI}{L}\\big(2\\theta_{${d.ni}} + \\theta_{${d.nj}}${ps}\\big) \\\\ M_{${sj}} &= \\mathrm{FEM}_{${sj}} + \\frac{2EI}{L}\\big(2\\theta_{${d.nj}} + \\theta_{${d.ni}}${ps}\\big) \\end{aligned}`;
      const subst = `\\begin{aligned} M_{${si}} &= ${num(d.fe.Mi)} + \\frac{2\\cdot(${num(d.m.EI)})}{${num(d.m.L)}}\\big(${th2(d.m.i)} + ${th(d.m.j)}${ps}\\big) \\\\ M_{${sj}} &= ${num(d.fe.Mj)} + \\frac{2\\cdot(${num(d.m.EI)})}{${num(d.m.L)}}\\big(${th2(d.m.j)} + ${th(d.m.i)}${ps}\\big) \\end{aligned}`;
      blocks.push({ kind: 'calc', label: tx('steps.frames.sd.memberLabel'), formula, subst,
        result: `\\begin{aligned} &\\boxed{M_{${si}} = ${linTex(li.c0, li.a, syms)}} \\\\ &\\boxed{M_{${sj}} = ${linTex(lj.c0, lj.a, syms)}} \\end{aligned}` });
    } else {
      const near: EndSide = rel === 'j' ? 'i' : 'j';
      const nearNode = near === 'i' ? d.m.i : d.m.j, farNode = near === 'i' ? d.m.j : d.m.i;
      const a = new Array(nu).fill(0);
      if (jIdx.has(nearNode)) a[jIdx.get(nearNode)!] += r3;
      psiA.forEach((p, k) => { a[nj + k] += -r3 * p; });
      const c0 = start.get(key(id, near))!;
      const C = fk.couple.get(farNode) ?? 0;
      lin.set(key(id, near), { c0, a });
      lin.set(key(id, rel), { c0: C, a: new Array(nu).fill(0) });
      const sn = subOf(d, near), sf = subOf(d, rel);
      const nn = nodeName(fk, nearNode), fn = nodeName(fk, farNode);
      const ps = sway ? ` - ${psiT}` : '';
      blocks.push({ kind: 'calc', label: tx('steps.frames.sd.memberLabel3', { n: fn }),
        formula: `M_{${sn}} = \\mathrm{FEM}^{*}_{${sn}} + \\frac{3EI}{L}\\big(\\theta_{${nn}}${ps}\\big), \\qquad M_{${sf}} = C_{${fn}}`,
        subst: `M_{${sn}} = ${num(c0)} + \\frac{3\\cdot(${num(d.m.EI)})}{${num(d.m.L)}}\\big(${th(nearNode)}${ps}\\big), \\qquad M_{${sf}} = ${num(C)}`,
        result: `\\boxed{M_{${sn}} = ${linTex(c0, a, syms)}}, \\qquad \\boxed{M_{${sf}} = ${num(C)}}` });
    }
    memberBlocks.push({ kind: 'sub', title: tx('steps.frames.memberN', { m: d.m.name }), blocks });
  }

  // Equations: moment equilibrium of each joint, one sway equation per mode.
  const K: number[][] = [], rhs: number[] = [];
  const eqBlocks: Block[] = [];
  const ends = allEnds(fk);
  const lt = (l: Lin) => `\\big(${linTex(l.c0, l.a, syms)}\\big)`;
  for (const n of fk.joints) {
    const at = ends.filter((x) => x.node === n);
    const nn = nodeName(fk, n);
    const C = fk.couple.get(n) ?? 0;
    const row = new Array(nu).fill(0);
    let c0 = 0;
    for (const x of at) { const l = lin.get(key(x.id, x.e))!; c0 += l.c0; l.a.forEach((v, k) => { row[k] += v; }); }
    K.push(row); rhs.push(C - c0);
    eqBlocks.push({ kind: 'calc', label: tx('steps.frames.sd.jointEq', { n: nn }),
      formula: `${at.map((x) => Mt(md.get(x.id)!, x.e)).join(' + ')} = C_{${nn}}`,
      subst: `${at.map((x) => lt(lin.get(key(x.id, x.e))!)).join(' + ')} = ${num(C)}`,
      result: `\\boxed{${linTex(0, row, syms)} = ${num(C - c0)}}` });
  }
  fk.modes.forEach((mode, k) => {
    const W = modeWork(fk, F, k);
    const row = new Array(nu).fill(0);
    let c0 = 0;
    const terms: string[] = [];
    for (const [id, p] of mode.psi) {
      if (p === 0) continue;
      const li = lin.get(key(id, 'i'))!, lj = lin.get(key(id, 'j'))!;
      c0 += -p * (li.c0 + lj.c0);
      li.a.forEach((v, q) => { row[q] += -p * (v + lj.a[q]); });
      terms.push(`${par(p)}\\big[${lt(li)} + ${lt(lj)}\\big]`);
    }
    K.push(row); rhs.push(W - c0);
    eqBlocks.push({ kind: 'calc', label: tx('steps.frames.sd.swayEq', { k: k + 1 }),
      formula: `-\\sum \\psi_{ij,${k + 1}}\\,(M_{ij} + M_{ji}) = W_{${k + 1}}`,
      subst: `-\\Big\\{${terms.join(' + ')}\\Big\\} = ${num(W)}`,
      result: `\\boxed{${linTex(0, row, syms)} = ${num(W - c0)}}` });
  });

  const x = solveDense(K, rhs) ?? new Array(nu).fill(0);
  const resid = K.reduce((s, row, q) => Math.max(s, Math.abs(row.reduce((t, v, k) => t + v * x[k], 0) - rhs[q])), 0);
  const M = new Map<string, number>();
  for (const [kk, l] of lin) M.set(kk, l.c0 + l.a.reduce((s, v, k) => s + v * x[k], 0));
  const theta = new Map(fk.joints.map((n, k) => [n, x[k]]));
  const values = (k: number) => (k < nj ? `${syms[k]} = ${num(x[k])}\\ \\mathrm{rad}` : `${syms[k]} = ${num(x[k])}\\ \\mathrm{m} = ${num(x[k] * 1000)}\\ \\mathrm{mm}`);

  const backBlocks: Block[] = [];
  for (const d of md.values()) {
    const res: string[] = [], sub: string[] = [], frm: string[] = [];
    for (const e of ['i', 'j'] as EndSide[]) {
      const l = lin.get(key(d.m.id, e))!;
      const s = subOf(d, e);
      frm.push(`M_{${s}} = ${linTex(l.c0, l.a, syms)}`);
      const pieces = [num(l.c0), ...l.a.map((v, k) => (Math.abs(v) > 0 ? `${par(v)}\\cdot(${num(x[k])})` : '')).filter(Boolean)];
      sub.push(`M_{${s}} &= ${pieces.join(' + ')}`);
      res.push(`\\boxed{M_{${s}} = ${num(M.get(key(d.m.id, e))!)}\\ ${UM}}`);
    }
    backBlocks.push({ kind: 'calc', label: tx('steps.frames.memberN', { m: d.m.name }),
      formula: frm.join(', \\qquad '), subst: `\\begin{aligned} ${sub.join(' \\\\ ')} \\end{aligned}`, result: res.join(', \\qquad ') });
  }

  const steps: Step[] = [
    kinematicsStep(fk, md, F),
    femStep(fk, md),
    { title: tx('steps.frames.sd.eqTitle'), blocks: [
      { kind: 'p', text: tx('steps.frames.sd.eqIntro') },
      { kind: 'eq', tex: 'M_{ij} = \\mathrm{FEM}_{ij} + \\frac{2EI}{L}\\left(2\\theta_i + \\theta_j - 3\\psi_{ij}\\right)', note: tx('steps.frames.sd.eqNote') },
      { kind: 'p', text: tx('steps.frames.sd.eqWhy'), detail: true },
      ...(fk.released.length ? [
        { kind: 'eq' as const, tex: 'M_{ij} = \\mathrm{FEM}^{*}_{ij} + \\frac{3EI}{L}\\left(\\theta_i - \\psi_{ij}\\right)', note: tx('steps.frames.sd.eq3Note') },
      ] : []),
      ...memberBlocks,
    ] },
    { title: tx('steps.frames.sd.equilTitle'), blocks: [
      { kind: 'p', text: tx('steps.frames.sd.equilIntro', { j: nj, m: nm }) },
      ...eqBlocks,
    ] },
    { title: tx('steps.frames.sd.systemTitle'), blocks: [
      { kind: 'p', text: tx('steps.frames.sd.systemIntro', { n: nu }) },
      { kind: 'matrix', name: '\\mathbf{K}', rows: K, rowLabels: [...fk.joints.map((n) => nodeName(fk, n)), ...fk.modes.map((_, k) => `Δ${k + 1}`)], colLabels: plain, caption: tx('steps.frames.sd.matrixCaption') },
      { kind: 'matrix', name: '\\mathbf{b}', rows: rhs.map((v) => [v]), rowLabels: [...fk.joints.map((n) => nodeName(fk, n)), ...fk.modes.map((_, k) => `Δ${k + 1}`)], caption: tx('steps.frames.sd.rhsCaption') },
      { kind: 'calc', label: tx('steps.frames.sd.solve'),
        formula: '\\mathbf{K}\\,\\mathbf{x} = \\mathbf{b}',
        subst: `\\mathbf{x} = \\mathbf{K}^{-1}\\mathbf{b}, \\qquad \\mathbf{x} = (${syms.join(',\\ ')})`,
        result: `\\begin{aligned} ${x.map((_, k) => `&\\boxed{${values(k)}}`).join(' \\\\ ')} \\end{aligned}`,
        check: `\\max\\left|\\mathbf{K}\\mathbf{x} - \\mathbf{b}\\right| = ${num(resid)}\\ \\checkmark` },
      { kind: 'p', text: tx('steps.frames.sd.solveWhy'), detail: true },
    ] },
    { title: tx('steps.frames.sd.backTitle'), blocks: [
      { kind: 'p', text: tx('steps.frames.sd.backIntro') },
      ...backBlocks,
      finalTable(md, M),
      { kind: 'p', text: tx('steps.frames.final.checks') },
      ...checkBlocks(fk, md, M, F),
    ] },
    ...closingSteps(ctx, fk, md, M, displacementRows(fk, ctx, theta, x.slice(nj))),
  ];
  return { method: 'slopeDeflection', title: tx('steps.m.slopeDeflection.title'), subtitle: subtitle(fk), intro: introBlocks(ctx, fk, md, 'slopeDeflection'), steps };
}

export const methods: ExplainedMethod[] = [
  {
    id: 'crossNoSway', group: 'frames', example: 'portal-frame-braced',
    applies: (ctx) => {
      const r = readFrame(ctx);
      if (!r.ok) return r;
      if (r.fk.modes.length > 0) return { ok: false, reason: tx('steps.frames.req.hasSway', { n: r.fk.modes.length }) };
      return { ok: true };
    },
    build: buildCrossNoSway,
  },
  {
    id: 'crossSway', group: 'frames', example: 'portal-frame',
    applies: (ctx) => {
      const r = readFrame(ctx);
      if (!r.ok) return r;
      if (r.fk.modes.length === 0) return { ok: false, reason: tx('steps.frames.req.noSway') };
      return { ok: true };
    },
    build: buildCrossSway,
  },
  {
    id: 'slopeDeflection', group: 'frames', example: 'portal-frame',
    applies: (ctx) => {
      const r = readFrame(ctx);
      return r.ok ? { ok: true } : r;
    },
    build: buildSlopeDeflection,
  },
];
