import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import LZString from 'lz-string';
import { t, tp } from '../../i18n';
import { initSolver, solvePDelta } from '../../engine/wasm-solver';
import { compressSnapshot, loadFromShareLink, loadFromURLHash } from '../../utils/url-sharing';
import { acceptAutosavePayload, acceptSessionTabs, buildProjectFile, deserializeProject } from '../file';
import { assessProject } from '../../provenance/applicability';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { tabManager } from '../tabs.svelte';
import '../index';

type Project = ReturnType<typeof buildProjectFile>;
const routes = ['file', 'autosave', 'session', 'v1 share', 'v2 share', 'v2 embed', 'data hash', 'embed hash'] as const;

beforeEach(() => {
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '' });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xy';
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  uiStore.drawPlane2D = 'xy';
});

function frame(mode: '2d' | 'pro') {
  uiStore.analysisMode = mode;
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(5, 0);
  modelStore.addElement(root, tip, 'frame');
  modelStore.addSupport(root, mode === '2d' ? 'fixed' : 'fixed3d');
  const force = 10;
  if (mode === '2d') modelStore.addNodalLoad(tip, force, 0);
  else modelStore.addNodalLoad3D(tip, force, 0, 0, 0, 0, 0);
  const connector = modelStore.addConnector({ nodeI: root, nodeJ: tip, kAxial: 1000 });
  const second = modelStore.addConnector({ nodeI: root, nodeJ: tip, kAxial: 2000 });
  return { root, tip, force, connector, second, file: buildProjectFile() };
}

function duplicate(file: Project): Project {
  const [first, second] = file.snapshot.connectors!;
  return { ...file, snapshot: { ...file.snapshot, connectors: [first, [first[0], { ...second[1], id: first[0] }]] } };
}

function sharePayload(file: Project, route: typeof routes[number]) {
  const { nodes, materials, sections, elements, supports, loads, connectors, constraints, nextId, drawPlane2D } = file.snapshot;
  if (route === 'v1 share') {
    return LZString.compressToEncodedURIComponent(JSON.stringify({
      analysisMode: file.analysisMode, nodes, materials, sections, elements, supports, loads, connectors, constraints, nextId, drawPlane2D,
    }));
  }
  const compressed = compressSnapshot({ ...file.snapshot, drawPlane2D: undefined, analysisMode: file.analysisMode });
  const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(compressed.slice(2), 'base64url'))));
  compact.dp = drawPlane2D;
  return '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(compact)))).toString('base64url');
}

function open(file: Project, route: typeof routes[number]) {
  const report = vi.fn();
  const toast = vi.spyOn(uiStore, 'toast');
  let opened: boolean;
  if (route === 'file') {
    opened = deserializeProject(JSON.stringify(file));
  } else if (route === 'autosave') {
    opened = acceptAutosavePayload(file, report) !== null;
  } else if (route === 'session') {
    const verdict = acceptSessionTabs([{
      id: 'stored', name: file.name, analysisMode: file.analysisMode, modelSnapshot: file.snapshot,
      undoStack: [], redoStack: [],
    }]);
    opened = verdict.tabs.length > 0;
    report(verdict.dropped[0]?.reason);
  } else {
    const kind = route === 'v2 embed' || route === 'embed hash' ? 'embed' : 'data';
    const hash = `#${kind}=${sharePayload(file, route)}`;
    if (route.endsWith('hash')) {
      location.hash = hash;
      opened = loadFromURLHash() !== null;
    } else {
      opened = loadFromShareLink(hash);
    }
  }
  const messages = [...report.mock.calls, ...toast.mock.calls].map(([message]) => message);
  toast.mockRestore();
  return { opened, messages };
}

it.each(routes)('known wrong result: #2588 — %s refuses duplicate connector keys', route => {
  const { file, connector } = frame('pro');
  const before = modelStore.snapshot();
  const result = open(duplicate(file), route);
  expect.soft(result.opened).toBe(false);
  expect.soft(result.messages).toContain(tp('svc.engine.invalidInputField', { path: `connectors.${connector}` }));
  expect(modelStore.snapshot()).toEqual(before);
});

it.each(['2d', 'pro'] as const)('known wrong result: #2588 — %s restore refuses duplicate connector keys before install', mode => {
  const { file, connector } = frame(mode);
  const before = modelStore.snapshot();
  const beforeInstall = vi.fn();
  expect.soft(() => modelStore.restore(duplicate(file).snapshot, beforeInstall)).toThrow(
    tp('svc.engine.invalidInputField', { path: `connectors.${connector}` }),
  );
  expect.soft(beforeInstall).not.toHaveBeenCalled();
  expect(modelStore.snapshot()).toEqual(before);
});

