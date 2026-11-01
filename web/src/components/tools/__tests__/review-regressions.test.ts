import { afterEach, expect, it } from 'vitest';
import { inflateSync } from 'fflate';
import { EXAMPLE, buildModel, valid } from '../calculators';
import { calculate } from '../solve';
import { DEFAULT_BATCH as P, BATCH_IDS, batchModel, continuousInfluence, numbers, simpleInfluence, validateBatch } from '../batch';
import { calculateBatch } from '../batch-solve';
import { editorUrl } from '../share';
import { MESH_TOLERANCE, validityWarnings } from '../validity';
import { solverMessages } from '../solver-messages';
import { decompressSnapshot } from '../../../lib/utils/url-sharing';
import { modelStore } from '../../../lib/store/model.svelte';
import type { SolverInput } from '../../../lib/engine/types';

afterEach(() => modelStore.clear());
const keys = (r: { warnings: { key: string }[] }) => r.warnings.map(w => w.key);
const shortest = (model: SolverInput) => Math.min(...[...model.elements.values()].map(el => Math.abs(model.nodes.get(el.nodeJ)!.x - model.nodes.get(el.nodeI)!.x)));

it('defaults raise no validity warning', async () => {
  for (const id of ['simply-supported-beam', 'cantilever-beam', 'column-buckling'] as const) expect(keys(await calculate(id, EXAMPLE))).toEqual([]);
  for (const id of BATCH_IDS) expect(keys(await calculateBatch(id, P))).toEqual([]);
});

it('warns when the deflection leaves small-deflection theory (L = 100 m, E = 1 MPa, w = 10⁶ kN/m)', async () => {
  const r = await calculate('simply-supported-beam', { ...EXAMPLE, length: 100, e: 1, i: 1e-6, load: 1e6 });
  expect(keys(r)).toEqual(['tools.warnDeflection']);
  expect(Number(r.warnings[0].values!.ratio)).toBeGreaterThan(1e8);
  expect(keys(await calculate('cantilever-beam', { ...EXAMPLE, e: 1 }))).toContain('tools.warnDeflection');
  expect(validityWarnings({ displacement: 0.02 * 6, length: 6 })).toEqual([]);
  expect(validityWarnings({ displacement: 0.020001 * 6, length: 6 }).map(w => w.key)).toEqual(['tools.warnDeflection']);
});

it('refuses EI below 10⁻⁶ kN·m², where the deflected shape drops member loads', () => {
  expect(valid({ ...EXAMPLE, e: 1, i: 1e-10 })).toBe(false);
  expect(valid({ ...EXAMPLE, e: 1, i: 1e-9 })).toBe(true);
  expect(valid({ ...EXAMPLE, load: 1e-7 })).toBe(false);
  for (const id of ['continuous-beam', 'portal-frame', 'influence-line', 'beam-natural-frequency'] as const) expect(() => validateBatch(id, { ...P, e: 1, i: 1e-10 })).toThrow('tools.batch.invalid');
});

it('warns when the portal frame leaves the classical formula behind (L = 0.1, h = 100; A = 10⁻⁶)', async () => {
  const tall = await calculateBatch('portal-frame', { ...P, length: 0.1, height: 100 });
  expect(tall.difference!).toBeGreaterThan(9);
  expect(keys(tall)).toEqual(['tools.warnDeflection', 'tools.warnReference']);
  const thin = await calculateBatch('portal-frame', { ...P, area: 1e-6 });
  expect(thin.difference!).toBeGreaterThan(10);
  expect(keys(thin)).toContain('tools.warnReference');
});

it('natural frequencies are found at I = 0.1, L = 0.1 and A = 10⁻⁶ for every boundary, with a slenderness warning', async () => {
  for (const patch of [{ i: 0.1 }, { length: 0.1 }, { area: 1e-6 }]) for (const boundary of ['simple', 'cantilever', 'fixed'] as const) {
    const r = await calculateBatch('beam-natural-frequency', { ...P, ...patch, boundary });
    expect(r.modes).toHaveLength(3);
    expect(r.difference!).toBeLessThan(2e-5);
    expect(keys(r)).toEqual(['tools.warnSlenderness']);
  }
});

it('influence-line sections near mesh nodes or the middle support are snapped, not meshed as slivers', async () => {
  for (const [length, count, position] of [[6.1, 1, 0.571875], [6.4, 1, 0.6], [6, 1, 3.0000000001], [6, 1, 2.9999999999], [6, 2, 6.0000000001], [6, 2, 5.9999999999], [6, 2, 6.1875000001]] as const) for (const quantity of ['reaction', 'moment', 'shear'] as const) {
    const p = { ...P, length, count, position, quantity };
    expect(shortest(batchModel('influence-line', p))).toBeGreaterThan(length * MESH_TOLERANCE);
    const r = await calculateBatch('influence-line', p);
    expect(r.difference!).toBeLessThan(1e-7);
    const section = count === 2 && Math.abs(position - length) < 1e-6 ? length : position;
    for (const [x, value] of r.influence) expect(value).toBeCloseTo(count === 1 ? simpleInfluence(length, section, x, quantity) : continuousInfluence(length, section, x, quantity), 7);
  }
  expect(() => validateBatch('influence-line', { ...P, position: 6e-7 })).toThrow();
});

