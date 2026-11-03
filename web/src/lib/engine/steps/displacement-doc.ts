/**
 * The steps of the displacement method document that are its own: the
 * members' stiffness coefficients, estado 0, one estado per unknown, the
 * equilibrium system and the superposition. The numbers come from
 * displacement-solve; the opening (GIC) and closing steps are shared.
 */
import type { Block, Cell, Step } from './doc';
import { tx } from './doc';
import { num, numText, par, settle } from './format';
import { endKey as key, type EndSide } from './sway-modes';
import { fixedEndBlocks } from './fem';
import { sketchOf, type Sketch } from './sketch';
import { UF, UM, Mt, extent, subOf, type MemberData } from './frames-common';
import type { KinSet } from './kinematic-unknowns';
import { transOf, unknownSym } from './kinematic-unknowns';
import { axialFixedEnd, released, type DispSolution, type MAct, type MKin } from './displacement-solve';

const P = 'course.kinematics.dm.';
const tiny = (v: number) => Math.abs(v) < 1e-12;

/** What kind of bending member it is in this method: both ends turning with joints, one end released, or none bending. */
function shape(ks: KinSet, d: MemberData): 'full' | 'i' | 'j' | 'none' {
  const ri = released(ks, d.m.id, 'i'), rj = released(ks, d.m.id, 'j');
  if (d.m.truss || (ri && rj)) return 'none';
  return rj ? 'j' : ri ? 'i' : 'full';
}

export function stiffnessStep(ks: KinSet, md: Map<number, MemberData>): Step {
  const b: Block[] = [{ kind: 'p', text: tx(`${P}stiff.intro`) }];
  const full: Cell[][] = [], three: Cell[][] = [], axial: Cell[][] = [];
  for (const d of md.values()) {
    const { EI, EA, L } = d.m;
    const sh = shape(ks, d);
    if (sh === 'full') full.push([d.m.name, { tex: num((4 * EI) / L) }, { tex: num((2 * EI) / L) }, { tex: num((6 * EI) / L ** 2) }, { tex: num((12 * EI) / L ** 3) }]);
    else if (sh !== 'none') three.push([d.m.name, tx(`${P}stiff.releasedAt`, { n: sh === 'j' ? d.nj : d.ni }), { tex: num((3 * EI) / L) }, { tex: num((3 * EI) / L ** 2) }, { tex: num((3 * EI) / L ** 3) }]);
    if (ks.extensible.has(d.m.id)) axial.push([d.m.name, { tex: num(EA) }, { tex: num(EA / L) }]);
  }
  if (full.length) {
    b.push({ kind: 'eq', tex: 'M_{ij} = \\frac{4EI}{L}\\,\\theta_i + \\frac{2EI}{L}\\,\\theta_j - \\frac{6EI}{L^2}\\,\\Delta_{\\perp}, \\qquad V = \\frac{12EI}{L^3}\\,\\Delta_{\\perp}', note: tx(`${P}stiff.fullNote`) });
    b.push({ kind: 'table', head: [tx('steps.common.member'), { tex: '4EI/L' }, { tex: '2EI/L' }, { tex: '6EI/L^2' }, { tex: '12EI/L^3' }], rows: full, caption: tx(`${P}stiff.fullCaption`) });
  }
  if (three.length) {
    b.push({ kind: 'eq', tex: 'M_{ij} = \\frac{3EI}{L}\\,\\theta_i - \\frac{3EI}{L^2}\\,\\Delta_{\\perp}, \\qquad M_{ji} = 0, \\qquad V = \\frac{3EI}{L^3}\\,\\Delta_{\\perp}', note: tx(`${P}stiff.threeNote`) });
    b.push({ kind: 'p', text: tx(`${P}stiff.threeWhy`), detail: true });
    b.push({ kind: 'table', head: [tx('steps.common.member'), tx(`${P}stiff.released`), { tex: '3EI/L' }, { tex: '3EI/L^2' }, { tex: '3EI/L^3' }], rows: three, caption: tx(`${P}stiff.threeCaption`) });
  }
  if (axial.length) {
    b.push({ kind: 'eq', tex: 'N = \\frac{EA}{L}\\,e', note: tx(`${P}stiff.axialNote`) });
    b.push({ kind: 'table', head: [tx('steps.common.member'), { tex: 'EA\\ [\\mathrm{kN}]' }, { tex: 'EA/L\\ [\\mathrm{kN/m}]' }], rows: axial, caption: tx(ks.opts.axial ? `${P}stiff.axialCaption` : `${P}stiff.bielaCaption`) });
  }
  if (ks.springs.length) {
    const rows: Cell[][] = ks.springs.map((s) => [ks.pm.nodes.get(s.node)!.name, { tex: s.dir === 'r' ? 'k_{\\theta}' : `k_${s.dir}` }, { tex: `${num(s.k)}\\ ${s.dir === 'r' ? '\\mathrm{kN\\,m/rad}' : '\\mathrm{kN/m}'}` }]);
    b.push({ kind: 'table', head: [tx('steps.common.node'), tx(`${P}stiff.springDir`), tx(`${P}stiff.springK`)], rows, caption: tx(`${P}stiff.springCaption`) });
  }
  b.push({ kind: 'p', text: tx(`${P}stiff.why`), detail: true });
  return { title: tx(`${P}stiff.title`), blocks: b };
}

