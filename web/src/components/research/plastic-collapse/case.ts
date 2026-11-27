import data from '../../../../../engine/tests/benchmarks/plastic_collapse.json';
export const portal = data;
export const DEFORM_SCALE = 10;
export type Displacement = { nodeId: number; ux: number; uz: number };
export type Hinge = { elementId: number; end: string; momentY: number; loadFactor: number };
export type Reaction = { nodeId: number; fx: number; fz: number; my: number };
export type Forces = { elementId: number; myStart: number; myEnd: number };
export type Step = {
  loadFactor: number;
  hingesFormed?: Hinge[];
  results: { displacements: Displacement[]; reactions?: Reaction[]; elementForces?: Forces[] };
};
export type Result = { collapseFactor: number; isMechanism: boolean; warnings?: string[]; steps: Step[] };
export type Place = 'leftBase' | 'leftCorner' | 'midspan' | 'rightCorner' | 'rightBase';
export type CheckId = 'collapse' | 'mechanism' | 'hinges' | 'yield' | 'equilibrium' | 'corner';

export type Mechanism = 'beam' | 'sway' | 'combined';
export type Portal = { span: number; height: number; mp: number; horizontal: number; vertical: number };
export const PAPER: Portal = { span: portal.span, height: portal.height, mp: portal.mp, horizontal: portal.horizontal, vertical: portal.vertical };
export const isPaper = (p: Portal) => (Object.keys(PAPER) as (keyof Portal)[]).every(k => p[k] === PAPER[k]);

const elements = Object.values(portal.input.solver.elements);
const PLACES: Record<number, Place> = { 1: 'leftBase', 2: 'leftCorner', 3: 'rightCorner', 4: 'rightBase', 5: 'midspan' };
const HINGES: Record<Mechanism, string> = { beam: '2,3,5', sway: '1,2,3,4', combined: '1,3,4,5' };

export function portalInput(p: Portal = PAPER): typeof portal.input {
  if (isPaper(p)) return structuredClone(portal.input);
  const input = structuredClone(portal.input);
  const at: Record<number, [number, number]> = { 1: [0, 0], 2: [0, p.height], 3: [p.span, p.height], 4: [p.span, 0], 5: [p.span / 2, p.height] };
  for (const n of Object.values(input.solver.nodes)) [n.x, n.z] = at[n.id];
  for (const { data } of input.solver.loads) {
    if (data.fx) data.fx = p.horizontal;
    if (data.fz) data.fz = -p.vertical;
  }
  input.mpOverrides = { 1: [p.mp, p.mp] };
  return input;
}
const nodesOf = (p: Portal) => Object.values(portalInput(p).solver.nodes).sort((a, b) => a.id - b.id);

export function mechanisms(p: Portal = PAPER): Record<Mechanism, number> {
  const { mp, horizontal: h, vertical: v, span: l, height } = p;
  return { beam: 8 * mp / (v * l), sway: 4 * mp / (h * height), combined: 6 * mp / (h * height + v * l / 2) };
}
function lowestMechanisms(bounds: Record<Mechanism, number>): Mechanism[] {
  const minimum = Math.min(...Object.values(bounds));
  return (Object.keys(bounds) as Mechanism[]).filter(key => bounds[key] - minimum <= portal.tolerance);
}
export function governing(p: Portal = PAPER): Mechanism | null {
  const modes = lowestMechanisms(mechanisms(p));
  return modes.length === 1 ? modes[0] : null;
}
export function compare(result: Result, p: Portal = PAPER) {
  if (!Number.isFinite(result.collapseFactor) || !result.steps?.length) throw new Error('Invalid plastic-collapse result');
  return Object.entries(mechanisms(p)).map(([mechanism, reference]) => ({ mechanism, reference, difference: result.collapseFactor - reference }));
}
export async function run(p: Portal = PAPER): Promise<Result> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const result: Result = engine.solvePlastic3D(portalInput(p));
  compare(result, p);
  return result;
}

export function hingeNode(hinge: Pick<Hinge, 'elementId' | 'end'>): number {
  const element = elements.find(e => e.id === hinge.elementId);
  if (!element || (hinge.end !== 'start' && hinge.end !== 'end')) throw new Error(`Unknown hinge ${hinge.elementId} ${hinge.end}`);
  return hinge.end === 'start' ? element.nodeI : element.nodeJ;
}
export const place = (nodeId: number): Place => PLACES[nodeId];

