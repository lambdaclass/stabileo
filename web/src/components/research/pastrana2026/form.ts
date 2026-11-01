import { currentResultsVersion } from '../../../lib/provenance/result-changes.json?research-page';

export type Form = {
  nodes: number[][];
  edges: number[][];
  forces: number[];
  residual: number;
  q: number;
  load: number;
};

export function projection(form: Form, elevation: boolean): number[] {
  return form.nodes.flatMap(([x, y, z]) => elevation ? [x, z] : [x - 0.55 * y, z + 0.35 * y]);
}

export function compactModel(form: Form, label: string) {
  return {
    m: '3d', nm: label, lx: 'zUpStrongAxis', sv: 6,
    sw: { resultsVersion: currentResultsVersion, resultsSchemaVersion: 1, analyses: [] },
    n: form.nodes.map((p, i) => [i + 1, ...p]),
    mt: [[1, label, 200000, 0.3, 0]],
    sc: [[1, label, 0.001, 1e-8, { iy: 1e-8, j: 1e-8 }]],
    e: form.edges.map(([a, b], i) => [i + 1, 1, a + 1, b + 1, 1, 1]),
    s: [2, 3, 4, 5].map((i) => [i - 1, i, 'pinned']),
    l: [{ type: 'nodal3d', data: { id: 1, nodeId: 1, fx: 0, fy: 0, fz: -form.load, mx: 0, my: 0, mz: 0 } }],
    ni: [6, 2, 2, 5, 5, 2],
    _: { autoSolve: true, diagramType: 'axialColor', showDiagramValues: true },
  };
}

export async function editorUrl(form: Form, label: string, e2e = false): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(compactModel(form, label)));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const encoded = btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${import.meta.env.BASE_URL}app/basic${e2e ? '?e2e=1' : ''}#data=2.${encoded}`;
}