/** One member's end actions in a state, written from its coefficients: the slope-deflection equation with the terms that are not zero. */
function memberCalc(ks: KinSet, d: MemberData, k: MKin, a: MAct, base: { Mi: number; Mj: number } | null): Block[] {
  const out: Block[] = [];
  const { EI, L } = d.m;
  const si = subOf(d, 'i'), sj = subOf(d, 'j');
  const sh = shape(ks, d);
  const th = (e: EndSide) => (e === 'i' ? k.thi : k.thj);
  const bending = sh !== 'none' && (!tiny(k.thi) || !tiny(k.thj) || !tiny(k.psi));
  if (bending) {
    const pre = (b: number) => (base && !tiny(b) ? `${num(b)} + ` : '');
    const preF = (s: string) => (base ? `M^{*}_{${s}} + ` : '');
    if (sh === 'full') {
      const one = (e: EndSide) => {
        const o: EndSide = e === 'i' ? 'j' : 'i';
        const s = e === 'i' ? si : sj;
        const f = `${preF(s)}\\frac{4EI}{L}\\,\\theta_{${e === 'i' ? d.ni : d.nj}} + \\frac{2EI}{L}\\,\\theta_{${o === 'i' ? d.ni : d.nj}} - \\frac{6EI}{L}\\,\\psi`;
        const terms: string[] = [];
        if (!tiny(th(e))) terms.push(`${num((4 * EI) / L)}\\cdot${par(th(e))}`);
        if (!tiny(th(o))) terms.push(`${num((2 * EI) / L)}\\cdot${par(th(o))}`);
        if (!tiny(k.psi)) terms.push(`- ${num((6 * EI) / L)}\\cdot${par(k.psi)}`);
        return { f: `M_{${s}} &= ${f}`, s: `M_{${s}} &= ${pre(base ? (e === 'i' ? base.Mi : base.Mj) : 0)}${terms.join(' + ').replace(/\+ -/g, '-') || '0'}`, r: `M_{${s}} = ${num(e === 'i' ? a.Mi : a.Mj)}\\ ${UM}` };
      };
      const x = one('i'), y = one('j');
      out.push({ kind: 'calc', label: tx(`${P}state.memberFull`, { m: d.m.name }),
        formula: `\\begin{aligned} ${x.f} \\\\ ${y.f} \\end{aligned}`, subst: `\\begin{aligned} ${x.s} \\\\ ${y.s} \\end{aligned}`,
        result: `\\boxed{${x.r}}, \\qquad \\boxed{${y.r}}` });
    } else {
      const near: EndSide = sh === 'j' ? 'i' : 'j', far: EndSide = sh;
      const sn = near === 'i' ? si : sj, sf = far === 'i' ? si : sj;
      const nn = near === 'i' ? d.ni : d.nj;
      const terms: string[] = [];
      if (!tiny(th(near))) terms.push(`${num((3 * EI) / L)}\\cdot${par(th(near))}`);
      if (!tiny(k.psi)) terms.push(`- ${num((3 * EI) / L)}\\cdot${par(k.psi)}`);
      const Mn = near === 'i' ? a.Mi : a.Mj, Mf = far === 'i' ? a.Mi : a.Mj;
      const b0 = base ? (near === 'i' ? base.Mi : base.Mj) + (Mf - (far === 'i' ? base.Mi : base.Mj)) / 2 : 0;
      out.push({ kind: 'calc', label: tx(`${P}state.memberThree`, { m: d.m.name, n: far === 'i' ? d.ni : d.nj }),
        formula: `M_{${sn}} = ${preF(sn)}\\frac{3EI}{L}\\left(\\theta_{${nn}} - \\psi\\right), \\qquad M_{${sf}} = ${num(Mf)}`,
        subst: `M_{${sn}} = ${base && !tiny(b0) ? `${num(b0)} + ` : ''}${terms.join(' + ').replace(/\+ -/g, '-') || '0'}`,
        result: `\\boxed{M_{${sn}} = ${num(Mn)}\\ ${UM}}` });
    }
  }
  if (a.N !== null && (!tiny(k.e) || (base && !tiny(a.N)))) {
    const t = ks.thermal.get(d.m.id);
    const free = base && t && t.dt ? t.alpha * t.dt * L : 0;
    const Nfe = base ? axialFixedEnd(d) : 0;
    const f = free ? `\\frac{EA}{L}\\left(e - \\alpha\\,\\Delta T\\,L\\right)` : '\\frac{EA}{L}\\,e';
    const subst = `N_{${d.ni}${d.nj}} = ${num(d.m.EA / L)}\\cdot${free ? `\\left(${par(k.e)} - ${num(free)}\\right)` : par(k.e)}${Nfe ? ` + ${par(Nfe)}` : ''}`;
    out.push({ kind: 'calc', label: tx(`${P}state.axial`, { m: d.m.name }), formula: `N_{${d.ni}${d.nj}} = ${f}${Nfe ? ' + N^{*}' : ''}`, subst, result: `\\boxed{N_{${d.ni}${d.nj}} = ${num(a.N)}\\ ${UF}}` });
  }
  return out;
}

