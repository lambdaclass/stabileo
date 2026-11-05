import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import schema from '../generated/result-site-types.json';
import { diagnosticKeys, mapKeys, opaqueKeys, recordKeys } from '../generated/result-sites';
import { tsDiagnosticKeys, tsMapKeys, tsRecordKeys } from '../generated/result-sites-ts';
import { knownIssueResultDisposition } from '../known-issues';
import { resultsStore } from '../../store';

type Shape = string | { seq?: Shape; map?: Shape; tuple?: Array<Shape | null>; ref?: string };
type Body = { kind: string; fields?: Record<string, Shape>; flatten?: Shape[]; inner?: Shape; items?: Array<Shape | null>; untagged?: boolean };
type TypeShape = Body & { tagging?: string; tag?: string | null; content?: string | null; variants?: Record<string, Body> };
type Seg = { key: string } | { index: true } | { mapValue: true } | { tupleAt: number; of: number } | { tag: string; variant: string };
type Target = 'diagnostic' | 'opaque' | { type: string };

const types = (schema as unknown as { types: Record<string, Array<{ origin: string; shape: TypeShape }>> }).types;

function expand(shape: Shape): Array<[Seg[], Target]> {
  if (shape === 'diagnostic' || shape === 'opaque') return [[[], shape]];
  if (typeof shape === 'string') throw new Error(`unexpected shape ${shape}`);
  const under = (seg: Seg, inner: Shape) => expand(inner).map(([segs, t]): [Seg[], Target] => [[seg, ...segs], t]);
  if (shape.seq !== undefined) return under({ index: true }, shape.seq);
  if (shape.map !== undefined) return under({ mapValue: true }, shape.map);
  if (shape.tuple) return shape.tuple.flatMap((item, i) => item === null ? [] : under({ tupleAt: i, of: shape.tuple!.length }, item));
  return [[[], { type: shape.ref! }]];
}

function bodyEdges(body: Body): Array<[Seg[], Shape]> {
  if (body.kind === 'struct') return [...Object.entries(body.fields ?? {}).map(([k, s]): [Seg[], Shape] => [[{ key: k }], s]), ...(body.flatten ?? []).map((s): [Seg[], Shape] => [[], s])];
  if (body.kind === 'newtype') return [[[], body.inner!]];
  if (body.kind === 'tuple') return body.items!.flatMap((s, i): Array<[Seg[], Shape]> => s === null ? [] : [[[{ tupleAt: i, of: body.items!.length }], s]]);
  return [];
}

function typeEdges(name: string): Array<[Seg[], Target]> {
  return types[name]!.flatMap(({ shape }) => {
    const bodies: Array<[Seg[], Shape]> = shape.kind !== 'enum' ? bodyEdges(shape) : Object.entries(shape.variants!).flatMap(([variant, body]) => {
      const tagging = body.untagged ? 'untagged' : shape.tagging;
      const prefix: Seg[] = tagging === 'external' ? [{ key: variant }]
        : tagging === 'internal' ? [{ tag: shape.tag!, variant }]
          : tagging === 'adjacent' ? [{ tag: shape.tag!, variant }, { key: shape.content! }] : [];
      return bodyEdges(body).map(([segs, s]): [Seg[], Shape] => [[...prefix, ...segs], s]);
    });
    return bodies.flatMap(([segs, s]) => expand(s).map(([more, t]): [Seg[], Target] => [[...segs, ...more], t]));
  });
}

function build(segs: Seg[], leaf: unknown): unknown {
  return segs.reduceRight<unknown>((inner, seg) => {
    if ('key' in seg) return { [seg.key]: inner };
    if ('index' in seg) return [inner];
    if ('mapValue' in seg) return { 7: inner };
    if ('tupleAt' in seg) { const items: unknown[] = Array(seg.of).fill(null); items[seg.tupleAt] = inner; return items; }
    return { ...(inner as object), [seg.tag]: seg.variant };
  }, leaf);
}