it('influence-line results describe the exported critical-axle model', async () => {
  const r = await calculateBatch('influence-line', P);
  expect(r.model.loads).toHaveLength(1);
  expect(r.linear.reactions.reduce((sum, x) => sum + x.rz, 0)).toBeCloseTo(P.load, 9);
  expect(r.maxDeflection).toBeCloseTo(P.load * 6 ** 3 / (48 * 16000), 12);
});

it('pilot point loads near a mesh node or a support do not create sliver elements', async () => {
  const near = await calculate('simply-supported-beam', { ...EXAMPLE, uniform: false, position: 3.0000000001 });
  expect(shortest(near.model)).toBeGreaterThan(6 * MESH_TOLERANCE);
  expect(near.difference).toBeLessThan(1e-9);
  const edge = await calculate('simply-supported-beam', { ...EXAMPLE, uniform: false, position: 1e-9 });
  expect(shortest(edge.model)).toBeGreaterThan(6 * MESH_TOLERANCE);
  expect(edge.absolute).toBe(true);
  expect(edge.difference).toBeLessThan(1e-15);
  expect(Math.abs(edge.maxima.shear[1])).toBeLessThan(1e-9);
  const cantilever = await calculate('cantilever-beam', { ...EXAMPLE, uniform: false, position: 6 - 1e-9 });
  expect(cantilever.difference).toBeLessThan(1e-9);
  expect(shortest(buildModel('cantilever-beam', { ...EXAMPLE, uniform: false, position: 6 - 1e-9 }))).toBeGreaterThan(6 * MESH_TOLERANCE);
});

it('pilot moment diagrams are sagging positive', async () => {
  expect((await calculate('simply-supported-beam', EXAMPLE)).maxima.moment[1]).toBeCloseTo(45, 9);
  expect((await calculate('cantilever-beam', EXAMPLE)).maxima.moment[1]).toBeCloseTo(-180, 9);
});

it('an unloaded determinate truss is compared, not called indeterminate', async () => {
  const r = await calculateBatch('truss-2d', { ...P, nodalLoads: '6, 0, 0' });
  expect(r.comparisons).toHaveLength(13);
  expect(r.comparisons.every(c => c.absolute && c.difference === null && Math.abs(c.engine) < 1e-12)).toBe(true);
  expect(r.difference).toBeNull();
  const indeterminate = await calculateBatch('truss-2d', { ...P, members: P.members + '\n2, 7' });
  expect(indeterminate.comparisons).toHaveLength(0);
});

it('near-zero references are compared against the largest reference, not divided by zero', async () => {
  const r = await calculateBatch('continuous-beam', { ...P, rightEnd: 'fixed', loads: '10, 1.875' });
  const last = r.comparisons.at(-1)!;
  expect(Math.abs(last.reference)).toBeLessThan(1e-9);
  expect(last.absolute).toBe(true);
  expect(r.difference!).toBeLessThan(1e-9);
  const still = await calculateBatch('portal-frame', { ...P, horizontal: 0 });
  expect(still.comparisons[0].difference).toBeNull();
  expect(Math.abs(still.comparisons[0].engine)).toBeLessThan(1e-12);
  const truss = await calculateBatch('truss-2d', P);
  for (const j of [8, 10]) expect(truss.comparisons[j].absolute).toBe(true);
  expect(truss.difference!).toBeLessThan(1e-9);
});

it('lists refuse a decimal comma instead of reading 6,5 as two spans', () => {
  for (const spans of ['6,5', '6,5, 6,5', '6,5; 6', '6,6']) expect(() => validateBatch('continuous-beam', { ...P, spans })).toThrow('tools.batch.decimalComma');
  expect(() => validateBatch('continuous-beam', { ...P, spans: '6.5, 6.5', loads: '10,5, 10' })).toThrow('tools.batch.decimalComma');
  for (const spans of ['6, 6', '6;6', '6 6', '6.5, 6.5']) expect(numbers(spans)).toHaveLength(2);
});

it('drops info diagnostics and translates the rest', () => {
  const translate = (key: string) => key === 'tools.solverWarning' ? 'Aviso ({code})' : key;
  expect(solverMessages([{ code: 'dense_lu', severity: 'info', message: 'Dense solver' }, { code: 'ill_conditioned', severity: 'warning', message: 'Ill conditioned' }], translate)).toEqual(['Aviso (ill_conditioned)']);
});

it('imported trusses with sparse node IDs allocate the next node after the largest ID', () => {
  const p = { ...P, nodes: '1, 0, 0\n4, 4, 0\n7, 2, 2', members: '1, 4\n4, 7\n7, 1', supports: '1, pinned\n4, rollerX', nodalLoads: '7, 0, -10' };
  const url = editorUrl(batchModel('truss-2d', p), 'truss');
  const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(url.split('#data=2.')[1], 'base64url'))));
  expect(compact.ni[0]).toBe(8);
  modelStore.restore(decompressSnapshot(url.split('#data=')[1])!);
  expect(modelStore.addNode(1, 1)).toBe(8);
  expect([...modelStore.nodes.keys()].sort((a, b) => a - b)).toEqual([1, 4, 7, 8]);
});
