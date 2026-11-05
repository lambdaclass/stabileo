import result from '../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';
export type Layout = {
  volume: number;
  nodes: number[][];
  edges: number[][];
  forces: number[][];
  curves: number[][][];
  primal_residual: number;
  dual_residual: number;
};

export function validateLayout(value: unknown): Layout {
  const v = value as Layout;
  if (!v || !Number.isFinite(v.volume) || Math.abs(v.volume - result.layout.volume) > 1e-8
    || !Array.isArray(v.nodes) || v.nodes.length !== 5
    || !v.nodes.every(p=>p.length===3 && p.every(Number.isFinite))
    || !Array.isArray(v.edges) || v.edges.length!==10 || !v.edges.every(e=>Array.isArray(e) && e.length===2 && e.every(n=>Number.isInteger(n) && n>=0 && n<5))
    || !Array.isArray(v.forces) || v.forces.length!==10 || !v.forces.every(p=>p.length===3 && p.every(Number.isFinite))
    || !Array.isArray(v.curves) || v.curves.length !== 4
    || !v.curves.every(c => c.length === 33 && c.every(p => p.length === 4 && p.every(Number.isFinite) && p[3] > 0))
    || !Number.isFinite(v.primal_residual) || v.primal_residual < 0 || v.primal_residual > 1e-8
    || !Number.isFinite(v.dual_residual) || v.dual_residual < 0 || v.dual_residual > 1e-8) throw new Error('Invalid five-node layout');
  function matches(actual: unknown, expected: unknown): boolean {
    if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
    return Array.isArray(expected) && Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matches(actual[i], e));
  }
  for (const key of ['nodes', 'edges', 'forces', 'curves'] as const) {
    if (!matches(v[key], result.layout[key])) throw new Error('Layout differs from committed solver result');
  }
  return v;
}

export function viewerData(curves: number[][][], plan: boolean) {
  const xy: number[] = [], cells: number[] = [], values: number[] = [];
  curves.forEach((curve, c) => {
    curve.forEach((p, k) => {
      xy.push(plan ? p[0] : p[0] * Math.SQRT2, plan ? p[1] : p[2]);
      values.push(p[3]);
      if (k) cells.push(c * curve.length + k - 1, c * curve.length + k);
    });
  });
  return { xy, cells, values, range: { min: Math.min(...values), max: Math.max(...values) } };
}

type EngineModel = {
  nodes: Record<string, { id: number; x: number; y: number; z: number }>;
  sections: Record<string, { id: number; a: number; iy: number; iz: number; j: number }>;
  elements: Record<string, { id: number; nodeI: number; nodeJ: number; sectionId: number }>;
  supports: Record<string, { nodeId: number }>;
  loads: { type: string; data: { nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number } }[];
};

export function editorModel(input: EngineModel, label: string) {
  return {
    m: '3d', nm: label, sv: 6, lx: 'zUpStrongAxis',
    n: Object.values(input.nodes).map(p => [p.id, p.x, p.y, p.z]),
    mt: [[1, label, 1000, 0.3, 0]],
    sc: Object.values(input.sections).map(s => [s.id, label, s.a, s.iz, { iy: s.iy, j: s.j }]),
    e: Object.values(input.elements).map(e => [e.id, 0, e.nodeI, e.nodeJ, 1, e.sectionId]),
    s: Object.values(input.supports).map((s,i) => [i+1,s.nodeId,'pinned']),
    l: input.loads.map((l,i) => ({ type:'nodal3d', data:{ ...l.data, id:i+1, caseId:1 } })),
    lc: [{ id:1, name:label, type:'dead' }],
    ni: [130,2,129,129,5,130,2,1],
    _: { autoSolve: true, diagramType: 'axialColor' },
  };
}

export async function editorHash(input: EngineModel, label: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(editorModel(input,label)));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const base64 = btoa(Array.from(compressed, b => String.fromCharCode(b)).join(''));
  return '#data=2.' + base64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
