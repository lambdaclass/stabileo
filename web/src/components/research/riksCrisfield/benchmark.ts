export type SolverWire = {
  nodes: Record<string, { id: number; x: number; z: number }>;
  materials: Record<string, { id: number; e: number; nu: number }>;
  sections: Record<string, { id: number; a: number; iz: number }>;
  elements: Record<string, { id: number; type: string; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart: boolean; hingeEnd: boolean }>;
  supports: Record<string, { id: number; nodeId: number; type: string }>;
  loads: { type: string; data: { nodeId: number; fx: number; fz: number; my: number } }[];
  constraints: unknown[];
  connectors: Record<string, unknown>;
};

export type ArcInput = {
  solver: SolverWire;
  maxSteps: number;
  maxIter: number;
  tolerance: number;
  initialDs: number;
  minDs: number;
  maxDs: number;
  targetIter: number;
};

export type LimitPoint = { displacement: number; load: number; loadFactor: number };

export type BenchmarkCase = {
  id: string;
  name: string;
  geometry: { halfSpan: number; rise: number; initialLength: number };
  apex: { nodeId: number; dof: 'uz'; displacement: string; referenceLoad: number };
  reference: { upperLimit: LimitPoint };
  tolerances: { limitLoadRelative: number; limitDisplacementRelative: number; equilibriumPathNormalizedByLimitLoad: number };
  input: ArcInput;
};

export type CaseFile = {
  schemaVersion: number;
  title: string;
  units: { length: string; force: string; youngsModulus: string };
  referenceDefinition: { source: string; formula: string; frameBending: string };
  wasmParityTolerance: { absolute: number; relative: number };
  cases: BenchmarkCase[];
};

export type RunParameters = { riseSpan: number; direction: 'downward' | 'upward'; initialDs: number };

export type BenchmarkFrame = {
  step: number;
  loadFactor: number;
  displacement: number;
  load: number;
  iterations: number;
  converged: boolean;
  displacements: number[];
};

export type BenchmarkRun = {
  caseId: string;
  parameters: RunParameters;
  frames: BenchmarkFrame[];
  converged: boolean;
  totalIterations: number;
  finalLoadFactor: number;
};

export type ComparisonCheck = {
  id: 'limit-load' | 'limit-displacement' | 'equilibrium-path';
  label: string;
  reference: number;
  observed: number;
  error: number;
  tolerance: number;
  passed: boolean;
  reached: boolean;
};

export const DEFAULT_PARAMETERS = (c: BenchmarkCase): RunParameters => ({
  riseSpan: c.geometry.rise / (2 * c.geometry.halfSpan),
  direction: 'downward',
  initialDs: c.input.initialDs,
});

export function axialRigidity(c: BenchmarkCase): number {
  const material = Object.values(c.input.solver.materials)[0];
  const section = Object.values(c.input.solver.sections)[0];
  return material.e * 1000 * section.a;
}

export function limitPoint(halfSpan: number, rise: number, ea: number, referenceLoad: number): LimitPoint {
  const l0 = Math.hypot(halfSpan, rise);
  const length = Math.cbrt(halfSpan * halfSpan * l0);
  const y = Math.sqrt(Math.max(0, length * length - halfSpan * halfSpan));
  const load = 2 * ea * (1 - length / l0) * (y / length);
  return { displacement: rise - y, load, loadFactor: load / referenceLoad };
}

export function referenceLoadAt(c: BenchmarkCase, displacement: number, rise = c.geometry.rise): number {
  const y = rise - displacement;
  const length = Math.hypot(c.geometry.halfSpan, y);
  return 2 * axialRigidity(c) * (1 - length / c.geometry.initialLength) * (y / length);
}

export function referencePath(c: BenchmarkCase, parameters: RunParameters = DEFAULT_PARAMETERS(c)): [number, number][] {
  const rise = 2 * c.geometry.halfSpan * parameters.riseSpan;
  const ea = axialRigidity(c);
  const l0 = Math.hypot(c.geometry.halfSpan, rise);
  const limit = limitPoint(c.geometry.halfSpan, rise, ea, c.apex.referenceLoad);
  const at = (displacement: number): [number, number] => {
    const y = rise - displacement;
    const length = Math.hypot(c.geometry.halfSpan, y);
    return [displacement, 2 * ea * (1 - length / l0) * (y / length)];
  };
  const points: [number, number][] = [];
  const end = Math.max(2.2 * rise, limit.displacement * 1.35);
  for (let i = 0; i <= 320; i++) points.push(at(-0.08 * rise + (end + 0.08 * rise) * (i / 320)));
  points.push([limit.displacement, limit.load]);
  return points.sort((a, b) => a[0] - b[0]);
}

