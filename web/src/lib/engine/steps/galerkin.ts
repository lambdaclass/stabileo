import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, StepDoc } from './doc';
import { compareNoteFor, tx } from './doc';
import { num, numText } from './format';
import type { PMember } from './plane-model';
import { sketchOf } from './sketch';
import { plotOf } from './plot';

interface GalerkinData {
  members: [PMember, PMember];
  nodes: [number, number, number];
  names: [string, string, string];
  x0: number;
  z: number;
  L: number;
  h: number;
  EA: number;
  q: number;
}

type ReadResult = { ok: true; data: GalerkinData } | { ok: false; reason: Applicability & { ok: false } };

const no = (key: string): ReadResult => ({ ok: false, reason: { ok: false, reason: tx(key) } });
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function read(ctx: MethodContext): ReadResult {
  const { input, pm } = ctx;
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return no('steps.req.constraints');
  if (pm.members.size !== 2 || pm.nodes.size !== 3) return no('steps.m.galerkin.req.geometry');
  const ms = [...pm.members.values()];
  const members = ms[0].j === ms[1].i ? [ms[0], ms[1]] as const : ms[1].j === ms[0].i ? [ms[1], ms[0]] as const : null;
  if (!members) return no('steps.m.galerkin.req.geometry');
  const [e1, e2] = members;
  const nodes = [e1.i, e1.j, e2.j] as const;
  if (e1.i === e1.j || e1.j !== e2.i || e1.i === e2.j || e1.j === e2.j) return no('steps.m.galerkin.req.geometry');
  if (members.some((m) => m.hingeI || m.hingeJ || Math.abs(m.s) > 1e-9 || m.c <= 0 || !(m.L > 0))) return no('steps.m.galerkin.req.geometry');
  const left = pm.nodes.get(nodes[0])!;
  const middle = pm.nodes.get(nodes[1])!;
  const right = pm.nodes.get(nodes[2])!;
  if (!(left.x < middle.x && middle.x < right.x) || !close(left.z, middle.z) || !close(middle.z, right.z)) return no('steps.m.galerkin.req.geometry');
  if (!close(e1.L, e2.L) || !close(e1.EA, e2.EA) || !close(e1.E, e2.E) || !close(e1.A, e2.A) || !(e1.EA > 0)) return no('steps.m.galerkin.req.stiffness');
  if (pm.supports.size !== 2 || pm.supports.get(nodes[0])?.type !== 'fixed' || pm.supports.get(nodes[2])?.type !== 'fixed' || pm.supports.has(nodes[1])) return no('steps.m.galerkin.req.supports');
  if (input.loads.length !== 2) return no('steps.m.galerkin.req.loads');
  const loads = members.map((m) => input.loads.filter((l) => l.type === 'axialDistributed' && l.data.elementId === m.id));
  if (loads.some((ls) => ls.length !== 1)) return no('steps.m.galerkin.req.loads');
  const distributed = loads.map((ls) => ls[0] as Extract<typeof input.loads[number], { type: 'axialDistributed' }>);
  for (let k = 0; k < 2; k++) {
    const d = distributed[k].data;
    const m = members[k];
    if (!close(d.qI, d.qJ) || !close(d.a ?? 0, 0) || !close(d.b ?? m.L, m.L)) return no('steps.m.galerkin.req.loads');
  }
  const q = distributed[0].data.qI;
  if (!close(q, distributed[1].data.qI) || !Number.isFinite(q) || Math.abs(q) < 1e-12) return no('steps.m.galerkin.req.loads');
  if (!ctx.ref) return no('steps.req.unstable');
  return {
    ok: true,
    data: {
      members: [e1, e2], nodes: [nodes[0], nodes[1], nodes[2]],
      names: [left.name, middle.name, right.name], x0: left.x, z: left.z,
      L: e1.L + e2.L, h: e1.L, EA: e1.EA, q,
    },
  };
}

export function galerkinApplies(ctx: MethodContext): Applicability {
  const r = read(ctx);
  return r.ok ? { ok: true } : r.reason;
}

