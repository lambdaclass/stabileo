import result from '../../../../../research/optimisation/fairclough-2026/results/stabileo_results.json';
import published from '../../../../../research/optimisation/fairclough-2026/reference-results/published_comparison.json';
export type Layout = {
  volume: number;
  nodes: number[][];
  edges: number[][];
  forces: number[][];
  curves: number[][][];
  primal_residual: number;
  dual_residual: number;
};

export const PAPER_UNIT_WEIGHT = 1.65;

export function validateLayout(value: unknown, unitWeight = PAPER_UNIT_WEIGHT): Layout {
  const v = value as Layout;
  if (!v || !Number.isFinite(v.volume) || v.volume <= 0
    || !Array.isArray(v.nodes) || v.nodes.length !== 5
    || !v.nodes.every(p=>p.length===3 && p.every(Number.isFinite))
    || !Array.isArray(v.edges) || v.edges.length!==10 || !v.edges.every(e=>Array.isArray(e) && e.length===2 && e.every(n=>Number.isInteger(n) && n>=0 && n<5))
    || !Array.isArray(v.forces) || v.forces.length!==10 || !v.forces.every(p=>p.length===3 && p.every(Number.isFinite))
    || !Array.isArray(v.curves) || v.curves.length < 1 || v.curves.length > 10
    || !v.curves.every(c => c.length === 33 && c.every(p => p.length === 4 && p.every(Number.isFinite) && p[3] > 0))
    || !Number.isFinite(v.primal_residual) || v.primal_residual < 0 || v.primal_residual > 1e-8
    || !Number.isFinite(v.dual_residual) || v.dual_residual < 0 || v.dual_residual > 1e-8) throw new Error('Invalid five-node layout');
  if (!(unitWeight > 0 && unitWeight <= 2.2)) throw new Error('Invalid unit weight');
  if (!v.nodes.every(([x, y, z], i) => x === result.layout.nodes[i][0] && y === result.layout.nodes[i][1] && (i === 4 || z === 0))
    || !v.edges.every(([a, b], i) => a === result.layout.edges[i][0] && b === result.layout.edges[i][1])) throw new Error('Invalid five-node ground structure');
  let fx = 0, fy = 0, fz = 1;
  let volume = 0;
  const active = v.edges.map(([start, end], i) => ({ start, end, force: v.forces[i] })).filter(edge => edge.force[0] > 1e-5);
  if (active.length !== v.curves.length) throw new Error('Missing active member curve');
  active.forEach(({ start, end, force: [thrust, qa, qb] }, i) => {
    const a = v.nodes[start], b = v.nodes[end], curve = v.curves[i];
    if (curve[0][0] !== a[0] || curve[0][1] !== a[1]) throw new Error('Mismatched active member start endpoint');
    for (const [endpoint, node] of [[curve[0], a], [curve[32], b]]) {
      if (Math.abs(endpoint[0] - node[0]) > 1e-12 || Math.abs(endpoint[1] - node[1]) > 1e-12
        || Math.abs(endpoint[2] - node[2]) > 1e-5) throw new Error('Mismatched active member endpoint');
    }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const theta = Math.atan(qa / thrust);
    const endSlope = Math.tan(theta - unitWeight * length);
    const weight = qa - thrust * endSlope;
    if (Math.abs(qa + qb - weight) > 1e-8 * Math.max(1, Math.abs(weight))) throw new Error('Inconsistent member self-weight');
    volume += weight / unitWeight;
    if (end === 4) {
      fx += thrust * (b[0] - a[0]) / length;
      fy += thrust * (b[1] - a[1]) / length;
      fz += qb;
    }
    for (const [sample, point] of curve.entries()) {
      const t = sample / (curve.length - 1);
      const cosine = Math.cos(theta - unitWeight * length * t);
      const expected = thrust / cosine;
      if (Math.abs(point[0] - (a[0] + t * (b[0] - a[0]))) > 1e-12
        || Math.abs(point[1] - (a[1] + t * (b[1] - a[1]))) > 1e-12) throw new Error('Inconsistent member plan position');
      const elevation = a[2] + Math.log(cosine / Math.cos(theta)) / unitWeight;
      if (!Number.isFinite(elevation) || Math.abs(point[2] - elevation) > 1e-12) throw new Error('Inconsistent member elevation');
      if (!Number.isFinite(expected) || Math.abs(point[3] - expected) > 1e-12) throw new Error('Inconsistent active member area at requested weight');
    }
  });
  if (Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz)) > 1e-8) throw new Error('Free node violates equilibrium');
  if (!Number.isFinite(volume) || Math.abs(volume - v.volume) > 1e-8 * v.volume) throw new Error('Inconsistent catenary volume');
  if (unitWeight !== PAPER_UNIT_WEIGHT) return v;
  function matches(actual: unknown, expected: unknown): boolean {
    if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
    return Array.isArray(expected) && Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matches(actual[i], e));
  }
  if (Math.abs(v.volume - result.layout.volume) > 1e-8) throw new Error('Volume differs from committed solver result');
  for (const key of ['nodes', 'edges', 'forces', 'curves'] as const) {
    if (!matches(v[key], result.layout[key])) throw new Error('Layout differs from committed solver result');
  }
  return v;
}

export const unitWeightOf = (id: string) => /^table1-v5-(\d+(?:\.\d+)?)$/.test(id) ? Number(id.slice('table1-v5-'.length)) : NaN;
export const paperRow = (weight: number) => published.checks.find(r => unitWeightOf(r.id) === weight);

export function paperComparison(layout: Layout, weight: number) {
  const row = paperRow(weight);
  if (!row) return null;
  const observed = Math.abs(layout.volume - row.reference);
  return { ...row, computed: layout.volume, observed, passed: observed <= row.tolerance };
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
