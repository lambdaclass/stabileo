import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import LZString from 'lz-string';
import { historyStore, modelStore, uiStore } from '..';
import { addLoads } from '../load-ops';
import { autosaveClear, autosaveWrite, resetAutosaveDbForTests } from '../autosave-db';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject, loadAutosave, loadFile, loadProject, loadWorkspaceFromLocalStorage, projectAutosavePolicy, readWorkspaceBackups } from '../file';
import { compressSnapshot, decompressSnapshot, generateEmbedURL, generateShareURL, loadFromShareLink } from '../../utils/url-sharing';
import { applyCode } from '../../model/code/apply';
import { codeToModel } from '../../model/code/format';
import { CODE_HASH, encodeCode } from '../../model/code/share';
import { fragmentFromJSONModel, fragmentFromSnapshot } from '../../model/edit/fragment-code';
import { modelFeatures } from '../../provenance/model-features';
import resultChangeQuantities from 'virtual:result-change-quantities';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { conditionHolds } from '../../provenance/applicability';
import { validateAndSolve2D } from '../../engine/solver-service';
import { solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
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
  expect(() => compressSnapshot(file.snapshot)).toThrow(/my.*mz/);
  const valid = compressSnapshot({ ...file.snapshot, loads: [] });
  const raw = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(valid.slice(2), 'base64url'))));
  raw.l = file.snapshot.loads;
  const compact = '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(raw)))).toString('base64url');
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


it('#2532 normalizes legacy edit-layer loads before they enter undo history', () => {
  const file = project();
  const nodeId = file.snapshot.nodes[1]![0];
  modelStore.addLoadEntry({ type: 'nodal', data: { id: 0, nodeId, fx: 0, fy: -7, mz: 2 } as never });
  const before = modelStore.snapshot();
  modelStore.restore(before);
  expect.soft(modelStore.snapshot().loads).toEqual(before.loads);
  expect.soft(before.loads).toEqual([{ type: 'nodal', data: { id: 1, nodeId, fx: 0, fz: -7, my: 2 } }]);
  const legacy = { type: 'nodal' as const, data: { id: 1, nodeId, fx: 0, fy: -7, mz: 2 } as never };
  modelStore.replaceLoads([legacy]);
  const beforeRefusal = modelStore.snapshot();
  expect.soft(beforeRefusal.loads).toEqual(before.loads);
  historyStore.clear();
  const invalid = { ...legacy, data: { id: 1, nodeId, fx: 0, fz: 0, fy: 1 } as never };
  expect.soft(() => modelStore.addLoadEntry(invalid)).toThrow(/fz.*fy/);
  expect.soft(() => modelStore.replaceLoads([legacy, invalid])).toThrow(/fz.*fy/);
  expect.soft(() => addLoads([legacy, invalid])).toThrow(/fz.*fy/);
  expect.soft(historyStore.canUndo).toBe(false);
  expect(modelStore.snapshot()).toEqual(beforeRefusal);
});

it('#2532 uses the project mode consistently and leaves history intact on refusal', async () => {
  const space = project('3d');
  space.snapshot.analysisMode = '2d';
  space.snapshot.nodes[1]![1].z = 1;
  Object.assign(space.snapshot.supports[0]![1], { dy: 1, dz: 2 });
  historyStore.clear();
  await expect.soft(loadProject(asFile(space))).resolves.toBeUndefined();
  expect.soft(uiStore.analysisMode).toBe('3d');
  expect.soft(modelStore.snapshot().supports[0]![1]).toMatchObject({ dy: 1, dz: 2 });
  expect.soft(acceptAutosavePayload(space)?.snapshot.analysisMode).toBe('3d');

  const plane = { ...space, analysisMode: '2d', snapshot: { ...space.snapshot, analysisMode: '3d' } } as const;
  const before = modelStore.snapshot();
  const stacks = historyStore.getStacks();
  await expect.soft(loadProject(asFile(plane))).rejects.toThrow(/dz.*dy/);
  expect.soft(acceptAutosavePayload(plane)).toBeNull();
  expect.soft(historyStore.getStacks()).toEqual(stacks);
  expect(modelStore.snapshot()).toEqual(before);
});

