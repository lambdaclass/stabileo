/**
 * A beam too small for its loads: the sheets say no reinforcement is possible with its section and
 * concrete, compute the section and the concrete it verifies with, and apply either to the model as
 * one undoable step that clears the results; solved again, the beam verifies.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { buildSheetRows, setSheetCode } from '../rc-sheets.svelte';
import { beamSections, lineAlternatives, noArrangement, strongerConcretes } from '../rc-sheets-resize';
import { applyAlternative } from '../rc-sheets-apply';
import { lineRowStatus } from '../../rc-sheets/beam-line';
import { patchDesignData, designData } from '../design-data';

beforeAll(async () => { await wasmSolver.initSolver(); });

function solveAndBuild() {
  ensurePhysicalModel(); syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  const rows = buildSheetRows();
  const line = rows.line[0]!;
  const spans = rows.beam.filter((r) => r.demand.line?.group === line.group);
  return { rows, line, spans };
}

async function beamOf(b: number, h: number) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await modelStore.loadExample('rc-beam-flexure');
  const id = [...modelStore.elements.values()][0]!.sectionId;
  modelStore.updateSection(id, { b, h, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12 });
  return id;
}

describe('the sections and concretes an alternative is chosen among', () => {
  it('beams: h in steps of 5 cm from its own, b in steps of 5 cm between h/5 and h/3 and never narrower (FIUBA §3.1)', () => {
    const s = beamSections(0.2, 0.4, 0.6);
    expect(s[0]).toEqual([0.2, 0.45]);
    expect(s).toContainEqual([0.2, 0.6]);
    expect(s.every(([b, h]) => b >= 0.2 - 1e-9 && (b <= Math.max(0.2, h / 3) + 1e-9) && Math.abs(h * 20 - Math.round(h * 20)) < 1e-9 && Math.abs(b * 20 - Math.round(b * 20)) < 1e-9)).toBe(true);
    expect(beamSections(0.15, 0.25, 0.3)).toEqual([[0.15, 0.3]]);
    expect(beamSections(0.1, 0.6, 0.6)).toEqual([[0.15, 0.6], [0.2, 0.6]]);
  });

  it('concretes: the code\'s classes above the one it has, up to the largest allowed, and none when raising it is off', () => {
    modelStore.clear();
    setSheetCode('cirsoc201-2025');
    expect(strongerConcretes(25).map((k) => k.name)).toEqual(['H-30', 'H-35', 'H-40', 'H-45', 'H-50']);
    patchDesignData({ designOptions: { ...(designData().designOptions ?? {}), alternatives: { fcMax: 35, fcClasses: [30, 35, 40] } } });
    expect(strongerConcretes(25).map((k) => k.fc)).toEqual([30, 35]);
    patchDesignData({ designOptions: { ...(designData().designOptions ?? {}), alternatives: { raiseFc: false } } });
    expect(strongerConcretes(25)).toEqual([]);
    setSheetCode('en1992-1-1');
    patchDesignData({ designOptions: { ...(designData().designOptions ?? {}), alternatives: {} } });
    expect(strongerConcretes(25)[0]!.name).toBe('C30/37');
  });
});

describe('a 15×25 beam of 5 m under the flexure post\'s loads', () => {
  it('has no reinforcement possible, and the section it is offered verifies once applied and solved again', async () => {
    const sid = await beamOf(0.15, 0.25);
    setSheetCode('cirsoc201-2025');
    const { line, spans } = solveAndBuild();
    expect(lineRowStatus(line, spans)).toBe('fail');
    expect(noArrangement(line, spans)).toBe(true);
    const alts = lineAlternatives(line, spans);
    const section = alts.find((a) => a.kind === 'section')!;
    expect(section).toBeDefined();
    expect(section.from).toEqual([0.15, 0.25]);
    const [b, h] = section.to;
    expect(h! * 100 % 5).toBeCloseTo(0, 9);
    expect(b!).toBeGreaterThanOrEqual(Math.max(0.15, h! / 5) - 1e-9);

    const before = [...modelStore.elements.values()].map((e) => e.sectionId);
    const sectionsBefore = modelStore.sections.size;
    const shared = modelStore.sections.get(sid)!;
    const done = applyAlternative(line, section)!;
    expect(done.created).toBe(true);
    expect(done.name).toBe(`${line.name} ${Math.round(b! * 100)}×${Math.round(h! * 100)}`);
    expect(modelStore.sections.size).toBe(sectionsBefore + 1);
    expect(modelStore.sections.get(shared.id)!.h).toBeCloseTo(0.25, 9);
    expect(resultsStore.results3D).toBeNull();
    const made = [...modelStore.sections.values()].find((s) => s.name === done.name)!;
    for (const id of modelStore.model.groups.get(line.group)!.members.elements ?? []) expect(modelStore.elements.get(id)!.sectionId).toBe(made.id);

    const again = solveAndBuild();
    expect(lineRowStatus(again.line, again.spans)).not.toBe('fail');
    expect(noArrangement(again.line, again.spans)).toBe(false);

    historyStore.undo();
    expect([...modelStore.elements.values()].map((e) => e.sectionId)).toEqual(before);
  }, 300000);

  it('a 15×32 beam, deep enough to spare its deflection, is offered the weakest stronger class, a material of its own the beam takes, and verifies with it', async () => {
    await beamOf(0.15, 0.32);
    setSheetCode('cirsoc201-2025');
    const { line, spans } = solveAndBuild();
    expect(noArrangement(line, spans)).toBe(true);
    const concrete = lineAlternatives(line, spans).find((a) => a.kind === 'concrete');
    if (!concrete || concrete.kind !== 'concrete') throw new Error('no concrete alternative');
    expect(concrete.from).toBe(25);
    expect(concrete.name).toBe(`H-${concrete.to}`);
    const before = new Set([...modelStore.materials.values()].map((m) => m.id));
    const done = applyAlternative(line, concrete)!;
    expect(done.name).toBe(concrete.name);
    expect(done.created).toBe(true);
    const m = [...modelStore.materials.values()].find((x) => !before.has(x.id))!;
    expect(m.name).toBe(concrete.name);
    expect(m.fc).toBe(concrete.to);
    expect(m.e).toBe(Math.round(4700 * Math.sqrt(concrete.to)));
    for (const id of modelStore.model.groups.get(line.group)!.members.elements ?? []) expect(modelStore.elements.get(id)!.materialId).toBe(m.id);
    const again = solveAndBuild();
    expect(lineRowStatus(again.line, again.spans)).not.toBe('fail');
    const weaker = strongerConcretes(25).filter((k) => k.fc < concrete.to);
    for (const k of weaker) {
      historyStore.undo();
      expect(applyAlternative(again.line, { kind: 'concrete', from: 25, to: k.fc, name: k.name })).not.toBeNull();
      const tried = solveAndBuild();
      expect(lineRowStatus(tried.line, tried.spans), k.name).toBe('fail');
    }
  }, 300000);
});