const shortest = (() => {
  const best = new Map<string, [Seg[], Target]>();
  for (let changed = true; changed;) {
    changed = false;
    for (const name of Object.keys(types)) {
      for (const [segs, target] of typeEdges(name)) {
        const rest = typeof target === 'object' ? best.get(target.type) : [[], target] as [Seg[], Target];
        if (!rest) continue;
        const candidate: [Seg[], Target] = [[...segs, ...rest[0]], rest[1]];
        if (!best.has(name) || candidate[0].length < best.get(name)![0].length) { best.set(name, candidate); changed = true; }
      }
    }
  }
  return best;
})();

function injections(root: string): Array<{ path: Seg[]; target: Target }> {
  const out: Array<{ path: Seg[]; target: Target }> = [];
  const prefix = new Map<string, Seg[]>([[root, []]]);
  const queue = [root];
  while (queue.length) {
    const owner = queue.shift()!;
    for (const [segs, target] of typeEdges(owner)) {
      const path = [...prefix.get(owner)!, ...segs];
      if (typeof target === 'object') {
        if (!prefix.has(target.type)) { prefix.set(target.type, path); queue.push(target.type); }
        const [rest, end] = shortest.get(target.type)!;
        out.push({ path: [...path, ...rest], target: end });
      } else out.push({ path, target });
    }
  }
  return out;
}

const diagnostic = (severity: 'error' | 'warning') => ({ code: 'known_issue', severity, phase: 'SH-MITC4-DISTORTION', value: 798, message: `injected ${severity}` });
const leaf = (target: Target, severity: 'error' | 'warning') => target === 'opaque' ? { deep: [diagnostic(severity)] } : diagnostic(severity);
const describePath = (path: Seg[]) => path.map(s => 'key' in s ? `.${s.key}` : 'index' in s ? '[]' : 'mapValue' in s ? '{}' : 'tupleAt' in s ? `(${s.tupleAt})` : `<${s.tag}=${s.variant}>`).join('');

describe('the result walker finds a refusal at every field path of every engine result type', () => {
  const cases = Object.keys(types).flatMap(root => injections(root).map(i => ({ root, ...i })));
  it('covers every type the schema lists', () => {
    expect(Object.keys(types).length).toBeGreaterThan(50);
    for (const root of Object.keys(types)) expect(cases.some(c => c.root === root), root).toBe(true);
  });
  it.each(cases.map(c => [`${c.root}${describePath(c.path)}`, c] as const))('%s', (_, c) => {
    const refused = knownIssueResultDisposition(build(c.path, leaf(c.target, 'error')));
    expect(refused.refused).toBe(true);
    const warned = knownIssueResultDisposition(build(c.path, leaf(c.target, 'warning')));
    expect(warned.refused).toBe(false);
    expect(warned.messages.length).toBe(1);
  });
});

