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

const nodes = Object.values(portal.input.solver.nodes).sort((a, b) => a.id - b.id);
const elements = Object.values(portal.input.solver.elements);
const PLACES: Record<number, Place> = { 1: 'leftBase', 2: 'leftCorner', 3: 'rightCorner', 4: 'rightBase', 5: 'midspan' };

export function mechanisms() {
  const { mp, horizontal: h, vertical: v, span: l, height } = portal;
  return { beam: 8 * mp / (v * l), sway: 4 * mp / (h * height), combined: 6 * mp / (h * height + v * l / 2) };
}
export function compare(result: Result) {
  if (!Number.isFinite(result.collapseFactor) || !result.steps?.length) throw new Error('Invalid plastic-collapse result');
  return Object.entries(mechanisms()).map(([mechanism, reference]) => ({ mechanism, reference, difference: result.collapseFactor - reference }));
}
export async function run(): Promise<Result> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const result: Result = engine.solvePlastic3D(structuredClone(portal.input));
  compare(result);
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

export function residual(result: Result) {
  const lambda = result.collapseFactor;
  const at = (id: number) => nodes.find(n => n.id === id)!;
  let fx = 0, fz = 0, my = 0;
  for (const [id, r] of collapseState(result).reactions) {
    const n = at(id);
    fx += r.fx; fz += r.fz; my += r.my + n.z * r.fx - n.x * r.fz;
  }
  for (const { data: load } of portal.input.solver.loads) {
    const n = at(load.nodeId);
    fx += lambda * load.fx; fz += lambda * load.fz; my += lambda * (load.my + n.z * load.fx - n.x * load.fz);
  }
  return { fx, fz, my };
}

export const cornerMoment = (lambda: number) => 3 * portal.mp - lambda * portal.horizontal * portal.height;

export function checks(result: Result): { id: CheckId; passed: boolean }[] {
  const { mp, vertical: v, span: l, tolerance, yieldTolerance, equilibriumTolerance } = portal;
  const lambda = result.collapseFactor;
  const { moments, reactions } = collapseState(result);
  const hingeNodes = events(result).flatMap(e => e.hinges.map(x => x.node)).sort((a, b) => a - b);
  const ends = [...moments.values()].flatMap(m => [m.myStart, m.myEnd]);
  const corner = Math.abs(moments.get(1)?.myEnd ?? NaN);
  const r = residual(result);
  return [
    { id: 'collapse', passed: Math.abs(lambda - mechanisms().combined) < tolerance },
    { id: 'mechanism', passed: result.isMechanism && !(result.warnings ?? []).length },
    { id: 'hinges', passed: hingeNodes.join() === '1,3,4,5' },
    { id: 'yield', passed: ends.length === 2 * elements.length && ends.every(m => Math.abs(m) <= mp * (1 + yieldTolerance)) },
    { id: 'equilibrium', passed: reactions.size === 2 && [r.fx, r.fz, r.my].every(x => Math.abs(x) < equilibriumTolerance) },
    { id: 'corner', passed: Math.abs(corner - cornerMoment(lambda)) < tolerance && Math.abs(3 * mp + corner - lambda * v * l / 2) < tolerance },
  ];
}

export function viewer(step?: Step) {
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
