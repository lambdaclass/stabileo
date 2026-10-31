import { afterEach, expect, it, vi } from 'vitest';
import { decompressSnapshot } from '../../../lib/utils/url-sharing';
import { modelStore } from '../../../lib/store/model.svelte';
import { solve, solveBuckling, initSolver } from '../../../lib/engine/wasm-solver';
import { editorUrl } from '../share';
import { buildModel, EXAMPLE, TOOL_IDS, workedExamples } from '../calculators';

afterEach(() => modelStore.clear());
for (const id of TOOL_IDS) it(`imports ${id} into the editor with the same forces and displacements`, async () => {
  await initSolver();
  for (const p of workedExamples(id)) {
    const original = buildModel(id, { ...p, e: EXAMPLE.e / 2 });
    const snapshot = decompressSnapshot(editorUrl(original, id).split('#data=')[1]);
    expect(snapshot).not.toBeNull();
    modelStore.restore(snapshot!);
    const imported = modelStore.buildSolverInput(false)!;
    expect(imported).not.toBeNull();
    expect([...imported.materials.values()][0].e).toBe(EXAMPLE.e / 2);
    const a = solve(original), b = solve(imported);
    expect(b.displacements).toEqual(a.displacements);
    expect(b.reactions).toEqual(a.reactions);
    if (id === 'column-buckling') expect(solveBuckling(imported, 1).modes[0].loadFactor).toBe(solveBuckling(original, 1).modes[0].loadFactor);
  }
});

import { BATCH_IDS, batchModel, DEFAULT_BATCH } from '../batch';
import { solveModal } from '../../../lib/engine/wasm-solver';
for (const id of BATCH_IDS) it(`imports ${id} preserving member type, loads, supports and mass`, async () => {
  await initSolver();
  const original = batchModel(id, DEFAULT_BATCH);
  const options = id === 'beam-natural-frequency' ? { massPerLength: DEFAULT_BATCH.mass } : undefined;
  const snapshot = decompressSnapshot(editorUrl(original, id, options).split('#data=')[1]);
  modelStore.restore(snapshot!);
  const imported = modelStore.buildSolverInput(false)!;
  expect([...imported.elements.values()].map(e => e.type)).toEqual([...original.elements.values()].map(e => e.type));
  expect(solve(imported).displacements).toEqual(solve(original).displacements);
  expect(solve(imported).reactions).toEqual(solve(original).reactions);
  if (options) {
    const material = [...modelStore.materials.values()][0];
    const density = material.rho! * 1000 / 9.81;
    expect(density * DEFAULT_BATCH.area).toBeCloseTo(DEFAULT_BATCH.mass, 10);
    expect(solveModal(imported, new Map([[1, density]]), 3).modes.map((m: any) => m.frequency)).toEqual(solveModal(original, new Map([[1, DEFAULT_BATCH.mass / DEFAULT_BATCH.area]]), 3).modes.map((m: any) => m.frequency));
  }
});


it('preserves an explicitly requested E2E gate across the shared-model handoff', () => {
  try {
    const model = batchModel('continuous-beam', DEFAULT_BATCH);
    vi.stubGlobal('location', { search: '?e2e=1' });
    expect(editorUrl(model, 'beam')).toMatch(/^\/app\/basic\?e2e=1#data=2\./);
    vi.stubGlobal('location', { search: '' });
    expect(editorUrl(model, 'beam')).toMatch(/^\/app\/basic#data=2\./);
  } finally { vi.unstubAllGlobals(); }
});

import { deflateSync, inflateSync } from 'fflate';
import { calculateBatch } from '../batch-solve';
const encode = (payload: string) => `2.${Buffer.from(deflateSync(new TextEncoder().encode(payload))).toString('base64url')}`;
const toolLink = () => editorUrl(batchModel('truss-2d', DEFAULT_BATCH), 'truss').split('#data=')[1];
const compactOf = (link: string) => JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(link.slice(2), 'base64url'))));

it('rejects malformed, oversized, non-finite and dangling tool links', () => {
  const link = toolLink(), compact = compactOf(link);
  expect(decompressSnapshot(link)).not.toBeNull();
  const rejected = {
    version: `9.${link.slice(2)}`,
    base64: '2.%%%***',
    deflate: `2.${Buffer.from('not a deflate stream').toString('base64url')}`,
    json: encode('{"n":[[1,0,'),
    oversized: encode(JSON.stringify({ ...compact, pad: ' '.repeat(60_000_000) })),
    nonfinite: encode(JSON.stringify(compact).replace('[1,0,0]', '[1,1e999,0]')),
    nonnumeric: encode(JSON.stringify({ ...compact, n: compact.n.map((n: unknown[], j: number) => j ? n : [n[0], 'x', n[2]]) })),
    danglingMember: encode(JSON.stringify({ ...compact, e: [...compact.e, [99, 1, 1, 99, 1, 1]] })),
    danglingSupport: encode(JSON.stringify({ ...compact, s: [...compact.s, [9, 77, 'pinned']] })),
    danglingLoad: encode(JSON.stringify({ ...compact, l: [...compact.l, { type: 'nodal', data: { id: 9, caseId: 1, nodeId: 55, fx: 0, fz: -1, my: 0 } }] })),
  };
  for (const [name, data] of Object.entries(rejected)) expect(decompressSnapshot(data), name).toBeNull();
});

it('keeps a hostile tool name as inert text', () => {
  const name = '<img src=x onerror="alert(1)">';
  const snapshot = decompressSnapshot(editorUrl(batchModel('truss-2d', DEFAULT_BATCH), name).split('#data=')[1]);
  expect(snapshot!.name).toBe(name);
  modelStore.restore(snapshot!);
  expect(modelStore.model.name).toBe(name);
});

it('imports the calculated influence-line model with its critical axle', async () => {
  const result = await calculateBatch('influence-line', DEFAULT_BATCH);
  modelStore.restore(decompressSnapshot(editorUrl(result.model, 'influence').split('#data=')[1])!);
  const imported = modelStore.buildSolverInput(false)!;
  expect(imported.loads).toHaveLength(1);
  expect(solve(imported).reactions).toEqual(result.linear.reactions);
});