it.each(routes)('known wrong result: #2588 — %s refuses an invalid saved plane', route => {
  const { file } = frame('2d');
  uiStore.analysisMode = 'pro';
  uiStore.drawPlane2D = 'yz';
  const before = modelStore.snapshot();
  const invalid = { ...file, snapshot: { ...file.snapshot, drawPlane2D: 'yx' } } as unknown as Project;
  const result = open(invalid, route);
  expect.soft(result.opened).toBe(false);
  expect.soft(result.messages).toContain(tp('svc.engine.invalidInputField', { path: 'drawPlane2D' }));
  expect.soft(uiStore.analysisMode).toBe('pro');
  expect.soft(uiStore.drawPlane2D).toBe('yz');
  expect(modelStore.snapshot()).toEqual(before);
});

it.each([null, '', false, 0])('known wrong result: #2588 — a supplied plane of %j is refused', drawPlane2D => {
  const { file } = frame('pro');
  const invalid = { ...file, snapshot: { ...file.snapshot, drawPlane2D } } as unknown as Project;
  for (const route of ['file', 'v2 share'] as const) {
    const result = open(invalid, route);
    expect.soft(result.opened).toBe(false);
    expect.soft(result.messages).toContain(tp('svc.engine.invalidInputField', { path: 'drawPlane2D' }));
  }
});

it.each(['2d', 'pro'] as const)('solves a restored %s project with distinct connector keys', async mode => {
  await initSolver();
  const { file, root, tip, force, connector, second } = frame(mode);
  const solve = () => mode === '2d' ? modelStore.solve(false, 'xy') : modelStore.solve3D(false, false, true);
  const reference = solve();
  expect(reference).toMatchObject({ displacements: expect.arrayContaining([expect.objectContaining({ nodeId: tip, ux: expect.any(Number) })]) });
  if (!reference || typeof reference === 'string') throw new Error(String(reference));
  const reaction = reference.reactions.find(r => r.nodeId === root);
  expect(reaction && ('fx' in reaction ? reaction.fx : reaction.rx)).toBeCloseTo(-force);
  expect(open(file, 'file').opened).toBe(true);
  expect([...modelStore.connectors.keys()]).toEqual([connector, second]);
  expect(solve()).toEqual(reference);
});

it.each(['xy', 'xz', 'yz', undefined] as const)('opens the saved plane %s through file and share', drawPlane2D => {
  const { file } = frame('2d');
  const project = { ...file, snapshot: { ...file.snapshot, drawPlane2D } };
  for (const route of ['file', 'v1 share', 'v2 share'] as const) {
    uiStore.drawPlane2D = 'yz';
    expect(open(project, route).opened).toBe(true);
    expect(uiStore.drawPlane2D).toBe(drawPlane2D ?? 'xy');
  }
});

function duplicateNode(file: Project): Project {
  const nodes = file.snapshot.nodes;
  const [key, tip] = nodes[1]!;
  return { ...file, snapshot: { ...file.snapshot, nodes: [...nodes, [key, { ...tip, x: 6 }]] } };
}

it.each(routes)('known wrong result: #2588 — %s refuses conflicting node rows before restore', route => {
  const { file, tip } = frame('2d');
  const before = modelStore.snapshot();
  const invalid = duplicateNode(file);
  const result = open(invalid, route);
  expect.soft(result.opened).toBe(false);
  expect.soft(result.messages).toContain(tp('svc.engine.invalidInputField', { path: `nodes.${tip}` }));
  expect(modelStore.snapshot()).toEqual(before);
});

it.each(['2d', 'pro'] as const)('known wrong result: #2588 — %s restore refuses a conflicting span', async mode => {
  await initSolver();
  const { file, root, tip, force } = frame(mode);
  const original = { ...file.snapshot, connectors: [] };
  const solve = () => mode === '2d' ? modelStore.solve(false, 'xy') : modelStore.solve3D(false, false, true);
  modelStore.restore(original);
  const reference = solve();
  expect(reference).toMatchObject({ displacements: expect.arrayContaining([expect.objectContaining({ nodeId: tip, ux: expect.any(Number) })]) });
  if (!reference || typeof reference === 'string') throw new Error(String(reference));
  const reaction = reference.reactions.find(r => r.nodeId === root);
  expect(reaction && ('fx' in reaction ? reaction.fx : reaction.rx)).toBeCloseTo(-force);
  const moved = duplicateNode({ ...file, snapshot: original }).snapshot;
  modelStore.restore({ ...moved, nodes: [moved.nodes[0]!, moved.nodes[2]!] });
  const longer = solve();
  if (!longer || typeof longer === 'string') throw new Error(String(longer));
  const displacement = (result: typeof reference) => result.displacements.find(d => d.nodeId === tip)!.ux;
  expect(displacement(longer) / displacement(reference)).toBeCloseTo(6 / 5);
  modelStore.restore(original);
  const before = modelStore.snapshot();
  const beforeInstall = vi.fn();
  expect.soft(() => modelStore.restore(moved, beforeInstall)).toThrow(
    tp('svc.engine.invalidInputField', { path: `nodes.${tip}` }),
  );
  expect.soft(beforeInstall).not.toHaveBeenCalled();
  expect(modelStore.snapshot()).toEqual(before);
});