/** k_ij or R⁰_i written out: the work of state j's member actions through unknown i's unit displacement. */
function coefCalc(sol: DispSolution, i: number, act: Map<number, MAct>, value: number, sym: string, springU: (node: number, dir: 'x' | 'z' | 'r') => number, W: number | null): Block {
  const { ks, md } = sol;
  const u = ks.unknowns[i];
  const kin = sol.states[i].kin;
  const terms: string[] = [], forms: string[] = [];
  for (const d of md.values()) {
    const k = kin.get(d.m.id)!, a = act.get(d.m.id)!;
    for (const e of ['i', 'j'] as EndSide[]) {
      const th = e === 'i' ? k.thi : k.thj;
      if (tiny(th)) continue;
      forms.push(Mt(d, e));
      terms.push(th === 1 ? par(e === 'i' ? a.Mi : a.Mj) : `${par(th)}\\cdot${par(e === 'i' ? a.Mi : a.Mj)}`);
    }
    if (!tiny(k.psi) && !tiny(a.Mi + a.Mj)) {
      forms.push(`-\\psi_{${d.ni}${d.nj}}\\left(${Mt(d, 'i')} + ${Mt(d, 'j')}\\right)`);
      terms.push(`-${par(k.psi)}\\left(${par(a.Mi)} + ${par(a.Mj)}\\right)`);
    }
    if (!tiny(k.e) && a.N !== null && !tiny(a.N)) {
      forms.push(`N_{${d.ni}${d.nj}}\\,e_{${d.ni}${d.nj}}`);
      terms.push(`${par(a.N)}\\cdot${par(k.e)}`);
    }
  }
  for (const s of ks.springs) {
    const phi = s.dir === 'r' ? (u.kind === 'rot' && !u.hinge && u.node === s.node ? 1 : 0) : transOf(u, s.node)[s.dir];
    const v = springU(s.node, s.dir);
    if (tiny(phi) || tiny(v)) continue;
    forms.push(`k_{${s.dir === 'r' ? '\\theta' : s.dir},${ks.pm.nodes.get(s.node)!.name}}\\,u\\,\\phi`);
    terms.push(`${num(s.k)}\\cdot${par(v)}\\cdot${par(phi)}`);
  }
  if (W !== null && !tiny(W)) { forms.push(`W_{${i + 1}}`); terms.push(`-${par(W)}`); }
  const join = (xs: string[]) => (xs.length ? xs.join(' + ').replace(/\+ -/g, '- ') : '0');
  return { kind: 'calc', formula: `${sym} = ${join(forms)}`, subst: `${sym} = ${join(terms)}`, result: `\\boxed{${sym} = ${num(value)}}` };
}

