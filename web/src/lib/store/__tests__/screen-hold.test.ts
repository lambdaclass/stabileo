/**
 * Between a live-calc edit and its re-solve the viewports keep drawing the last picture, and
 * nothing else can read it: the store itself is cleared as on any edit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