export function inputFor(c: BenchmarkCase, parameters: RunParameters): ArcInput {
  const input = structuredClone(c.input);
  const rise = 2 * c.geometry.halfSpan * parameters.riseSpan;
  const apex = input.solver.nodes[String(c.apex.nodeId)];
  apex.z = rise;
  const load = input.solver.loads.find((item) => item.type === 'nodal' && item.data.nodeId === c.apex.nodeId);
  if (!load) throw new Error(`No apex load for ${c.id}`);
  load.data.fz = (parameters.direction === 'downward' ? -1 : 1) * c.apex.referenceLoad;
  input.initialDs = parameters.initialDs;
  return input;
}

export function measuredLimitFrame(frames: BenchmarkFrame[]): BenchmarkFrame | null {
  const firstLimit = frames.findIndex((frame, index) => index + 1 < frames.length && frame.load > 0 && frames[index + 1].load < frame.load);
  return firstLimit >= 0
    ? frames[firstLimit]
    : frames.reduce<BenchmarkFrame | null>((best, frame) => !best || frame.load > best.load ? frame : best, null);
}

export function compareRun(c: BenchmarkCase, run: BenchmarkRun): ComparisonCheck[] {
  const rise = 2 * c.geometry.halfSpan * run.parameters.riseSpan;
  const limit = limitPoint(c.geometry.halfSpan, rise, axialRigidity(c), c.apex.referenceLoad);
  const reached = run.frames.some((frame) => frame.displacement >= limit.displacement);
  const peak = measuredLimitFrame(run.frames);
  const pathError = run.frames.reduce((worst, frame) => {
    const y = rise - frame.displacement;
    const length = Math.hypot(c.geometry.halfSpan, y);
    const reference = 2 * axialRigidity(c) * (1 - length / Math.hypot(c.geometry.halfSpan, rise)) * (y / length);
    return Math.max(worst, Math.abs(frame.load - reference) / Math.abs(limit.load));
  }, 0);
  const loadError = peak && reached ? Math.abs(peak.load - limit.load) / Math.abs(limit.load) : 1;
  const displacementError = peak && reached ? Math.abs(peak.displacement - limit.displacement) / Math.abs(limit.displacement) : 1;
  return [
    { id: 'limit-load', label: 'Limit load', reference: limit.load, observed: reached && peak ? peak.load : NaN, error: loadError, tolerance: c.tolerances.limitLoadRelative, passed: reached && loadError <= c.tolerances.limitLoadRelative, reached },
    { id: 'limit-displacement', label: 'Apex displacement at the limit', reference: limit.displacement, observed: reached && peak ? peak.displacement : NaN, error: displacementError, tolerance: c.tolerances.limitDisplacementRelative, passed: reached && displacementError <= c.tolerances.limitDisplacementRelative, reached },
    { id: 'equilibrium-path', label: 'Maximum equilibrium-path difference / limit load', reference: 0, observed: pathError, error: pathError, tolerance: c.tolerances.equilibriumPathNormalizedByLimitLoad, passed: run.frames.length > 0 && pathError <= c.tolerances.equilibriumPathNormalizedByLimitLoad, reached: run.frames.length > 0 },
  ];
}

export function comparisonHeadline(checks: ComparisonCheck[]): string {
  const passed = checks.filter((check) => check.passed).length;
  const tolerance = Math.max(...checks.map((check) => check.tolerance)) * 100;
  const worst = Math.max(...checks.map((check) => check.error)) * 100;
  return passed === checks.length
    ? `Stabileo traces the snap-through: ${passed}/${checks.length} checks within ${tolerance.toFixed(0)}%`
    : `Snap-through checks: ${passed}/${checks.length} pass; worst difference ${worst.toFixed(1)}%`;
}