function lockedSketch(ks: KinSet, labels: (k: number) => string, highlight: number | null): Sketch {
  const sk = sketchOf(ks.pm);
  sk.dofs = ks.unknowns.map((u, k) => {
    const color = k === highlight ? ('accent' as const) : ('muted' as const);
    if (u.kind === 'rot') return { node: u.node, kind: 'ry' as const, label: labels(k), color };
    const p = u.phi.get(u.lead)!;
    return { node: u.lead, kind: u.dir === 'z' || (!u.dir && Math.abs(p.z) > Math.abs(p.x)) ? ('uz' as const) : ('ux' as const), label: labels(k), color };
  });
  return sk;
}

/** The deformed shape of a unit state: rigid chords for a translation, the rotated joint's members bent for a rotation. */
function stateSketch(sol: DispSolution, j: number): Sketch {
  const { ks } = sol;
  const sk = lockedSketch(ks, (k) => (k === j ? `${unknownSym(ks, k).plain} = 1` : `${unknownSym(ks, k).plain} = 0`), j);
  const u = ks.unknowns[j];
  if (u.kind === 'trans') {
    sk.members = sk.members.map((m) => ({ ...m, style: 'faint' as const }));
    const s = 0.15 * extent(ks.pm);
    sk.deformed = ks.pm.memberOrder.map((id) => {
      const m = ks.pm.members.get(id)!;
      const a = ks.pm.nodes.get(m.i)!, b = ks.pm.nodes.get(m.j)!;
      const pa = transOf(u, m.i), pb = transOf(u, m.j);
      return { points: [{ x: a.x + s * pa.x, z: a.z + s * pa.z }, { x: b.x + s * pb.x, z: b.z + s * pb.z }], color: 'deformed' as const };
    });
  } else {
    const touched = new Set(u.ends.map((e) => ks.ends.get(e)!.member));
    sk.members = sk.members.map((m) => ({ ...m, style: touched.has(m.id) ? ('highlight' as const) : ('faint' as const) }));
  }
  return sk;
}