for (const stack of ['undoStack', 'redoStack'] as const) {
  it(`#2532 opens repaired tabs and reports discarded ${stack} in session and workspace intake`, async () => {
    const file = project();
    nodal(file, { fz: 0, my: 5, mz: 5 });
    const bad = { ...file.snapshot, loads: [] };
    nodal({ ...file, snapshot: bad }, { fz: 0, my: 0, mz: 5 });
    const tab = { id: 'repaired', name: 'Repaired fixture', analysisMode: '2d', modelSnapshot: file.snapshot,
      undoStack: [file.snapshot], redoStack: [file.snapshot], undoKinds: ['structural'], redoKinds: ['structural'] };
    const session = { version: '1.0', type: 'session', activeTabId: tab.id, tabs: [{ ...tab, [stack]: [bad] }] };
    const good = acceptSessionTabs([tab]).tabs[0];
    expect(good.undoStack).toHaveLength(1);
    expect(good.redoStack).toHaveLength(1);
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    const storage = new Map([['stabileo-workspace', JSON.stringify(session)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    try {
      await expect.soft(loadFile(asFile(session))).resolves.toEqual({ type: 'session', count: 1 });
      expect.soft(modelStore.snapshot().loads[0]?.data).toMatchObject({ my: 5 });
      expect.soft(historyStore.getStacks()).toEqual({ undo: [], redo: [], undoKinds: [], redoKinds: [] });
      expect.soft(toast).toHaveBeenCalledWith(expect.stringMatching(/history.*Repaired fixture.*my.*mz/i), 'error');
      toast.mockClear();
      const saved = loadWorkspaceFromLocalStorage();
      expect.soft(saved?.tabs[0]).toMatchObject({ id: tab.id, undoStack: [], redoStack: [], undoKinds: [], redoKinds: [] });
      expect.soft(toast).toHaveBeenCalledWith(expect.stringMatching(/history.*Repaired fixture.*my.*mz/i), 'error');
      expect(readWorkspaceBackups()[0]).toMatchObject({ reason: 'history-dropped', raw: JSON.stringify(session) });
    } finally {
      toast.mockRestore();
      vi.unstubAllGlobals();
    }
  });
}

for (const [canonical, legacy] of [['dz', 'dy'], ['dry', 'drz']] as const) {
  it(`#2532 refuses distinct ${canonical}/${legacy} before compact rounding`, () => {
    const file = project();
    const support = file.snapshot.supports[0]![1];
    const value = 0.12345678901;
    Object.assign(support, { [canonical]: value, [legacy]: 0.12345678902 });
    expect.soft(() => compressSnapshot(file.snapshot)).toThrow(new RegExp(`${canonical}.*${legacy}`));
    support[legacy] = value;
    const agreeing = decompressSnapshot(compressSnapshot(file.snapshot))?.supports[0]![1];
    expect.soft(agreeing?.[canonical]).toBe(0.123456789);
    expect(agreeing).not.toHaveProperty(legacy);

    const liveSupport = modelStore.supports.get(support.id)!;
    Object.assign(liveSupport, { [canonical]: value, [legacy]: 0.12345678902 });
    const toast = vi.spyOn(uiStore, 'toast').mockImplementation(() => {});
    try {
      for (const generate of [generateShareURL, generateEmbedURL]) {
        expect(generate()).toBeNull();
        expect(toast).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${canonical}.*${legacy}`)), 'error');
        toast.mockClear();
      }
    } finally {
      toast.mockRestore();
    }

    const space = project('3d');
    const spatialSupport = space.snapshot.supports[0]![1];
    Object.assign(spatialSupport, { type: 'fixed3d', [canonical]: value, [legacy]: -value });
    const spatial = decompressSnapshot(compressSnapshot(space.snapshot))?.supports[0]![1];
    expect(spatial).toMatchObject({ [canonical]: 0.123456789, [legacy]: -0.123456789 });
  });
}

for (const end of ['I', 'J'] as const) {
  it(`#2532 registers the changed reactions of a fixture with agreeing end ${end} release aliases`, () => {
    const file = project();
    const root = file.snapshot.nodes[0]![0];
    const tip = file.snapshot.nodes[1]![0];
    modelStore.addSupport(tip, 'fixed');
    const input = fixture(buildProjectFile());
    const member = input.elements[0];
    const hinge = end === 'I' ? 'hingeStart' : 'hingeEnd';
    const release = end === 'I' ? 'releaseI' : 'releaseJ';
    member[hinge] = true;
    member[release] = { mz: true };
    input.loads = [{ type: 'distributed', data: { id: 1, elementId: file.snapshot.elements[0]![0], qI: -4, qJ: -4 } }];

    modelStore.clear();
    loadFixture(input, modelStore.fixtureApi() as never);
    const result = validateAndSolve2D(modelStore.model);
    if (!result || typeof result === 'string') throw new Error(String(result));
    const released = end === 'I' ? root : tip;
    const fixed = end === 'I' ? tip : root;
    expect.soft(result.reactions.find(reaction => reaction.nodeId === released)?.rz).toBeCloseTo(3, 10);
    expect.soft(result.reactions.find(reaction => reaction.nodeId === fixed)?.rz).toBeCloseTo(5, 10);
    expect.soft(modelStore.elements.get(member.id)?.[release].mz).toBe(true);

    const change = RESULT_CHANGES.changes.find(entry => entry.id === 'fixture-release-aliases');
    expect.soft(resultChangeQuantities['fixture-release-aliases']).toEqual(['displacements', 'reactions', 'elementForces']);
    const features = () => modelFeatures({ elements: input.elements.map(e => [e.id, e]) });
    expect(change).toBeDefined();
    if (change) {
      expect.soft(conditionHolds(change.when ?? {}, features())).toBe(true);
      delete member[hinge];
      expect.soft(conditionHolds(change.when ?? {}, features())).toBe(false);
      member[hinge] = false;
      member[release] = { mz: false };
      expect(conditionHolds(change.when ?? {}, features())).toBe(false);
    }
  });
}


for (const mode of ['2d', '3d'] as const) {
  it(`#2532 replays one agreeing release through example loading and ${mode} linear and P-Delta solvers`, async () => {
    modelStore.clear();
    uiStore.analysisMode = mode;
    const root = modelStore.addNode(0, 0, 0);
    const mid = modelStore.addNode(1, 0, 0);
    const tip = modelStore.addNode(2, 0, 0);
    const members = [modelStore.addElement(root, mid), modelStore.addElement(mid, tip)];
    const supportType = mode === '2d' ? 'fixed' : 'fixed3d';
    modelStore.addSupport(root, supportType);
    modelStore.addSupport(tip, supportType);
    const input = fixture(buildProjectFile());
    const first = input.elements[0];
    first.releaseI = { mz: true };
    input.loads = members.map((elementId, i) => mode === '2d'
      ? { type: 'distributed', data: { id: i + 1, elementId, qI: -4, qJ: -4 } }
      : { type: 'distributed3d', data: { id: i + 1, elementId, qYI: -4, qYJ: -4, qZI: 0, qZJ: 0 } });

    const solve = () => {
      const linear = mode === '2d' ? modelStore.solve() : modelStore.solve3D();
      const nonlinear = mode === '2d'
        ? solvePDelta(modelStore.buildSolverInput()!)
        : solvePDelta3D(modelStore.buildSolverInput3D()!);
      if (!linear || typeof linear === 'string') throw new Error(String(linear));
      expect(nonlinear.converged).toBe(true);
      return [linear, nonlinear.results];
    };

    await modelStore.loadExample('fixture-release-aliases-test', async () => input);
    const typed = solve();
    first.hingeStart = true;
    await modelStore.loadExample('fixture-release-aliases-test', async () => input);
    const agreeing = solve();
    for (const [index, result] of agreeing.entries()) {
      const reaction = (nodeId: number) => {
        const row = result.reactions.find((reaction: { nodeId: number }) => reaction.nodeId === nodeId);
        return mode === '2d' ? row?.rz : row?.fy;
      };
      expect.soft(reaction(root)).toBeCloseTo(3, 10);
      expect.soft(reaction(tip)).toBeCloseTo(5, 10);
      expect.soft(result.reactions).toEqual(typed[index].reactions);
      expect.soft(result.displacements).toEqual(typed[index].displacements);
    }
  });
}

for (const nonlinear of [false, true]) {
  it(`#2370 preserves cantilever reactions for a zero-padded planar nodal vector (P-Delta=${nonlinear})`, () => {
    const file = project();
    const [, tip] = file.snapshot.nodes[1]!;
    tip.x = 4;
    const fx = nonlinear ? 0 : 5;
    const fz = -3;
    const moment = -3;
    nodal(file, { fx, fz, my: -moment });
    const solve = () => {
      if (!nonlinear) {
        const result = modelStore.solve();
        if (!result || typeof result === 'string') throw new Error(String(result));
        return result.reactions;
      }
      const result = solvePDelta(modelStore.buildSolverInput()!);
      expect(result.converged).toBe(true);
      return result.results.reactions;
    };
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    const reference = solve();
    expect(reference).toHaveLength(1);
    expect(reference[0]!.rx + fx).toBeCloseTo(0, 4);
    expect(reference[0]!.rz + fz).toBeCloseTo(0, 4);
    expect(-reference[0]!.my + moment - tip.x * fz).toBeCloseTo(0, 4);
    Object.assign(file.snapshot.loads[0]!.data, { fy: 0, mx: 0, mz: 0 });
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    expect(solve()).toEqual(reference);
  });
}

it('#2370 strips only zero padding from a complete planar nodal vector across model intake', async () => {
  const file = project();
  nodal(file, { fx: 5, fz: -3, my: 3, fy: 0, mx: 0, mz: 0 });
  const entry = file.snapshot.loads[0]!;
  const nodeId = file.snapshot.nodes[1]![0];
  const canonical = { fx: 5, fz: -3, my: 3 };
  const check = (data: object | undefined) => {
    expect.soft(data).toMatchObject(canonical);
    for (const axis of ['fy', 'mx', 'mz']) expect.soft(data).not.toHaveProperty(axis);
  };
  const accept = (load: () => unknown) => {
    expect.soft(load).not.toThrow();
    check(modelStore.loads[0]?.data);
  };

  accept(() => modelStore.restore(file.snapshot));
  await expect.soft(loadProject(asFile(file))).resolves.toBeUndefined();
  check(modelStore.loads[0]?.data);
  await expect.soft(loadFile(asFile(file))).resolves.toEqual({ type: 'tab', count: 1 });
  check(modelStore.loads[0]?.data);
  const tab = { id: 'one', name: 'Padded', analysisMode: '2d', modelSnapshot: file.snapshot, undoStack: [], redoStack: [] };
  check(acceptSessionTabs([tab]).tabs[0]?.modelSnapshot.loads[0]?.data);
  check(acceptAutosavePayload(file)?.snapshot.loads[0]?.data);
  expect.soft(() => check(decompressSnapshot(compressSnapshot(file.snapshot))?.loads[0]?.data)).not.toThrow();
  check(decompressSnapshot(LZString.compressToEncodedURIComponent(JSON.stringify(file.snapshot)))?.loads[0]?.data);
  const text = `stabileo-model 1\nnode ${nodeId} 4 0 0\nload nodal 1 nodeId=${nodeId} fx=5 fy=0 fz=-3 mx=0 my=3 mz=0\n`;
  const parsed = codeToModel(text);
  expect.soft(parsed.errors).toEqual([]);
  check(parsed.snapshot?.loads?.[0]?.data);
  expect.soft(() => fragmentFromSnapshot(file.snapshot)).not.toThrow();
  expect.soft(() => fragmentFromJSONModel(fixture(file))).not.toThrow();
  modelStore.clear();
  accept(() => loadFixture(fixture(file), modelStore.fixtureApi() as never));
  await expect.soft(modelStore.loadExample('padded-vector-test', async () => fixture(file))).resolves.toBeUndefined();
  check(modelStore.loads[0]?.data);
  accept(() => modelStore.replaceLoads([entry as never]));
  modelStore.replaceLoads([]);
  accept(() => addLoads([entry as never]));
});

it('#2370 refuses nonzero or invalid out-of-plane vector components before install', () => {
  const file = project();
  nodal(file, { fx: 5, fz: -3, my: 3, fy: 0, mx: 0, mz: 0 });
  const baseline = modelStore.snapshot();
  const entry = file.snapshot.loads[0]!;
  for (const [field, value] of [['fy', -3], ['mx', Number.EPSILON], ['mz', 3], ['mx', null], ['mz', '0']] as const) {
    const snapshot = { ...file.snapshot, loads: [{ ...entry, data: { ...entry.data, [field]: value } }] };
    expect.soft(() => modelStore.restore(snapshot)).toThrow(/outside the plane/);
    expect.soft(modelStore.snapshot()).toEqual(baseline);
  }
  const { mx: _mx, ...withoutMx } = entry.data as Record<string, unknown>;
  expect(() => modelStore.restore({ ...file.snapshot, loads: [{ ...entry, data: withoutMx }] })).toThrow(/my.*mz/);
});
