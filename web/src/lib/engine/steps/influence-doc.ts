/**
 * The influence line explained: what it is, how Müller-Breslau's principle (or Maxwell's
 * reciprocity, for a displacement) gives its shape, its ordinates and areas, and how it is
 * loaded for the largest and smallest values, each number checked against a direct solve.
 */
import type { Block, CompareRow, Step, StepDoc } from './doc';
import { tx, compareNoteFor } from './doc';
import type { PlaneModel } from './plane-model';
import { num, numText } from './format';
import { releasedSketch, maxwellSketch, targetSketch, peakLabels } from './influence-figs';
import type { SolverInput } from '../types';
import type { InfluenceQuantity } from '../../store/model.svelte';
import { canonicalQuantity, familyOf, ordinateUnit, quantitySymbol, quantityUnit, type IlTarget } from '../influence/quantities';
import { memberGeom, readForce, type Dir, type IlPoint } from '../influence/unit-sweep';
import { targetDisplacement } from '../influence/maxwell';
import { readLine, type LineReading } from '../influence/analysis';
import type { IlLoads, LivePlacement, Zone } from '../influence/areas';
import { solve } from '../wasm-solver';
import { loadOnMember } from '../moving-loads';

export interface InfluenceDocData {
  unit: SolverInput;
  pm: PlaneModel;
  quantity: InfluenceQuantity;
  target: IlTarget;
  points: IlPoint[];
  dir: Dir;
  vertical: boolean;
  loads: IlLoads;
  placement: LivePlacement;
  loadedIds: number[];
  gh: number;
  /** The target was chosen for the reader (no line on screen, nothing selected). */
  defaulted: boolean;
}

const K = 'course.influence.doc.';

/** The quantity's symbol for prose: M, V, N, R_z, u_x, θ. */
function proseSymbol(q: InfluenceQuantity): string {
  return quantitySymbol(q).replace('\\theta', 'θ');
}

/** "at node B" or "at x = 2.5 m of member A–B", with the unit load's direction. */
function whereBlock(d: InfluenceDocData): Block {
  const dir = d.vertical ? 'down' : 'across';
  if (d.target.kind === 'node') {
    return { kind: 'p', text: tx(`${K}where.node.${dir}`, { n: d.pm.nodes.get(d.target.nodeId)?.name ?? String(d.target.nodeId) }) };
  }
  const m = d.pm.members.get(d.target.elementId)!;
  return { kind: 'p', text: tx(`${K}where.section.${dir}`, { m: m.name, x: numText(d.target.t * m.L, 3), L: numText(m.L, 3) }) };
}

function subtitleOf(d: InfluenceDocData) {
  const q = proseSymbol(d.quantity);
  if (d.target.kind === 'node') return tx(`${K}subtitle.node`, { q, n: d.pm.nodes.get(d.target.nodeId)?.name ?? String(d.target.nodeId) });
  const m = d.pm.members.get(d.target.elementId)!;
  return tx(`${K}subtitle.section`, { q, m: m.name, x: numText(d.target.t * m.L, 3) });
}

function zonesText(pm: PlaneModel, zones: Zone[]): string {
  if (zones.length === 0) return '—';
  return zones.map((z) => {
    const m = pm.members.get(z.elementId)!;
    const whole = z.t0 < 1e-9 && z.t1 > 1 - 1e-9;
    return whole ? m.name : `${m.name} (${numText(z.t0 * m.L, 3)}–${numText(z.t1 * m.L, 3)} m)`;
  }).join(', ');
}

/** The η at s* by a direct solve with P = 1 there. */
function directOrdinate(d: InfluenceDocData, p: IlPoint): number {
  const { L } = memberGeom(d.unit, p.elementId);
  const BESIDE = 1e-9;
  const a = p.t * L + (p.side === 'left' ? -BESIDE : p.side === 'right' ? BESIDE : 0);
  const loads = a < 0 || a > L
    ? [{ type: 'nodal' as const, data: { nodeId: a < 0 ? d.unit.elements.get(p.elementId)!.nodeI : d.unit.elements.get(p.elementId)!.nodeJ, fx: d.dir.x, fz: d.dir.z, my: 0 } }]
    : loadOnMember(d.unit, p.elementId, a, 1, d.dir);
  if (familyOf(d.quantity) === 'displacement') return targetDisplacement(d.unit, d.quantity, d.target, loads);
  return readForce(d.quantity, solve({ ...d.unit, loads }), d.unit, d.target);
}

function introBlocks(d: InfluenceDocData): Block[] {
  const c = canonicalQuantity(d.quantity);
  const blocks: Block[] = [
    { kind: 'p', text: tx(`${K}def`) },
    { kind: 'p', text: tx(`${K}differ`), detail: true },
    { kind: 'p', text: tx(`${K}target.${c}`) },
    whereBlock(d),
    { kind: 'p', text: tx(`${K}sign.${c}`) },
    { kind: 'fig', sketch: targetSketch(d.pm, d.target, proseSymbol(c)), caption: subtitleOf(d) },
  ];
  if (d.defaulted) blocks.push({ kind: 'note', tone: 'info', text: tx(`${K}defaulted`) });
  return blocks;
}