export function state0Step(sol: DispSolution): Step {
  const { ks, md } = sol;
  const b: Block[] = [{ kind: 'p', text: tx(`${P}s0.intro`) }, { kind: 'p', text: tx(`${P}s0.why`), detail: true }];
  b.push({ kind: 'fig', sketch: lockedSketch(ks, (k) => `${unknownSym(ks, k).plain} = 0`, null), caption: tx(`${P}s0.figCaption`) });
  const imposed = [...ks.up].filter(([, v]) => !tiny(v.x) || !tiny(v.z));
  if (imposed.length || ks.thHeld.size) {
    const rows: Cell[][] = imposed.map(([n, v]) => [ks.pm.nodes.get(n)!.name, { tex: num(v.x * 1000) }, { tex: num(v.z * 1000) }]);
    b.push({ kind: 'p', text: tx(ks.opts.axial ? `${P}s0.imposedAxial` : `${P}s0.imposedRigid`) });
    if (rows.length) b.push({ kind: 'table', head: [tx('steps.common.node'), { tex: 'u_x^{0}\\ [\\mathrm{mm}]' }, { tex: 'u_z^{0}\\ [\\mathrm{mm}]' }], rows, caption: tx(`${P}s0.imposedCaption`) });
    for (const [n, th] of ks.thHeld) b.push({ kind: 'p', text: tx(`${P}s0.imposedRot`, { n: ks.pm.nodes.get(n)!.name, v: numText(th) }) });
  }
  for (const d of md.values()) {
    const f = sol.fem0.get(d.m.id)!;
    const k = sol.s0.kin.get(d.m.id)!, a = sol.s0.act.get(d.m.id)!;
    const blocks: Block[] = [];
    if (d.fe.terms.length) blocks.push(...fixedEndBlocks(d.fe, { i: d.ni, j: d.nj }, { shears: false }));
    if (!tiny(f.thermal[0])) {
      const t = ks.thermal.get(d.m.id)!;
      blocks.push({ kind: 'calc', label: tx(`${P}s0.thermalGrad`),
        formula: `\\mathrm{FEM}^{T}_{${subOf(d, 'i')}} = -\\mathrm{FEM}^{T}_{${subOf(d, 'j')}} = \\frac{EI\\,\\alpha\\,\\Delta T_g}{h}`,
        subst: `\\frac{${num(d.m.EI)}\\cdot ${num(t.alpha)}\\cdot ${par(t.dg)}}{${num(t.h)}}`,
        result: `\\boxed{\\mathrm{FEM}^{T}_{${subOf(d, 'i')}} = ${num(f.thermal[0])}\\ ${UM}}` });
    }
    const loadSum = { Mi: f.load[0] + f.thermal[0], Mj: f.load[1] + f.thermal[1] };
    const imposedHere = shape(ks, d) !== 'none' && (!tiny(k.thi) || !tiny(k.thj) || !tiny(k.psi));
    if (imposedHere || (a.N !== null && !tiny(a.N))) {
      if (imposedHere) blocks.push({ kind: 'p', text: tx(`${P}s0.settleMember`) });
      blocks.push(...memberCalc(ks, d, k, a, loadSum));
    } else {
      const rel = shape(ks, d);
      if ((rel === 'i' || rel === 'j') && (!tiny(loadSum.Mi) || !tiny(loadSum.Mj) || !tiny(a.Mi) || !tiny(a.Mj))) {
        const near: EndSide = rel === 'j' ? 'i' : 'j';
        const sn = subOf(d, near), sf = subOf(d, rel);
        const Fn = near === 'i' ? loadSum.Mi : loadSum.Mj, Ff = near === 'i' ? loadSum.Mj : loadSum.Mi;
        const Kf = rel === 'i' ? a.Mi : a.Mj;
        blocks.push({ kind: 'calc', label: tx('steps.frames.fem.modified', { n: rel === 'j' ? d.nj : d.ni }),
          formula: `M^{0}_{${sn}} = \\mathrm{FEM}_{${sn}} + \\tfrac{1}{2}\\left(M_{${sf}} - \\mathrm{FEM}_{${sf}}\\right), \\qquad M^{0}_{${sf}} = ${num(Kf)}`,
          subst: `M^{0}_{${sn}} = ${num(Fn)} + \\tfrac{1}{2}\\left(${par(Kf)} - ${par(Ff)}\\right)`,
          result: `\\boxed{M^{0}_{${sn}} = ${num(near === 'i' ? a.Mi : a.Mj)}\\ ${UM}}` });
      }
    }
    if (blocks.length) b.push({ kind: 'sub', title: tx('steps.frames.memberN', { m: d.m.name }), blocks });
  }
  b.push(endTable(sol, sol.s0.act, tx(`${P}s0.tableCaption`), '0'));
  b.push({ kind: 'p', text: tx(`${P}s0.restraints`) });
  b.push({ kind: 'eq', tex: 'R^{0}_i = \\sum M^{0}\\,\\theta_i - \\sum \\psi_i\\left(M^{0}_{ij} + M^{0}_{ji}\\right) + \\sum N^{0} e_i - W_i', note: tx(`${P}s0.restraintsNote`) });
  b.push({ kind: 'p', text: tx(`${P}s0.loadsOnJoints`), detail: true });
  const base = (q: number, dir: 'x' | 'z' | 'r') => (dir === 'r' ? ks.thHeld.get(q) ?? 0 : (ks.up.get(q) ?? { x: 0, z: 0 })[dir]);
  ks.unknowns.forEach((_, i) => {
    const c = coefCalc(sol, i, sol.s0.act, sol.R0[i], `R^{0}_{${i + 1}}`, base, sol.W[i]);
    b.push({ ...c, label: tx(`${P}s0.restraintLabel`, { k: i + 1, u: unknownSym(ks, i).prose }) } as Block);
  });
  return { title: tx(`${P}s0.title`), blocks: b };
}

