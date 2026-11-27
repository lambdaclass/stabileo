/**
 * Between a live-calc edit and its re-solve the viewports keep drawing the last picture, and
 * nothing else can read it: the store itself is cleared as on any edit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore, resultsStore, uiStore, historyStore, verificationStore } from '..';
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
    for (const s of [...modelStore.supports.values()]) modelStore.updateSupport(s.id, { type: 'rollerX' });
    expect(resultsStore.screen.held).toBe(true);
    await runLiveCalc('2d', uiStore.axisConvention3D);
    expect(uiStore.liveCalcError).toBeTruthy();
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
    resultsStore.forgetView();
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

  it('is dropped by a plain clear', async () => {
    await solvedPortal();
    editE(2);
    resultsStore.clear();
    expect(resultsStore.screen.held).toBe(false);
  });
});

it.each(['reconnect', 'move'])('known wrong result: #1927 — a held diagram cannot follow a %s with identical IDs', async edit => {
  const r = await solvedPortal();
  const e = modelStore.elements.get(r.elementForces[0]!.elementId)!;
  editE(2);
  expect(resultsStore.screen.held).toBe(true);
  if (edit === 'reconnect') {
    const other = [...modelStore.nodes.keys()].find(n => n !== e.nodeI && n !== e.nodeJ)!;
    modelStore.updateElement(e.id, { nodeJ: other });
  } else {
    const n = modelStore.nodes.get(e.nodeJ)!;
    modelStore.updateNode(n.id, n.x + 1, n.y);
  }
  expect(resultsStore.screen.results).toBeNull();
});

it('known wrong result: #1927 — reactions alone remain drawn through a live solve', async () => {
  const r = await solvedPortal();
  resultsStore.diagramType = 'none';
  resultsStore.showReactions = true;
  editE(2);
  expect(resultsStore.screen.results).toBe(r);
  expect(resultsStore.screen.showReactions).toBe(true);
  expect(resultsStore.screen.diagram).toBe('none');
  await runLiveCalc('2d', uiStore.axisConvention3D);
  expect(resultsStore.screen.held).toBe(false);
  expect(resultsStore.screen.results).not.toBeNull();
  expect(resultsStore.screen.diagram).toBe('none');
  expect(resultsStore.screen.showReactions).toBe(true);
});

function solvedCantilever3D(): number {
  uiStore.analysisMode = '3d';
  modelStore.clear();
  const base = modelStore.addNode(0, 0, 0), tip = modelStore.addNode(0, 0, 3);
  const member = modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, 'fixed3d');
  modelStore.addNodalLoad3D(tip, 0, 1, 0, 0, 0, 0);
  const r = modelStore.solve3D(false, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setResults3D(r);
  return member;
}

it.each(['2d', '3d'] as const)('a held stress map uses the solved material until a new %s solve', async mode => {
  const { getSectionProps } = await import('../../viewport3d/results-sync');
  let member: number;
  if (mode === '2d') member = (await solvedPortal()).elementForces[0]!.elementId;
  else {
    member = solvedCantilever3D();
  }
  resultsStore.diagramType = 'colorMap';
  const elem = modelStore.elements.get(member)!;
  const editedFy = 2 * (modelStore.materials.get(elem.materialId)!.fy ?? 1);
  const previous = getSectionProps(member)!;
  modelStore.updateMaterial(elem.materialId, { fy: editedFy });
  expect(resultsStore.screen.held).toBe(true);
  expect(getSectionProps(member)).toEqual(previous);
  uiStore.liveCalc = false;
  expect(resultsStore.screen.held).toBe(false);
  expect(getSectionProps(member)!.fy).toBe(editedFy * 1000);
  expect(getSectionProps(member)).not.toEqual(previous);
});

it.each(['reconnect', 'move'])('drops a held 3D diagram on a %s with identical IDs', edit => {
  const id = solvedCantilever3D();
  const solved = resultsStore.results3D;
  resultsStore.diagramType = 'momentY';
  editE(2);
  expect(resultsStore.screen.held).toBe(true);
  expect(resultsStore.screen.diagram).toBe('momentY');
  expect(resultsStore.screen.results3D).toBe(solved);
  const member = modelStore.elements.get(id)!;
  if (edit === 'reconnect') modelStore.updateElement(id, { nodeI: member.nodeJ, nodeJ: member.nodeI });
  else {
    const node = modelStore.nodes.get(member.nodeJ)!;
    modelStore.updateNode(node.id, node.x, node.y, (node.z ?? 0) + 1);
  }
  expect(resultsStore.screen.results3D).toBeNull();
});

it('known wrong result: #1927 — restoring identical geometry keeps the solved section on a reassigned member', async () => {
  const { getSectionProps } = await import('../../viewport3d/results-sync');
  const r = await solvedPortal();
  const id = r.elementForces[0].elementId;
  const e = modelStore.elements.get(id)!;
  const original = getSectionProps(id);
  whatIf.open();
  whatIf.setMember(id, 'e', 2);
  await vi.waitFor(() => expect(modelStore.elements.get(id)!.materialId).not.toBe(e.materialId));
  expect(resultsStore.results).toBeNull();
  expect(resultsStore.screen.results).toBe(r);
  expect(getSectionProps(id)).toEqual(original);
});

it.skip('known wrong result: #1927 — a held spatial diagram retains its comparison forces, coordinates and stiffness settings', () => {
  const member = solvedCantilever3D();
  const r = resultsStore.results3D!;
  resultsStore.diagramType = 'momentZ';
  resultsStore.setOverlay3D(r, 'reference');
  const overlay = resultsStore.overlayResults3D;
  const node = modelStore.elements.get(member)!.nodeJ;
  const z = modelStore.nodes.get(node)!.z;
  const shear = modelStore.analysis.shearDeformation;
  modelStore.setAnalysis({ shearDeformation: 'none' });
  resultsStore.clear({ keepScreen: true });
  expect(resultsStore.screen.overlayResults3D).toBe(overlay);
  expect(resultsStore.screen.model?.nodes.get(node)?.z).toBe(z);
  expect(resultsStore.screen.model?.analysis.shearDeformation).toBe(shear);
});

it.skip.each(['modeShape', 'bucklingMode'] as const)('known wrong result: #1927 — a held %s keeps the selected displacement field', dt => {
  solvedCantilever3D();
  const r = resultsStore.results3D!;
  const modes = [{ modeNumber: 1, frequency: 1, loadFactor: 1, displacements: r.displacements }];
  if (dt === 'modeShape') resultsStore.setModalResult3D({ modes } as never);
  else resultsStore.setBucklingResult3D({ modes } as never);
  editE(2);
  expect(resultsStore.screen.diagram).toBe(dt);
  expect(resultsStore.screen.modeDisplacements).toEqual(modes[0]!.displacements);
});
