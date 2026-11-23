import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import LZString from 'lz-string';
import { modelStore, uiStore } from '..';
import { autosaveClear, autosaveWrite, resetAutosaveDbForTests } from '../autosave-db';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject, loadAutosave, loadFile, loadProject, projectAutosavePolicy } from '../file';
import { compressSnapshot, decompressSnapshot, loadFromShareLink } from '../../utils/url-sharing';
import { applyCode } from '../../model/code/apply';
import { codeToModel } from '../../model/code/format';
import { CODE_HASH, encodeCode } from '../../model/code/share';
import { fragmentFromJSONModel, fragmentFromSnapshot } from '../../model/edit/fragment-code';
import { validateAndSolve2D } from '../../engine/solver-service';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';

const conflict = /conflict/i;

beforeEach(() => {
  uiStore.analysisMode = '2d';
  modelStore.clear();
});

function project(mode: '2d' | '3d' = '2d') {
  modelStore.clear();
  uiStore.analysisMode = mode;
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(2, 0);
  modelStore.addElement(root, tip);
  modelStore.addSupport(root, 'fixed');
  return buildProjectFile();
}

function nodal(file: ReturnType<typeof project>, fields: object) {
  file.snapshot.loads.push({ type: 'nodal', data: { id: 1, nodeId: file.snapshot.nodes[1]![0], fx: 0, ...fields } });
}

function fixture(file: ReturnType<typeof project>): JSONModel {
  const { snapshot: s } = file;
  return {
    name: 'Alias fixture',
    nodes: s.nodes.map(([, node]) => ({ ...node, z: 0 })),
    materials: s.materials.map(([, material]) => material),
    sections: s.sections.map(([, section]) => section),
    elements: s.elements.map(([, { offset: _offset, ...element }]) => element),
    supports: s.supports.map(([, support]) => support),
    loads: s.loads,
    loadCases: [], combinations: [], plates: [], quads: [], constraints: [],
  };
}

function asFile(data: unknown) {
  return new File([JSON.stringify(data)], 'aliases.ded');
}

it('roadmap 2.4 retains the previous eligible autosave and reports the conflicting revision', async () => {
  await resetAutosaveDbForTests();
  try {
    const file = project();
    nodal(file, { fz: 0, my: 5, mz: 5 });
    expect((await autosaveWrite(file, projectAutosavePolicy)).ok).toBe(true);
    const ambiguous = { ...file, snapshot: { ...file.snapshot, loads: [] } };
    nodal(ambiguous, { fz: 0, my: 0, mz: 5 });
    expect((await autosaveWrite(ambiguous, projectAutosavePolicy)).ok).toBe(true);
    const recovered = await loadAutosave();
    expect(recovered.value?.snapshot.loads[0]?.data).toMatchObject({ my: 5 });
    expect(recovered.value?.snapshot.loads[0]?.data).not.toHaveProperty('mz');
    expect(recovered.rejected).toEqual([expect.objectContaining({ why: 'invalid', reason: expect.stringMatching(/my.*mz/) })]);
  } finally {
    await autosaveClear();
  }
});

for (const mode of ['2d', '3d'] as const) {
  for (const [type, my, mz] of [
    ['nodal', 0, 5], ['nodal', 5, 0], ['pointOnElement', 0, 5],
    ['pointOnElement', 5, 0], ['nodal', 5, -5], ['pointOnElement', 5, -5],
    ['nodal', null, 5], ['pointOnElement', 5, null],
  ] as const) {
    it(`#2459 restore rejects ${type} my=${my}, mz=${mz} in ${mode}`, () => {
      const file = project(mode);
      const [, member] = file.snapshot.elements[0]!;
      const data = type === 'nodal' ? { nodeId: member.nodeJ, fx: 0, fz: 0 } : { elementId: member.id, a: 1, p: 0 };
      file.snapshot.loads.push({ type, data: { ...data, id: 1, my, mz } });
      expect(() => modelStore.restore(file.snapshot)).toThrow(/my.*mz/);
      expect(modelStore.loads).toEqual([]);
    });
  }
}

const fields = [
  ['transverse force', (f: ReturnType<typeof project>) => nodal(f, { fz: 0, fy: 5, my: 0 }), 'fz', 'fy'],
  ['vertical settlement', (f: ReturnType<typeof project>) => Object.assign(f.snapshot.supports[0]![1], { dz: 0, dy: 1 }), 'dz', 'dy'],
  ['prescribed rotation', (f: ReturnType<typeof project>) => Object.assign(f.snapshot.supports[0]![1], { dry: 0, drz: 1 }), 'dry', 'drz'],
  ['uniform load start', (f: ReturnType<typeof project>) => f.snapshot.loads.push({ type: 'distributed', data: { id: 1, elementId: f.snapshot.elements[0]![0], q: 1, qI: 0, qJ: 1 } }), 'qI', 'q'],
  ['uniform load end', (f: ReturnType<typeof project>) => f.snapshot.loads.push({ type: 'distributed', data: { id: 1, elementId: f.snapshot.elements[0]![0], q: 1, qJ: 0 } }), 'qJ', 'q'],
  ['start hinge', (f: ReturnType<typeof project>) => Object.assign(f.snapshot.elements[0]![1], { hingeStart: true }), 'releaseI', 'hingeStart'],
  ['end hinge', (f: ReturnType<typeof project>) => Object.assign(f.snapshot.elements[0]![1], { hingeEnd: true }), 'releaseJ', 'hingeEnd'],
  ['explicit zero moment marker', (f: ReturnType<typeof project>) => f.snapshot.loads.push({ type: 'pointOnElement', data: { id: 1, elementId: f.snapshot.elements[0]![0], a: 1, p: 0, my: 5, enteredZeroMoment: true } }), 'my', 'enteredZeroMoment'],
] as const;