function endTable(sol: DispSolution, act: Map<number, MAct>, caption: ReturnType<typeof tx>, sup: string): Block {
  const withN = sol.ks.extensible.size > 0;
  const rows: Cell[][] = [];
  for (const d of sol.md.values()) {
    const a = act.get(d.m.id)!;
    const row: Cell[] = [d.m.name, { tex: num(a.Mi) }, { tex: num(a.Mj) }];
    if (withN) row.push(a.N === null ? '—' : { tex: num(a.N) });
    rows.push(row);
  }
  const head: Cell[] = [tx('steps.common.member'), { tex: `M^{${sup}}_{ij}` }, { tex: `M^{${sup}}_{ji}` }];
  if (withN) head.push({ tex: `N^{${sup}}` });
  return { kind: 'table', head, rows, caption };
}

export function unitStateStep(sol: DispSolution, j: number): Step {
  const { ks, md } = sol;
  const st = sol.states[j];
  const sym = unknownSym(ks, j);
  const b: Block[] = [{ kind: 'p', text: tx(`${P}state.intro`, { u: sym.prose }) }];
  b.push({ kind: 'fig', sketch: stateSketch(sol, j), caption: tx(`${P}state.figCaption`, { u: sym.prose }) });
  const u = ks.unknowns[j];
  if (u.kind === 'trans') {
    const rows: Cell[][] = [];
    for (const d of md.values()) {
      const k = st.kin.get(d.m.id)!;
      if (tiny(k.psi) && tiny(k.e)) continue;
      rows.push([d.m.name, { tex: num(k.psi) }, ...(ks.extensible.size ? [{ tex: num(k.e) } as Cell] : [])]);
    }
    if (rows.length) b.push({ kind: 'table', head: [tx('steps.common.member'), { tex: '\\psi\\ [1/\\mathrm{m}]' }, ...(ks.extensible.size ? [{ tex: 'e' } as Cell] : [])], rows, caption: tx(`${P}state.chordCaption`) });
  }
  for (const d of md.values()) {
    const blocks = memberCalc(ks, d, st.kin.get(d.m.id)!, st.act.get(d.m.id)!, null);
    if (blocks.length) b.push({ kind: 'sub', title: tx('steps.frames.memberN', { m: d.m.name }), blocks });
  }
  b.push(endTable(sol, st.act, tx(`${P}state.tableCaption`, { u: sym.prose }), `(${j + 1})`));
  b.push({ kind: 'p', text: tx(`${P}state.coefIntro`, { j: j + 1 }) });
  const unit = (q: number, dir: 'x' | 'z' | 'r') => (dir === 'r' ? (u.kind === 'rot' && !u.hinge && u.node === q ? 1 : 0) : transOf(u, q)[dir]);
  ks.unknowns.forEach((_, i) => {
    const c = coefCalc(sol, i, st.act, sol.K[i][j], `k_{${i + 1}${j + 1}}`, unit, null);
    b.push({ ...c, label: tx(ks.unknowns[i].kind === 'rot' ? `${P}state.coefRot` : `${P}state.coefTrans`, { i: i + 1, j: j + 1, u: unknownSym(ks, i).prose }) } as Block);
  });
  return { title: tx(`${P}state.title`, { j: j + 1, u: sym.prose }), blocks: b };
}

