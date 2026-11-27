/**
 * Between a live-calc edit and its re-solve the viewports keep drawing the last picture, and
 * nothing else can read it: the store itself is cleared as on any edit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { modelStore, resultsStore, uiStore, historyStore, verificationStore, tabManager } from '..';
import { buildProjectFile, deserializeProject } from '../file';
import { whatIf } from '../whatif.svelte';
import { runLiveCalc } from '../../engine/live-calc';
import { initSolver } from '../../engine/wasm-solver';
import type { AnalysisResults } from '../../engine/types';

async function solvedPortal(): Promise<AnalysisResults> {
  await modelStore.loadExample('portal-frame');
  const r = modelStore.solve(false, uiStore.drawPlane2D);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setResults(r);
  resultsStore.diagramType = 'moment';
  return resultsStore.results!;
}

function editE(factor: number): void {
  const [id, mat] = [...modelStore.materials.entries()][0];
  modelStore.updateMaterial(id, { e: mat.e * factor });
}

beforeEach(async () => {
  await initSolver();
  whatIf.abandon();
  historyStore.clear();
  uiStore.analysisMode = '2d';
  uiStore.liveCalc = true;
});
afterEach(() => {
  whatIf.abandon();
  uiStore.liveCalc = false;
  resultsStore.clear();
  resultsStore.forgetView();
  modelStore.clear();
});

describe('the picture held for a live re-solve', () => {
  it('is drawn while every store reader sees the results cleared', async () => {
    const shown = await solvedPortal();
    const revision = verificationStore.analysisRevision;
    editE(2);

    expect(resultsStore.results).toBeNull();
    expect(resultsStore.results3D).toBeNull();
    expect(resultsStore.hasAnyResults).toBe(false);
    expect(resultsStore.diagramType).toBe('none');
    expect(resultsStore.getElementForces(shown.elementForces[0].elementId)).toBeUndefined();
    expect(verificationStore.analysisRevision).toBeGreaterThan(revision);

    expect(resultsStore.screen.held).toBe(true);
    expect(resultsStore.screen.results).toBe(shown);
    expect(resultsStore.screen.diagram).toBe('moment');
  });

  it('survives further edits before the re-solve, and gives way to it', async () => {
    const shown = await solvedPortal();
    editE(2);
    editE(1.5);
    expect(resultsStore.screen.results).toBe(shown);

    await runLiveCalc('2d', uiStore.axisConvention3D);
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results).toBe(resultsStore.results);
    expect(resultsStore.results).not.toBeNull();
    expect(resultsStore.results).not.toBe(shown);
    expect(resultsStore.diagramType).toBe('moment');
  });

  it('follows a diagram picked while the re-solve is pending', async () => {
    await solvedPortal();
    editE(2);
    resultsStore.diagramType = 'shear';
    expect(resultsStore.screen.diagram).toBe('shear');
    resultsStore.diagramType = 'none';
    expect(resultsStore.screen.held).toBe(false);
  });

  it('is not taken when live calc is off', async () => {
    await solvedPortal();
    uiStore.liveCalc = false;
    editE(2);
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results).toBeNull();
    expect(resultsStore.screen.diagram).toBe('none');
  });

  it('is dropped when the re-solve finds a mechanism', async () => {
    await solvedPortal();
    for (const support of modelStore.supports.values()) modelStore.updateSupport(support.id, { type: 'rollerX' });
    expect(resultsStore.screen.held).toBe(true);
    await runLiveCalc('2d', uiStore.axisConvention3D);
    expect(uiStore.liveCalcError).toMatch(/mechanism|singular|unstable|hipostática|mecanismo/i);
    expect(resultsStore.results).toBeNull();
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results).toBeNull();
  });

  it('is dropped by another project, a tab or file open, and a 3D clear', async () => {
    await solvedPortal();
    editE(2);
    await modelStore.loadExample('portal-frame');
    expect(resultsStore.screen.held).toBe(false);

    await solvedPortal();
    editE(2);
    const file = JSON.stringify(buildProjectFile());
    expect(resultsStore.screen.held).toBe(true);
    expect(deserializeProject(file)).toBe(true);
    expect(resultsStore.screen.results).toBeNull();

    tabManager.init();
    const other = tabManager.activeTabId!;
    tabManager.createTab();
    await solvedPortal();
    editE(2);
    expect(resultsStore.screen.held).toBe(true);
    tabManager.switchTab(other);
    expect(resultsStore.screen.held).toBe(false);

    await solvedPortal();
    editE(2);
    resultsStore.clear3D();
    expect(resultsStore.screen.held).toBe(false);
  });

  it('is not drawn on a model that lost a member it names', async () => {
    const shown = await solvedPortal();
    editE(2);
    expect(resultsStore.screen.results).toBe(shown);
    modelStore.removeElement(shown.elementForces[0].elementId);
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results).toBeNull();
  });

  it('keeps a detached copy of both member endpoints until a node edit invalidates the diagram', async () => {
    const r = await solvedPortal();
    const member = modelStore.elements.get(r.elementForces[0].elementId)!;
    const endpoints = [member.nodeI, member.nodeJ].map(id => ({ ...modelStore.nodes.get(id)! }));
    editE(2);
    const model = resultsStore.screen.model!;
    expect(endpoints.map(n => model.nodes.get(n.id))).toEqual(endpoints);
    const tip = endpoints[1]!;
    modelStore.updateNode(tip.id, tip.x + 1, tip.y);
    expect(endpoints.map(n => model.nodes.get(n.id))).toEqual(endpoints);
    expect(resultsStore.screen.held).toBe(false);
  });

  it('drops a space reaction on a restraint edit while keeping the unchanged support control', async () => {
    await modelStore.loadExample('3d-portal-frame');
    const r = modelStore.solve3D();
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    resultsStore.diagramType = 'momentY';
    resultsStore.clear({ keepScreen: true });
    expect(resultsStore.screen.held).toBe(true);
    const support = [...modelStore.supports.values()][0]!;
    modelStore.updateSupport(support.id, { type: 'pinned3d' });
    expect(resultsStore.screen.results3D).toBeNull();
    expect(resultsStore.screen.held).toBe(false);
  });

  it('drops reactions when a support moves between existing nodes', async () => {
    await solvedPortal();
    const support = [...modelStore.supports.values()][0]!;
    const free = [...modelStore.nodes.keys()].find(id => ![...modelStore.supports.values()].some(s => s.nodeId === id))!;
    modelStore.updateSupport(support.id, { nodeId: free });
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results).toBeNull();
  });

  it('is dropped by a plain clear', async () => {
    await solvedPortal();
    editE(2);
    resultsStore.clear();
    expect(resultsStore.screen.held).toBe(false);
  });
});

it('drops the full-span picture after a split that retains the member ID', async () => {
  const r = await solvedPortal();
  const id = r.elementForces[0].elementId;
  modelStore.splitMember(id, [0.5], { keepOriginalId: true });
  expect(resultsStore.screen.held).toBe(false);
  expect(resultsStore.screen.results).toBeNull();
});

it('holds the solved section when a new section modulus is requested', async () => {
  const r = await solvedPortal();
  const member = modelStore.elements.get(r.elementForces[0].elementId)!;
  const section = modelStore.sections.get(member.sectionId)!;
  resultsStore.diagramType = 'colorMap';
  resultsStore.colorMapKind = 'sigmaMax';
  const original = section.iy;
  if (original === undefined) throw new Error('Missing test section inertia');
  modelStore.updateSection(section.id, { iy: original * 2 });
  expect(resultsStore.screen.held).toBe(true);
  expect(resultsStore.screen.model?.sections.get(member.sectionId)?.iy).toBe(original);
  const painted = resultsStore.screen.model?.elements.get(member.id);
  expect(painted).toMatchObject({ id: member.id, nodeI: member.nodeI, nodeJ: member.nodeJ, releaseI: member.releaseI, releaseJ: member.releaseJ });
  expect(painted?.releaseI).not.toBe(member.releaseI);
});

it.each(['2d', '3d'] as const)('keeps the applied loads consistent with the pending %s frame', async mode => {
  uiStore.analysisMode = mode;
  await modelStore.loadExample(mode === '2d' ? 'portal-frame' : '3d-portal-frame');
  const load = modelStore.loads[0];
  const old = JSON.parse(JSON.stringify(modelStore.loads));
  if (mode === '2d') await solvedPortal();
  else {
    const r = modelStore.solve3D();
    if (!r || typeof r === 'string') throw Error(String(r));
    resultsStore.setResults3D(r);
    resultsStore.diagramType = 'momentY';
  }
  modelStore.removeLoad(load.data.id);
  if (mode === '2d') {
    expect(resultsStore.screen.held).toBe(true);
    expect(resultsStore.screen.model).toMatchObject({ loads: old });
  } else {
    expect(resultsStore.screen.held).toBe(false);
    expect(resultsStore.screen.results3D).toBeNull();
  }
});

it.each(['plate', 'quad', 'curved'] as const)('drops a space reaction when only the %s is removed', async kind => {
  uiStore.analysisMode = '3d';
  await modelStore.loadExample('3d-portal-frame');
  const frame = modelStore.solve3D();
  if (!frame || typeof frame === 'string') throw Error(String(frame));
  const nodes = [...modelStore.nodes.keys()].slice(0, 4) as [number, number, number, number];
  const shell = kind === 'plate' ? modelStore.addPlate([nodes[0], nodes[1], nodes[2]], 1, 0.2)
    : modelStore.addQuad(nodes, 1, 0.2, { curved: kind === 'curved' });
  resultsStore.setResults3D(frame);
  resultsStore.diagramType = 'momentY';
  resultsStore.clear({ keepScreen: true });
  expect(resultsStore.screen.held).toBe(true);
  const before = [...modelStore.nodes.keys()];
  if (kind === 'plate') modelStore.removePlate(shell);
  else modelStore.removeQuad(shell);
  expect([...modelStore.nodes.keys()]).toEqual(before);
  expect(resultsStore.screen.results3D).toBeNull();
});

it.each(['quad9s', 'solidShells', 'curvedShells'])('invalidates a space publication when the %s collection changes', async key => {
  uiStore.analysisMode = '3d';
  await modelStore.loadExample('3d-portal-frame');
  const result = modelStore.solve3D();
  if (!result || typeof result === 'string') throw Error(String(result));
  const source = modelStore.model as unknown as Record<string, unknown>;
  const nodes = [...modelStore.nodes.keys()];
  try {
    source[key] = new Map([[7, { id: 7, nodes }]]);
    modelStore.bumpModelVersion();
    resultsStore.setResults3D(result);
    resultsStore.diagramType = 'momentY';
    resultsStore.clear({ keepScreen: true });
    expect(resultsStore.screen.held).toBe(true);
    source[key] = new Map();
    modelStore.bumpModelVersion();
    expect([...modelStore.nodes.keys()]).toEqual(nodes);
    expect(resultsStore.screen.held).toBe(false);
  } finally {
    delete source[key];
  }
});

it.each(['plate', 'quad'] as const)('updates a shell-only %s after a live load edit', async kind => {
  modelStore.clear();
  uiStore.analysisMode = '3d';
  const nodes = [[0, 0], [2, 0], [2, 1], [0, 1]].map(([x, y]) => modelStore.addNode(x, y, 0));
  const shell = kind === 'plate' ? modelStore.addPlate([nodes[0], nodes[1], nodes[2]], 1, 0.2)
    : modelStore.addQuad(nodes as [number, number, number, number], 1, 0.2);
  for (const id of nodes.slice(0, kind === 'plate' ? 3 : 4)) modelStore.addSupport(id, 'fixed3d');
  const pressure = -3;
  const load = () => modelStore.addSurfaceLoad3D(shell, pressure, undefined, kind === 'plate' ? { on: 'plate' } : {});
  const reaction = () => resultsStore.results3D?.reactions.reduce((sum, r) => sum + r.fz, 0);
  for (const factor of [1, 2]) {
    load();
    await runLiveCalc('3d', uiStore.axisConvention3D);
    expect(reaction()).toBeCloseTo(-pressure * (kind === 'plate' ? 1 : 2) * factor, 8);
  }
});