function principleStep(d: InfluenceDocData): Step {
  const c = canonicalQuantity(d.quantity);
  if (familyOf(c) === 'displacement') {
    const sample = d.points.reduce((a, p) => (Math.abs(p.value) > Math.abs(a.value) ? p : a), d.points[0]);
    const rows: CompareRow[] = [{ label: '\\eta(s^*)', method: sample.value, matrix: directOrdinate(d, sample), unit: ordinateUnit(c) }];
    const m = d.pm.members.get(sample.elementId)!;
    return {
      title: tx(`${K}maxwell.title`),
      blocks: [
        { kind: 'p', text: tx(`${K}maxwell.principle`) },
        { kind: 'eq', tex: '\\delta_{ij} = \\delta_{ji} \\qquad \\eta(s) = \\delta_{s\\,t}', note: tx(`${K}maxwell.eqNote`) },
        { kind: 'fig', sketch: { ...maxwellSketch(d.pm, c, d.target, d.points, d.dir), labels: peakLabels(d.pm, d.points, d.dir) }, caption: tx(`${K}maxwell.fig.${c === 'ry' ? 'couple' : 'force'}`) },
        { kind: 'p', text: tx(`${K}maxwell.check`, { m: m.name, x: numText(sample.t * m.L, 3) }) },
        { kind: 'compare', rows, caption: compareNoteFor(rows) },
      ],
    };
  }
  const release = c === 'M' ? 'M' : c === 'V' ? 'V' : c === 'N' ? 'N' : 'R';
  const blocks: Block[] = [
    { kind: 'p', text: tx(`${K}mb.principle`) },
    { kind: 'eq', tex: `${quantitySymbol(c)} \\cdot 1 - P \\cdot \\delta(s) = 0 \\;\\Rightarrow\\; ${quantitySymbol(c)}(s) = \\delta(s) = \\eta(s)`, note: tx(`${K}mb.eqNote`) },
    { kind: 'p', text: tx(`${K}mb.release.${release}`) },
    { kind: 'fig', sketch: { ...releasedSketch(d.pm, c, d.target, d.points, d.dir), labels: peakLabels(d.pm, d.points, d.dir) }, caption: tx(`${K}mb.fig`) },
    d.gh <= 0
      ? { kind: 'p', text: tx(`${K}mb.determinate`) }
      : { kind: 'p', text: tx(`${K}mb.indeterminate`, { gh: d.gh, gh1: d.gh - 1 }) },
  ];
  return { title: tx(`${K}mb.title`), blocks };
}

function ordinatesStep(d: InfluenceDocData, r: LineReading): Step {
  const c = canonicalQuantity(d.quantity);
  const unit = ordinateUnit(c);
  const rows: Array<[string, string, number]> = [];
  const seen = new Set<string>();
  for (const p of d.points) {
    const m = d.pm.members.get(p.elementId)!;
    const end = p.t < 1e-9 || p.t > 1 - 1e-9;
    const key = end ? `n${p.t < 0.5 ? m.i : m.j}` : '';
    if (p.side) rows.push([m.name, `${numText(p.t * m.L, 3)} (${p.side === 'left' ? '−' : '+'})`, p.value]);
    else if (end && !seen.has(key)) { seen.add(key); rows.push([m.name, numText(p.t * m.L, 3), p.value]); }
  }
  const blocks: Block[] = [
    { kind: 'p', text: tx(`${K}ord.intro`) },
    { kind: 'table', head: [tx(`${K}ord.member`), 'x [m]', `η [${unit}]`], rows: rows.map(([a, b, v]) => [a, b, v]) },
  ];
  const pair = d.points.filter((p) => p.side);
  if (pair.length === 2 && Math.abs(pair[0].value - pair[1].value) > 1e-9) {
    blocks.push({ kind: 'p', text: tx(`${K}ord.jump`, { left: numText(pair[0].value, 4), right: numText(pair[1].value, 4) }) });
  }
  const peaks = [r.etaMax, r.etaMin].filter((p): p is IlPoint => !!p && Math.abs(p.value) > 1e-12);
  const compare: CompareRow[] = peaks.map((p) => ({ label: p === r.etaMax ? '\\eta_{max}' : '\\eta_{min}', method: p.value, matrix: directOrdinate(d, p), unit }));
  if (compare.length) {
    blocks.push({ kind: 'p', text: tx(`${K}ord.check`) });
    blocks.push({ kind: 'compare', rows: compare, caption: compareNoteFor(compare) });
  }
  return { title: tx(`${K}ord.title`), blocks };
}