export function systemStep(sol: DispSolution): Step {
  const { ks } = sol;
  const n = ks.unknowns.length;
  const labels = ks.unknowns.map((_, k) => unknownSym(ks, k).plain);
  const syms = ks.unknowns.map((_, k) => unknownSym(ks, k).tex);
  const asym = sol.K.reduce((s, row, i) => Math.max(s, ...row.map((v, j) => Math.abs(v - sol.K[j][i]))), 0);
  const scale = Math.max(...sol.K.map((r) => Math.max(...r.map(Math.abs))), 1e-9);
  const unitOf = (k: number) => (ks.unknowns[k].kind === 'rot' ? '\\mathrm{rad}' : '\\mathrm{m}');
  const eqs = sol.K.map((row, i) => `${row.map((v, j) => `${par(v)}\\,${syms[j]}`).join(' + ')} = ${num(-sol.R0[i])}`);
  return { title: tx(`${P}sys.title`), blocks: [
    { kind: 'p', text: tx(`${P}sys.intro`) },
    { kind: 'eq', tex: 'R_i = R^{0}_i + \\sum_j k_{ij}\\,D_j = 0 \\quad\\Longrightarrow\\quad \\mathbf{K}\\,\\mathbf{D} = -\\mathbf{R}^{0}' },
    { kind: 'matrix', name: '\\mathbf{K}', rows: sol.K, rowLabels: labels, colLabels: labels, caption: tx(`${P}sys.kCaption`) },
    { kind: 'note', tone: settle(asym, 0, scale).ok ? 'ok' : 'warn', text: tx(`${P}sys.symmetric`) },
    { kind: 'matrix', name: '\\mathbf{R}^{0}', rows: sol.R0.map((v) => [v]), rowLabels: labels, caption: tx(`${P}sys.rCaption`) },
    { kind: 'calc', label: tx(`${P}sys.solve`, { n }),
      formula: '\\mathbf{K}\\,\\mathbf{D} = -\\mathbf{R}^{0}',
      subst: n <= 4 ? `\\begin{aligned} ${eqs.join(' \\\\ ')} \\end{aligned}` : `\\mathbf{D} = -\\mathbf{K}^{-1}\\mathbf{R}^{0}`,
      result: `\\begin{aligned} ${sol.D.map((v, k) => `&\\boxed{${syms[k]} = ${num(v)}\\ ${unitOf(k)}}`).join(' \\\\ ')} \\end{aligned}`,
      check: `\\max\\left|\\mathbf{K}\\mathbf{D} + \\mathbf{R}^{0}\\right| = ${num(sol.residual)}\\ \\checkmark` },
    { kind: 'p', text: tx(`${P}sys.why`), detail: true },
  ] };
}