export function events(result: Result) {
  return result.steps.map((step, index) => ({
    index,
    loadFactor: step.loadFactor,
    hinges: (step.hingesFormed ?? []).map(h => ({ node: hingeNode(h), place: place(hingeNode(h)), momentY: h.momentY })),
  }));
}

export function collapseState(result: Result) {
  const moments = new Map<number, { myStart: number; myEnd: number }>();
  const reactions = new Map<number, { fx: number; fz: number; my: number }>();
  for (const step of result.steps) {
    for (const f of step.results.elementForces ?? []) {
      const m = moments.get(f.elementId) ?? { myStart: 0, myEnd: 0 };
      moments.set(f.elementId, { myStart: m.myStart + f.myStart, myEnd: m.myEnd + f.myEnd });
    }
    for (const r of step.results.reactions ?? []) {
      const s = reactions.get(r.nodeId) ?? { fx: 0, fz: 0, my: 0 };
      reactions.set(r.nodeId, { fx: s.fx + r.fx, fz: s.fz + r.fz, my: s.my + r.my });
    }
  }
  return { moments, reactions };
}

export function residual(result: Result, p: Portal = PAPER) {
  const lambda = result.collapseFactor;
  const nodes = nodesOf(p);
  const at = (id: number) => nodes.find(n => n.id === id)!;
  let fx = 0, fz = 0, my = 0;
  for (const [id, r] of collapseState(result).reactions) {
    const n = at(id);
    fx += r.fx; fz += r.fz; my += r.my + n.z * r.fx - n.x * r.fz;
  }
  for (const { data: load } of portalInput(p).solver.loads) {
    const n = at(load.nodeId);
    fx += lambda * load.fx; fz += lambda * load.fz; my += lambda * (load.my + n.z * load.fx - n.x * load.fz);
  }
  return { fx, fz, my };
}

/** Beam collapse is a partial mechanism: a base may yield before it forms, so its three hinges need only be among those formed. */
function hingeSetMatches(nodes: number[], modes: Mechanism[]): boolean {
  const formed = new Set(nodes);
  const patterns = modes.map(mode => HINGES[mode].split(',').map(Number));
  const permitted = new Set(patterns.flat());
  return formed.size === nodes.length && patterns.some(needed => needed.every(n => formed.has(n)))
    && (modes.includes('beam') || nodes.every(n => permitted.has(n)));
}

export const RELATIVE_EQUILIBRIUM = 1e-8;
export function relativeResidual(r: { fx: number; fz: number; my: number }, lambda: number, p: Portal): number {
  const scaled = (force: number, applied: number) => applied === 0
    ? Math.abs(force) / portal.equilibriumTolerance * RELATIVE_EQUILIBRIUM
    : Math.abs(force / applied);
  return Math.max(scaled(r.fx, lambda * p.horizontal), scaled(r.fz, lambda * p.vertical),
    scaled(r.my, lambda * (p.horizontal * p.height + p.vertical * p.span / 2)));
}

export const cornerMoment = (lambda: number, p: Portal = PAPER) => 3 * p.mp - lambda * p.horizontal * p.height;