const p = (key: string, detail = false): Block => ({ kind: 'p', text: tx(key), ...(detail ? { detail: true } : {}) });
const texCell = (tex: string): Cell => ({ tex });

function structure(data: GalerkinData, ctx: MethodContext, withDofs = false): Block {
  const base = sketchOf(ctx.pm);
  const forces: NonNullable<typeof base.forces> = [];
  for (let k = 0; k < 8; k++) {
    const x = data.x0 + (data.L * (2 * k + 1)) / 16;
    forces.push({ x, z: data.z, fx: data.q, fz: 0, ...(k === 0 ? { label: `q = ${numText(data.q)} kN/m` } : {}), color: 'load' });
  }
  const dofs = withDofs ? data.nodes.map((node, k) => ({ node, kind: 'ux' as const, label: `u_${data.names[k]}` })) : [];
  const members = base.members.map((m) => ({ ...m, label: m.id === data.members[0].id ? 'e1' : 'e2' }));
  return { kind: 'fig', sketch: { ...base, members, forces, dofs, dims: 'auto' }, caption: tx(withDofs ? 'steps.m.galerkin.meshCaption' : 'steps.m.galerkin.figureCaption') };
}

function displacementPlot(data: GalerkinData, uB: number): Block {
  const exact = (x: number) => (1000 * data.q * x * (data.L - x)) / (2 * data.EA);
  const points: Array<[number, number]> = Array.from({ length: 41 }, (_, k) => {
    const x = (data.L * k) / 40;
    return [x, exact(x)];
  });
  return {
    kind: 'plot',
    plot: plotOf('x (m)', 'u (mm)', [
      { points, label: tx('steps.m.galerkin.exactSeries'), color: 'muted', dashed: true },
      { points: [[0, 0], [data.h, 1000 * uB], [data.L, 0]], label: tx('steps.m.galerkin.femSeries'), color: 'accent' },
    ], { marks: [{ x: data.h, y: 1000 * uB, label: `${numText(1000 * uB)} mm` }] }),
    caption: tx('steps.m.galerkin.uPlotCaption'),
  };
}

function forcePlot(data: GalerkinData): Block {
  const exact: Array<[number, number]> = Array.from({ length: 41 }, (_, k) => {
    const x = (data.L * k) / 40;
    return [x, data.q * (data.L / 2 - x)];
  });
  const nh = (data.q * data.h) / 2;
  return {
    kind: 'plot',
    plot: plotOf('x (m)', 'N (kN)', [
      { points: exact, label: tx('steps.m.galerkin.exactSeries'), color: 'muted', dashed: true },
      { points: [[0, nh], [data.h, nh], [data.h, -nh], [data.L, -nh]], label: tx('steps.m.galerkin.femSeries'), color: 'accent' },
    ]),
    caption: tx('steps.m.galerkin.nPlotCaption'),
  };
}