it.each(['elements', 'materials', 'sections', 'supports', 'plates', 'quads', 'groups', 'footings'] as const)(
  'known wrong result: #2588 — restore refuses a repeated key in %s', table => {
    const { file } = frame('pro');
    const { snapshot } = file;
    const row = snapshot[table]?.[0] ?? [1, { id: 1 }];
    const invalid = { ...snapshot, [table]: [row, row] };
    const beforeInstall = vi.fn();
    expect.soft(() => modelStore.restore(invalid, beforeInstall)).toThrow(
      tp('svc.engine.invalidInputField', { path: `${table}.${row[0]}` }),
    );
    expect(beforeInstall).not.toHaveBeenCalled();
  },
);

it('#2588 restores spatial constraints from a tab during a planar session', () => {
  const { root, tip } = frame('pro');
  modelStore.addConstraint({ type: 'equalDOF', masterNode: root, slaveNode: tip, dofs: [1] });
  const file = buildProjectFile();
  expect(file.snapshot.drawPlane2D).toBeUndefined();
  tabManager.init();
  const saved = {
    ...tabManager.activeTab!,
    modelSnapshot: file.snapshot,
    analysisMode: 'pro' as const,
  };
  uiStore.analysisMode = '2d';
  modelStore.clear();
  tabManager.restoreSession([saved], saved.id);
  expect(uiStore.analysisMode).toBe('pro');
  expect(modelStore.model.constraints).toEqual(file.snapshot.constraints);
});

it.skip.each(routes)('known wrong result: #2588 — %s refuses an implicit default rigid link without its plane', route => {
  const { file, root, tip } = frame('2d');
  file.snapshot.drawPlane2D = undefined;
  const link = { type: 'rigidLink' as const, masterNode: root, slaveNode: tip };
  const before = modelStore.snapshot();
  for (const dofs of [undefined, [], [0, 1, 2], [0, 1, 2, 3, 4, 5]]) {
    file.snapshot.constraints = [dofs === undefined ? link : { ...link, dofs }];
    const result = open(file, route);
    expect.soft(result.opened, String(dofs)).toBe(false);
    expect.soft(result.messages, String(dofs)).toContain(`${t('svc.savedPlaneRequired')} constraints[0]`);
    expect.soft(modelStore.snapshot(), String(dofs)).toEqual(before);
    expect.soft(assessProject({ ...file.snapshot, analysisMode: '2d' }, null, '2d').changes.map(c => c.id))
      .toContain('xy-constraint-projection');
  }
});

it.each(['xy', 'xz'] as const)('solves default rigid links in explicit %s with the same translations as a listed mask', async plane => {
  await initSolver();
  const { file, root, tip } = frame('2d');
  const link = { type: 'rigidLink' as const, masterNode: root, slaveNode: tip };
  file.snapshot.drawPlane2D = plane;
  const analyze = (dofs?: number[]) => {
    file.snapshot.constraints = [dofs === undefined ? link : { ...link, dofs }];
    expect(open(file, 'file').opened).toBe(true);
    const linear = modelStore.solve();
    expect(linear).toMatchObject({ displacements: expect.arrayContaining([expect.objectContaining({ nodeId: tip, ux: 0 })]) });
    return { linear, nonlinear: solvePDelta(modelStore.buildSolverInput()!).results };
  };
  const reference = analyze([0, 1, 2]);
  expect(analyze()).toEqual(reference);
  expect(analyze([])).toEqual(reference);

  file.snapshot.drawPlane2D = undefined;
  file.snapshot.constraints = [{ ...link, dofs: [0] }];
  expect(open(file, 'file').opened).toBe(true);
  expect(modelStore.solve()).toMatchObject({ displacements: expect.arrayContaining([
    expect.objectContaining({ nodeId: tip, ux: 0 }),
  ]) });
});

it('solves an unstamped spatial project with a default rigid link', async () => {
  await initSolver();
  const { file, root, tip } = frame('pro');
  file.snapshot.constraints = [{ type: 'rigidLink', masterNode: root, slaveNode: tip }];
  expect(open(file, 'file').opened).toBe(true);
  expect(modelStore.solve3D(false, false, true)).toMatchObject({ displacements: expect.arrayContaining([
    expect.objectContaining({ nodeId: tip, ux: 0 }),
  ]) });
});

it.skip('known wrong result: #2588 — a legacy v1 share with a guidedX support opens with a blocked solve', () => {
  const { file, tip } = frame('2d');
  file.snapshot.drawPlane2D = undefined;
  file.snapshot.supports.push([2, { id: 2, nodeId: tip, type: 'guidedX' }]);
  file.snapshot.nextId.support = 3;
  expect(open(file, 'v1 share').opened).toBe(true);
  expect.soft(modelStore.snapshot().drawPlane2D).toBeUndefined();
  expect(modelStore.solve()).toBe(t('svc.savedPlaneRequired'));
});