for (const [name, add, canonical, legacy] of fields) {
  it(`roadmap 2.4 refuses conflicting ${name} on open`, async () => {
    const file = project();
    add(file);
    await expect(loadProject(asFile({ ...file, version: '1.0' }))).rejects.toThrow(new RegExp(`${canonical}.*${legacy}`));
    expect(modelStore.snapshot().loads).toEqual([]);
  });
}

it('#2459 rejects ambiguous moments across project, session, autosave, links, model code and fragment intake', async () => {
  const file = project();
  nodal(file, { fz: 0, my: 0, mz: 5 });
  const tab = { id: 'one', name: 'Ambiguous', analysisMode: '2d', modelSnapshot: file.snapshot, undoStack: [], redoStack: [] };
  const compact = compressSnapshot(file.snapshot);
  const legacy = LZString.compressToEncodedURIComponent(JSON.stringify(file.snapshot));
  const text = 'stabileo-model 1\nnode 1 0 0 0\nload nodal 1 nodeId=1 fx=0 fz=0 my=0 mz=5\n';
  expect.soft(deserializeProject(JSON.stringify(file))).toBe(false);
  await expect.soft(loadFile(asFile(file))).rejects.toThrow(conflict);
  expect.soft(acceptSessionTabs([tab]).tabs).toEqual([]);
  expect.soft(acceptAutosavePayload(file)).toBeNull();
  for (const payload of [compact, legacy]) {
    expect.soft(decompressSnapshot(payload)).toBeNull();
    expect.soft(loadFromShareLink(`https://stabileo.com/#data=${payload}`)).toBe(false);
  }
  expect.soft(codeToModel(text).errors[0]?.message).toMatch(/my.*mz/);
  expect.soft(applyCode(text)).toMatchObject({ applied: false, errors: [{ line: 3, message: expect.stringMatching(/my.*mz/) }] });
  expect.soft(loadFromShareLink(`https://stabileo.com/${CODE_HASH}${encodeCode(text)}`)).toBe(false);
  expect.soft(modelStore.loads).toEqual([]);
  expect.soft(() => fragmentFromSnapshot(file.snapshot)).toThrow(/my.*mz/);
  expect.soft(() => fragmentFromJSONModel(fixture(file))).toThrow(/my.*mz/);
  expect.soft(() => loadFixture(fixture(file), modelStore.fixtureApi() as never)).toThrow(/my.*mz/);
  await expect.soft(modelStore.loadExample('alias-test', async () => fixture(file))).rejects.toThrow(/my.*mz/);
});

it('roadmap 2.4 keeps the zero in compact support aliases and refuses conflicting release encodings', () => {
  const file = project();
  const encoded = compressSnapshot(file.snapshot);
  const buffer = Buffer.from(encoded.slice(2), 'base64url');
  const raw = JSON.parse(new TextDecoder().decode(inflateSync(buffer)));
  const link = () => '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(raw)))).toString('base64url');
  raw.s[0][3] = { dz: 0, dy: 1 };
  expect.soft(decompressSnapshot(link())).toBeNull();
  delete raw.s[0][3];
  raw.e[0][6] = { ri: {}, hs: true };
  expect.soft(decompressSnapshot(link())).toBeNull();
});

it('roadmap 2.4 collapses agreeing aliases and preserves distinct 3D components', async () => {
  const file = project();
  nodal(file, { fz: 5, fy: 5, my: 5, mz: 5 });
  await loadProject(asFile(file));
  expect(modelStore.loads[0]?.data).toMatchObject({ fz: 5, my: 5 });
  expect(modelStore.loads[0]?.data).not.toHaveProperty('fy');
  expect(modelStore.loads[0]?.data).not.toHaveProperty('mz');
  const agreeing = validateAndSolve2D(modelStore.model);
  modelStore.restore({
    ...file.snapshot,
    loads: [{ type: 'nodal', data: { id: 1, nodeId: file.snapshot.nodes[1]![0], fx: 0, fz: 5, my: 5 } }],
  });
  const canonical = validateAndSolve2D(modelStore.model);
  expect(agreeing).toMatchObject({ reactions: expect.any(Array) });
  expect(agreeing).toMatchObject(typeof canonical === 'object' && canonical
    ? { reactions: canonical.reactions, displacements: canonical.displacements } : { reactions: null });
  const space = project('3d');
  Object.assign(space.snapshot.supports[0]![1], { type: 'fixed3d', dy: 1, dz: 2, dry: 3, drz: 4 });
  space.snapshot.loads = [{ type: 'nodal3d', data: { id: 1, nodeId: space.snapshot.nodes[1]![0], fx: 0, fy: 1, fz: 2, mx: 0, my: 3, mz: 4 } }];
  modelStore.restore(space.snapshot);
  expect(modelStore.snapshot().supports[0]![1]).toMatchObject({ dy: 1, dz: 2, dry: 3, drz: 4 });
  expect(modelStore.loads[0]?.data).toMatchObject({ fy: 1, fz: 2, my: 3, mz: 4 });
});