function readingStep(d: InfluenceDocData, r: LineReading): Step {
  const c = canonicalQuantity(d.quantity);
  const au = `${ordinateUnit(c)}·m`;
  return {
    title: tx(`${K}read.title`),
    blocks: [
      { kind: 'p', text: tx(`${K}read.sign`) },
      { kind: 'calc', label: tx(`${K}read.areaPos`), formula: 'A^+ = \\int_{\\eta > 0} \\eta(s)\\,ds', result: `A^+ = ${num(r.areas.pos)}\\ \\text{${au}}` },
      { kind: 'calc', label: tx(`${K}read.areaNeg`), formula: 'A^- = \\int_{\\eta < 0} \\eta(s)\\,ds', result: `A^- = ${num(r.areas.neg)}\\ \\text{${au}}` },
      { kind: 'p', text: tx(`${K}read.zones`, { pos: zonesText(d.pm, r.areas.posZones), neg: zonesText(d.pm, r.areas.negZones) }) },
      { kind: 'p', text: tx(`${K}read.loaded`, { list: r.loadedIds.map((id) => d.pm.members.get(id)?.name ?? String(id)).join(', ') }), detail: true },
    ],
  };
}

function usingStep(d: InfluenceDocData, r: LineReading): Step {
  const c = canonicalQuantity(d.quantity);
  const qu = quantityUnit(c);
  const { g, q, P } = d.loads;
  const term = (ex: LineReading['max'], sign: '+' | '-') => {
    const A = sign === '+' ? r.areas.pos : r.areas.neg;
    const liveA = d.placement === 'zones' ? A : ex.live / (q || 1);
    const eta = ex.pointAt?.eta ?? 0;
    const sym = sign === '+' ? 'max' : 'min';
    return {
      kind: 'calc' as const,
      label: tx(`${K}use.${sym}`),
      formula: `${quantitySymbol(c)}_{${sym}} = g\\,(A^+ + A^-) + q\\,A^{${sign}}_{q} + P\\,\\eta_{${sym}}`,
      subst: `${num(g)} \\cdot (${num(r.areas.pos)} + (${num(r.areas.neg)})) + ${num(q)} \\cdot (${num(liveA)}) + ${num(P)} \\cdot (${num(ex.pointAt ? eta : 0)})`,
      result: `${quantitySymbol(c)}_{${sym}} = ${num(ex.value)}\\ \\text{${qu}}`,
    };
  };
  const rows: CompareRow[] = [
    { label: `${quantitySymbol(c)}_{max}`, method: r.max.value, matrix: r.direct.max, unit: qu },
    { label: `${quantitySymbol(c)}_{min}`, method: r.min.value, matrix: r.direct.min, unit: qu },
  ];
  const whereText = (ex: LineReading['max']): Block => {
    const zones = zonesText(d.pm, ex.zones);
    if (!ex.pointAt || P === 0) return { kind: 'p', text: tx(`${K}use.whereNoPoint`, { zones }) };
    const m = d.pm.members.get(ex.pointAt.elementId)!;
    return { kind: 'p', text: tx(`${K}use.where`, { zones, m: m.name, x: numText(ex.pointAt.t * m.L, 3) }) };
  };
  return {
    title: tx(`${K}use.title`),
    blocks: [
      { kind: 'eq', tex: 'Q = P \\cdot \\eta(s_P)', note: tx(`${K}use.point`) },
      { kind: 'eq', tex: 'Q = \\int q\\,\\eta(s)\\,ds = q \\cdot A', note: tx(`${K}use.dist`) },
      { kind: 'p', text: tx(`${K}use.worst.${d.placement}`) },
      { kind: 'p', text: tx(`${K}use.data`, { g: numText(g, 4), q: numText(q, 4), P: numText(P, 4) }) },
      term(r.max, '+'),
      whereText(r.max),
      term(r.min, '-'),
      whereText(r.min),
      { kind: 'p', text: tx(`${K}use.check`) },
      { kind: 'compare', rows, caption: compareNoteFor(rows) },
      { kind: 'note', tone: 'info', text: tx(`${K}use.envelope`) },
    ],
  };
}

export function buildInfluenceDoc(d: InfluenceDocData): StepDoc {
  const r = readLine(d.unit, { quantity: d.quantity, points: d.points, ...(d.target.kind === 'node' ? { targetNodeId: d.target.nodeId } : { targetElementId: d.target.elementId, targetPosition: d.target.t }) }, d.loads, d.placement, d.loadedIds, d.dir);
  return {
    method: 'influenceLine',
    title: tx('steps.m.influenceLine.title'),
    subtitle: subtitleOf(d),
    intro: introBlocks(d),
    steps: [principleStep(d), ordinatesStep(d, r), readingStep(d, r), usingStep(d, r)],
  };
}