export function buildGalerkin(ctx: MethodContext): StepDoc {
  const r = read(ctx);
  if (!r.ok) throw new Error(r.reason.reason.key);
  const d = r.data;
  const [A, B, C] = d.names;
  const k = d.EA / d.h;
  const f = (d.q * d.h) / 2;
  const uB = (d.q * d.L ** 2) / (8 * d.EA);
  const reaction = -d.q * d.h;
  const ke = [[1, -1], [-1, 1]];
  const globalK = [[1, -1, 0], [-1, 2, -1], [0, -1, 1]];
  const globalF = [[f], [2 * f], [f]];
  const symbolicK = '\\frac{EA}{h}\\begin{bmatrix}1&-1&0\\\\-1&2&-1\\\\0&-1&1\\end{bmatrix}';
  const symbolicF = '\\frac{qh}{2}\\begin{Bmatrix}1\\\\2\\\\1\\end{Bmatrix}';
  const steps: Step[] = [];

  steps.push({
    title: tx('steps.m.galerkin.s1.title'),
    blocks: [
      p('steps.m.galerkin.s1.lead'),
      { kind: 'eq', tex: '-\\frac{d}{dx}\\left(EA\\frac{du}{dx}\\right)=q,\\qquad 0<x<L' },
      { kind: 'eq', tex: `u(0)=0,\\qquad u(L)=0,\\qquad N(x)=EA\\frac{du}{dx}` },
      p('steps.m.galerkin.s1.sign', true),
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s2.title'),
    blocks: [
      p('steps.m.galerkin.s2.lead'),
      { kind: 'eq', tex: 'R(x)=-\\frac{d}{dx}\\left(EA\\frac{du}{dx}\\right)-q' },
      { kind: 'calc', formula: '\\int_0^L R(x)\\,v(x)\\,dx=0\\quad \\forall v\\in V', result: '\\boxed{\\int_0^L\\left[-\\frac{d}{dx}\\left(EA\\frac{du}{dx}\\right)-q\\right]v\\,dx=0}' },
      p('steps.m.galerkin.s2.why', true),
      { kind: 'eq', tex: 'V=\\{v:\\ v(0)=v(L)=0\\}' },
      p('steps.m.galerkin.s2.choice'),
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s3.title'),
    blocks: [
      p('steps.m.galerkin.s3.lead'),
      { kind: 'eq', tex: '\\int_0^L-(EAu\')\'v\\,dx=\\left[-EAu\'v\\right]_0^L+\\int_0^LEAu\'v\'\\,dx' },
      { kind: 'eq', tex: 'v(0)=v(L)=0\\quad\\Longrightarrow\\quad\\left[-EAu\'v\\right]_0^L=0' },
      { kind: 'calc', formula: '\\int_0^LEAu\'v\'\\,dx-\\int_0^Lqv\\,dx=0', result: '\\boxed{a(u,v)=\\int_0^LEAu\'v\'\\,dx=\\int_0^Lqv\\,dx=\\ell(v)\\quad\\forall v\\in V}' },
      p('steps.m.galerkin.s3.why', true),
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s4.title'),
    blocks: [
      p('steps.m.galerkin.s4.lead', false),
      structure(d, ctx, true),
      { kind: 'eq', tex: '\\xi=\\frac{x_e}{h},\\qquad N_1(\\xi)=1-\\xi,\\qquad N_2(\\xi)=\\xi' },
      { kind: 'eq', tex: 'u_h(x_e)=N_1u_i+N_2u_j=\\begin{bmatrix}N_1&N_2\\end{bmatrix}\\begin{Bmatrix}u_i\\\\u_j\\end{Bmatrix}' },
      { kind: 'eq', tex: '\\frac{du_h}{dx_e}=\\begin{bmatrix}-\\frac1h&\\frac1h\\end{bmatrix}\\begin{Bmatrix}u_i\\\\u_j\\end{Bmatrix}=\\mathbf{B}\\mathbf{u}^{(e)}' },
      p('steps.m.galerkin.s4.why', true),
      { kind: 'table', head: [tx('steps.common.member'), texCell('i'), texCell('j')], rows: [[{ tex: 'e^{(1)}' }, A, B], [{ tex: 'e^{(2)}' }, B, C]], caption: tx('steps.m.galerkin.connectivity') },
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s5.title'),
    blocks: [
      p('steps.m.galerkin.s5.lead'),
      { kind: 'eq', tex: '\\mathbf{k}^{(e)}=\\int_0^hEA\\,\\mathbf{B}^{T}\\mathbf{B}\\,dx_e=\\frac{EA}{h}\\begin{bmatrix}1&-1\\\\-1&1\\end{bmatrix}' },
      { kind: 'calc', formula: 'k_{12}^{(e)}=EA\\int_0^h\\left(-\\frac1h\\right)\\left(\\frac1h\\right)dx_e=-\\frac{EA}{h}', subst: `k_{12}^{(e)}=${num(d.EA)}\\int_0^{${num(d.h)}}-${num(1 / d.h ** 2)}\\,dx_e`, result: `\\boxed{k_{12}^{(e)}=${num(-k)}\\ \\mathrm{kN/m}}` },
      { kind: 'matrix', name: '\\mathbf{k}^{(e)}', rows: ke, scale: k, caption: tx('steps.m.galerkin.s5.caption') },
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s6.title'),
    blocks: [
      p('steps.m.galerkin.s6.lead'),
      { kind: 'eq', tex: '\\mathbf{f}^{(e)}=\\int_0^hq\\begin{Bmatrix}N_1\\\\N_2\\end{Bmatrix}dx_e=\\frac{qh}{2}\\begin{Bmatrix}1\\\\1\\end{Bmatrix}' },
      { kind: 'calc', formula: 'f_1^{(e)}=q\\int_0^h\\left(1-\\frac{x_e}{h}\\right)dx_e=\\frac{qh}{2}', subst: `f_1^{(e)}=${num(d.q)}\\int_0^{${num(d.h)}}\\left(1-\\frac{x_e}{${num(d.h)}}\\right)dx_e`, result: `\\boxed{f_1^{(e)}=f_2^{(e)}=${num(f)}\\ \\mathrm{kN}}` },
      { kind: 'matrix', name: '\\mathbf{f}^{(e)}', rows: [[f], [f]], caption: tx('steps.m.galerkin.s6.caption') },
      p('steps.m.galerkin.s6.why', true),
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s7.title'),
    blocks: [
      p('steps.m.galerkin.s7.lead'),
      { kind: 'eq', tex: `\\mathbf{K}=${symbolicK},\\qquad \\mathbf{F}=${symbolicF}` },
      { kind: 'matrix', name: '\\mathbf{K}', rows: globalK, scale: k, caption: tx('steps.m.galerkin.s7.kCaption') },
      { kind: 'matrix', name: '\\mathbf{F}', rows: globalF, caption: tx('steps.m.galerkin.s7.fCaption') },
      { kind: 'eq', tex: `\\mathbf{K}\\begin{Bmatrix}u_${A}\\\\u_${B}\\\\u_${C}\\end{Bmatrix}=\\mathbf{F}` },
      p('steps.m.galerkin.s7.why', true),
    ],
  });

  steps.push({
    title: tx('steps.m.galerkin.s8.title'),
    blocks: [
      p('steps.m.galerkin.s8.lead'),
      { kind: 'eq', tex: `u_${A}=u_${C}=0\\ \\Longrightarrow\\ \\frac{2EA}{h}u_${B}=qh` },
      { kind: 'calc', formula: `u_${B}=\\frac{q h^2}{2EA}=\\frac{qL^2}{8EA}`, subst: `u_${B}=\\frac{${num(d.q)}\\,(${num(d.L)})^2}{8(${num(d.EA)})}`, result: `\\boxed{u_${B}=${num(uB)}\\ \\mathrm{m}=${num(1000 * uB)}\\ \\mathrm{mm}}`, check: `2(${num(k)})(${num(uB)})=${num(2 * k * uB)}\\ \\mathrm{kN}=qh\\ \\checkmark` },
      { kind: 'matrix', name: '\\mathbf{u}', rows: [[0], [1000 * uB], [0]], caption: tx('steps.m.galerkin.s8.caption') },
    ],
  });

  const ref = ctx.ref!;
  const comparisons: CompareRow[] = [
    { label: `u_{x,${B}}`, method: 1000 * uB, matrix: 1000 * ref.displacements.get(d.nodes[1])!.ux, unit: 'mm' },
    { label: `R_{x,${A}}`, method: reaction, matrix: ref.reactions.get(d.nodes[0])!.rx, unit: 'kN' },
    { label: `R_{x,${C}}`, method: reaction, matrix: ref.reactions.get(d.nodes[2])!.rx, unit: 'kN' },
  ];
  steps.push({
    title: tx('steps.m.galerkin.s9.title'),
    blocks: [
      p('steps.m.galerkin.s9.lead'),
      { kind: 'eq', tex: `u_h(x)=\\begin{cases}\\dfrac{u_${B}}{h}x,&0\\le x\\le h\\\\\\dfrac{u_${B}}{h}(L-x),&h\\le x\\le L\\end{cases}` },
      displacementPlot(d, uB),
      { kind: 'calc', label: tx('steps.m.galerkin.s9.reactionLabel'), formula: '\\mathbf{R}=\\mathbf{K}\\mathbf{u}-\\mathbf{F}', subst: `R_{x,${A}}=R_{x,${C}}=-\\frac{EA}{h}u_${B}-\\frac{qh}{2}`, result: `\\boxed{R_{x,${A}}=R_{x,${C}}=${num(reaction)}\\ \\mathrm{kN}}`, check: `R_{x,${A}}+R_{x,${C}}+qL=${num(2 * reaction + d.q * d.L)}\\ \\mathrm{kN}\\ \\checkmark` },
      p('steps.m.galerkin.s9.why', true),
      { kind: 'compare', rows: comparisons, caption: compareNoteFor(comparisons) },
    ],
  });

  const refinement = [2, 4, 8, 16].map((n) => ({ n, h: d.L / n, error: (1000 * Math.abs(d.q) * (d.L / n) ** 2) / (8 * d.EA) }));
  steps.push({
    title: tx('steps.m.galerkin.s10.title'),
    blocks: [
      p('steps.m.galerkin.s10.lead'),
      { kind: 'eq', tex: 'u_{\\mathrm{ex}}(x)=\\frac{q}{2EA}x(L-x),\\qquad N_{\\mathrm{ex}}(x)=q\\left(\\frac{L}{2}-x\\right)' },
      forcePlot(d),
      { kind: 'table', head: [{ tex: 'n' }, { tex: 'h\\ [\\mathrm{m}]' }, { tex: 'e_n=\\max|u-u_h|\\ [\\mathrm{mm}]' }, { tex: 'e_{n/2}/e_n' }], rows: refinement.map((r, k) => [r.n, { tex: num(r.h) }, { tex: num(r.error) }, k === 0 ? '—' : { tex: num(refinement[k - 1].error / r.error) }]), caption: tx('steps.m.galerkin.refineCaption') },
      { kind: 'calc', formula: '\\max_{x\\in[0,L]}|u(x)-u_h(x)|=\\frac{|q|h^2}{8EA}', subst: `\\max|u-u_h|=\\frac{${num(Math.abs(d.q))}(${num(d.h)})^2}{8(${num(d.EA)})}`, result: `\\boxed{\\max|u-u_h|=${num(refinement[0].error)}\\ \\mathrm{mm}}` },
      { kind: 'note', tone: 'info', text: tx('steps.m.galerkin.superconvergence') },
      p('steps.m.galerkin.s10.why', true),
    ],
  });

  return {
    method: 'galerkin', title: tx('steps.m.galerkin.title'), subtitle: tx('steps.m.galerkin.subtitle'),
    intro: [
      p('steps.m.galerkin.intro'),
      { kind: 'note', tone: 'info', text: tx('steps.m.galerkin.goal') },
      structure(d, ctx),
      { kind: 'table', head: [{ tex: 'L\\ [\\mathrm{m}]' }, { tex: 'h\\ [\\mathrm{m}]' }, { tex: 'E\\ [\\mathrm{MPa}]' }, { tex: 'A\\ [\\mathrm{m^2}]' }, { tex: 'EA\\ [\\mathrm{kN}]' }, { tex: 'q\\ [\\mathrm{kN/m}]' }], rows: [[{ tex: num(d.L) }, { tex: num(d.h) }, { tex: num(d.members[0].E / 1000) }, { tex: num(d.members[0].A) }, { tex: num(d.EA) }, { tex: num(d.q) }]], caption: tx('steps.m.galerkin.dataCaption') },
      p('steps.m.galerkin.units'),
    ],
    steps,
  };
}