export function checks(result: Result, p: Portal = PAPER): { id: CheckId; passed: boolean }[] {
  const { mp, vertical: v, span: l } = p;
  const { tolerance, yieldTolerance, equilibriumTolerance } = portal;
  const paper = isPaper(p);
  const bounds = mechanisms(p);
  const possible = lowestMechanisms(bounds);
  const mode = possible.length === 1 ? possible[0] : null;
  const lambda = result.collapseFactor;
  const { moments, reactions } = collapseState(result);
  const hingesMatch = !paper ? result.steps.every(s => (s.hingesFormed ?? []).every(h => {
    const node = hingeNode(h);
    const target = node === 5 || node === 1 || node === 4 ? mp : -mp;
    return Math.abs(h.momentY - target) <= yieldTolerance * mp;
  })) : result.steps.length === portal.events.length && result.steps.every((s, i) => {
    const want = portal.events[i];
    const formed = s.hingesFormed ?? [];
    return formed.length === 1 && formed.every(h => h.elementId === want.elementId && h.end === want.end && Math.sign(h.momentY) === want.momentSign && Math.abs(Math.abs(h.momentY) / mp - 1) <= yieldTolerance)
      && Math.abs(s.loadFactor - want.loadFactor) < tolerance;
  });
  const hingeNodes = hingesMatch ? events(result).flatMap(e => e.hinges.map(x => x.node)).sort((a, b) => a - b) : [];
  const ends = [...moments.values()].flatMap(m => [m.myStart, m.myEnd]);
  const supported = Object.values(portal.input.solver.supports).map(x => x.nodeId).sort((a, b) => a - b).join();
  const reactionsAtSupports = [...reactions.keys()].sort((a, b) => a - b).join() === supported;
  const memberIds = elements.map(e => e.id).sort((a, b) => a - b).join();
  const completeEvents = result.steps.every(step => {
    const forces = step.results.elementForces ?? [];
    return forces.map(f => f.elementId).sort((a, b) => a - b).join() === memberIds && forces.every(f => Number.isFinite(f.myStart) && Number.isFinite(f.myEnd));
  });
  const running = new Map<number, number[]>();
  let hingesCarryForces = true;
  let yieldedOnTheWay = false;
  for (const step of result.steps) {
    for (const f of step.results.elementForces ?? []) {
      const [a, b] = running.get(f.elementId) ?? [0, 0];
      running.set(f.elementId, [a + f.myStart, b + f.myEnd]);
    }
    for (const h of step.hingesFormed ?? []) {
      const m = running.get(h.elementId)?.[h.end === 'start' ? 0 : 1] ?? NaN;
      if (!(Math.abs(m - h.momentY) <= mp * yieldTolerance)) hingesCarryForces = false;
    }
    if ([...running.values()].flat().some(m => !(Math.abs(m) <= mp * (1 + yieldTolerance)))) yieldedOnTheWay = true;
  }
  const corner = moments.get(1)?.myEnd ?? NaN;
  const r = reactionsAtSupports ? residual(result, p) : { fx: NaN, fz: NaN, my: NaN };
  const list: { id: CheckId; passed: boolean }[] = [
    { id: 'collapse', passed: Math.abs(lambda - Math.min(...Object.values(bounds))) < tolerance },
    { id: 'mechanism', passed: result.isMechanism && !(result.warnings ?? []).length },
    { id: 'hinges', passed: hingesMatch && hingesCarryForces && hingeSetMatches(hingeNodes, possible) },
    { id: 'yield', passed: completeEvents && ends.length === 2 * elements.length && ends.every(m => Math.abs(m) <= mp * (1 + yieldTolerance)) && !yieldedOnTheWay },
    { id: 'equilibrium', passed: reactionsAtSupports && (paper ? [r.fx, r.fz, r.my].every(x => Math.abs(x) < equilibriumTolerance) : relativeResidual(r, lambda, p) < RELATIVE_EQUILIBRIUM) },
  ];
  if (mode === 'combined') list.push({ id: 'corner', passed: Math.abs(corner - cornerMoment(lambda, p)) < tolerance && Math.abs(3 * mp + corner - lambda * v * l / 2) < tolerance });
  return list;
}

export function viewer(step?: Step, p: Portal = PAPER) {
  const nodes = nodesOf(p);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const displacement = step ? nodes.flatMap(n => {
    const d = step.results.displacements.find(d => d.nodeId === n.id);
    if (!d || !Number.isFinite(d.ux) || !Number.isFinite(d.uz)) throw new Error('Missing portal displacement');
    return [d.ux, d.uz];
  }) : null;
  const values = displacement ? nodes.map((_, i) => Math.hypot(displacement[2 * i], displacement[2 * i + 1])) : null;
  return {
    xy: nodes.flatMap(n => [n.x, n.z]),
    cells: elements.flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!]),
    displacement, values, range: { min: 0, max: Math.max(...(values ?? [1]), 1e-12) },
  };
}

export function cumulativeStep(steps: Step[], index: number): Step | undefined {
  const selected = steps[index];
  if (!selected) return undefined;
  return {
    loadFactor: selected.loadFactor,
    results: { displacements: selected.results.displacements.map(node => ({
      nodeId: node.nodeId,
      ux: steps.slice(0, index + 1).reduce((sum, step) => sum + (step.results.displacements.find(n => n.nodeId === node.nodeId)?.ux ?? 0), 0),
      uz: steps.slice(0, index + 1).reduce((sum, step) => sum + (step.results.displacements.find(n => n.nodeId === node.nodeId)?.uz ?? 0), 0),
    })) },
  };
}

export function fixed(n: number, locale: string, dp = 6): string {
  const format = new Intl.NumberFormat(locale, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const text = format.format(n);
  return /[1-9]/.test(text) || !Number.isFinite(n) ? text : format.format(0);
}