export function superpositionStep(sol: DispSolution): Step {
  const { ks, md } = sol;
  const b: Block[] = [{ kind: 'p', text: tx(`${P}sup.intro`) }, { kind: 'eq', tex: 'M_{ij} = M^{0}_{ij} + \\sum_j D_j\\,M^{(j)}_{ij}, \\qquad N = N^{0} + \\sum_j D_j\\,N^{(j)}' }];
  const D = sol.D;
  for (const d of md.values()) {
    const res: string[] = [], sub: string[] = [];
    for (const e of ['i', 'j'] as EndSide[]) {
      const M0 = e === 'i' ? sol.s0.act.get(d.m.id)!.Mi : sol.s0.act.get(d.m.id)!.Mj;
      const parts = [num(M0), ...sol.states.map((st, k) => { const v = e === 'i' ? st.act.get(d.m.id)!.Mi : st.act.get(d.m.id)!.Mj; return tiny(v) ? '' : `${par(D[k])}\\cdot${par(v)}`; }).filter(Boolean)];
      sub.push(`${Mt(d, e)} &= ${parts.join(' + ')}`);
      res.push(`\\boxed{${Mt(d, e)} = ${num(sol.M.get(key(d.m.id, e))!)}\\ ${UM}}`);
    }
    if (sol.N.has(d.m.id)) {
      const N0 = sol.s0.act.get(d.m.id)!.N!;
      const parts = [num(N0), ...sol.states.map((st, k) => { const v = st.act.get(d.m.id)!.N!; return tiny(v) ? '' : `${par(D[k])}\\cdot${par(v)}`; }).filter(Boolean)];
      sub.push(`N_{${d.ni}${d.nj}} &= ${parts.join(' + ')}`);
      res.push(`\\boxed{N_{${d.ni}${d.nj}} = ${num(sol.N.get(d.m.id)!)}\\ ${UF}}`);
    }
    b.push({ kind: 'calc', label: tx('steps.frames.memberN', { m: d.m.name }), formula: `${Mt(d, 'i')},\\ ${Mt(d, 'j')}`, subst: `\\begin{aligned} ${sub.join(' \\\\ ')} \\end{aligned}`, result: res.join(', \\qquad ') });
  }
  const rows: Cell[][] = [...md.values()].map((d) => [d.m.name, { tex: `${Mt(d, 'i')} = ${num(sol.M.get(key(d.m.id, 'i'))!)}` }, { tex: `${Mt(d, 'j')} = ${num(sol.M.get(key(d.m.id, 'j'))!)}` }]);
  b.push({ kind: 'table', head: [tx('steps.common.member'), tx('steps.frames.head.endI'), tx('steps.frames.head.endJ')], rows, caption: tx('steps.frames.final.caption') });
  b.push({ kind: 'p', text: tx(`${P}sup.checks`) });
  ks.unknowns.forEach((u, i) => {
    if (u.kind !== 'rot') return;
    const ends = u.ends.map((e) => ks.ends.get(e)!);
    const vals = ends.map((e) => sol.M.get(key(e.member, e.e))!);
    const C = u.hinge ? 0 : sol.W[i];
    const sum = vals.reduce((s, v) => s + v, 0) + u.spring * D[i];
    const st = settle(sum, C, Math.max(...vals.map(Math.abs), Math.abs(C)));
    const nn = ks.pm.nodes.get(u.node)!.name;
    b.push({ kind: 'calc', label: tx(`${P}sup.checkJoint`, { u: unknownSym(ks, i).prose }),
      formula: `${ends.map((e) => Mt(md.get(e.member)!, e.e)).join(' + ')}${u.spring ? ` + k_{\\theta}\\,\\theta_{${nn}}` : ''} = C_{${nn}}`,
      subst: `${vals.map(par).join(' + ')}${u.spring ? ` + ${num(u.spring)}\\cdot${par(D[i])}` : ''} ${st.rel} ${st.tex}`,
      result: `\\boxed{\\sum M ${st.rel} ${st.tex}\\ ${UM}}`, check: st.ok ? '\\checkmark' : undefined });
  });
  return { title: tx(`${P}sup.title`), blocks: b };
}