describe('the result walker reads every key generated from the web result types', () => {
  it.each([...tsRecordKeys])('record key %s', key => {
    expect(knownIssueResultDisposition({ [key]: { structuredDiagnostics: [diagnostic('error')] } }).refused).toBe(true);
    expect(knownIssueResultDisposition({ [key]: [{ structuredDiagnostics: [diagnostic('error')] }] }).refused).toBe(true);
  });
  it.each([...tsMapKeys, ...mapKeys])('map key %s', key => {
    expect(knownIssueResultDisposition({ [key]: { anyId: { structuredDiagnostics: [diagnostic('error')] } } }).refused).toBe(true);
  });
  it.each([...new Set([...tsDiagnosticKeys, ...diagnosticKeys])])('diagnostic key %s', key => {
    expect(knownIssueResultDisposition({ [key]: [diagnostic('error')] }).refused).toBe(true);
  });
  it.each([...opaqueKeys])('opaque key %s is searched to any depth', key => {
    expect(knownIssueResultDisposition({ [key]: { a: [{ b: diagnostic('error') }] } }).refused).toBe(true);
  });
  it('does not walk a key no result type has', () => {
    expect(knownIssueResultDisposition({ unrelated: { structuredDiagnostics: [diagnostic('error')] } }).refused).toBe(false);
  });
  it('is the only way the app reads a disposition from a result', () => {
    const src = fileURLToPath(new URL('../../../', import.meta.url));
    const files = (readdirSync(src, { recursive: true }) as string[]).filter(f => /\.(ts|svelte)$/.test(f) && !/__tests__|\.test\.ts$|lib\/engine\/known-issues\.ts$/.test(f));
    const handPicked = files.filter(f => /knownIssueDisposition\(/.test(readFileSync(src + f, 'utf8')));
    expect(files.length).toBeGreaterThan(500);
    expect(handPicked).toEqual([]);
  });
  it('has no hand-written key list of its own', () => {
    const source = readFileSync(fileURLToPath(new URL('../known-issues.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/\[\s*'[A-Za-z0-9]+'\s*,\s*'[A-Za-z0-9]+'/);
    for (const key of [...recordKeys, ...tsRecordKeys]) expect(source).not.toContain(`'${key}'`);
  });
});

const clean = { displacements: [], reactions: [], elementForces: [] };
const merge = (base: object, sample: unknown): object => {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(sample)) {
    const b = out[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v) ? merge(b, v) : v;
  }
  return out;
};

const STORE: Array<{ type: string; base: object; set: (r: never) => void; get: () => unknown }> = [
  { type: 'AnalysisResults', base: clean, set: r => resultsStore.setResults(r), get: () => resultsStore.results ?? resultsStore.singleResults },
  { type: 'AnalysisResults3D', base: clean, set: r => resultsStore.setResults3D(r), get: () => resultsStore.results3D ?? resultsStore.singleResults3D },
  { type: 'AnalysisResults', base: clean, set: r => resultsStore.setOverlay(r, 'x'), get: () => resultsStore.overlayResults },
  { type: 'AnalysisResults3D', base: clean, set: r => resultsStore.setOverlay3D(r, 'x'), get: () => resultsStore.overlayResults3D },
  { type: 'PDeltaResult', base: { results: clean, linearResults: clean }, set: r => resultsStore.setPDeltaResult(r), get: () => resultsStore.pdeltaResult },
  { type: 'PDeltaResult3D', base: { results: clean, linearResults: clean }, set: r => resultsStore.setPDeltaResult3D(r), get: () => resultsStore.pdeltaResult3D },
  { type: 'ModalResult', base: { modes: [] }, set: r => resultsStore.setModalResult(r), get: () => resultsStore.modalResult },
  { type: 'ModalResult3D', base: { modes: [] }, set: r => resultsStore.setModalResult3D(r), get: () => resultsStore.modalResult3D },
  { type: 'BucklingResult', base: { modes: [] }, set: r => resultsStore.setBucklingResult(r), get: () => resultsStore.bucklingResult },
  { type: 'BucklingResult3D', base: { modes: [] }, set: r => resultsStore.setBucklingResult3D(r), get: () => resultsStore.bucklingResult3D },
  { type: 'PlasticResult', base: { steps: [] }, set: r => resultsStore.setPlasticResult(r), get: () => resultsStore.plasticResult },
  { type: 'SpectralResult', base: { perMode: [], results: clean }, set: r => resultsStore.setSpectralResult(r), get: () => resultsStore.spectralResult },
  { type: 'SpectralResult3D', base: { perMode: [], results: clean }, set: r => resultsStore.setSpectralResult3D(r), get: () => resultsStore.spectralResult3D },
  { type: 'InfluenceLineResult', base: { points: [] }, set: r => resultsStore.setInfluenceLine(r), get: () => resultsStore.influenceLine },
  { type: 'MovingLoadEnvelope', base: { elements: new Map(), positions: [], train: { axles: [] }, path: [] }, set: r => resultsStore.setMovingLoadEnvelope(r), get: () => resultsStore.movingLoadEnvelope },
];

describe('the store withholds a result with a refusal at any field path of its type', () => {
  afterEach(() => resultsStore.clear());
  const rows = STORE.flatMap(s => injections(s.type).map(i => ({ ...s, ...i })));
  it('covers every store-held type', () => {
    for (const s of STORE) expect(types[s.type], s.type).toBeTruthy();
  });
  it.each(rows.map(r => [`${r.type}${describePath(r.path)}`, r] as const))('%s', (_, r) => {
    r.set(merge(r.base, build(r.path, leaf(r.target, 'warning'))) as never);
    expect(r.get()).not.toBeNull();
    resultsStore.clear();
    r.set(merge(r.base, build(r.path, leaf(r.target, 'error'))) as never);
    expect(r.get()).toBeNull();
  });
});
