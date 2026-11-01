/**
 * Result provenance and determinism (roadmap: "Trust and verification backlog", item 9).
 *
 * The same model solved twice gives bit-identical results; the model hash survives a save and a
 * reopen; a report prints the record and the reproduce comparison reads it back.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { resultsStore } from '../results.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { currentResultProvenance, provenanceLabels, baseSolverInputJson, ensureEngineHashes, engineHashRunCount, captureProvenanceToken, provenanceForExport, ExportChangedError } from '../result-provenance';
import { certificateStore } from '../certificate.svelte';
import { serializeProject, deserializeProject } from '../file';
import { recheckStore } from '../recheck.svelte';
import {
  compareProvenance, parseProvenance, provenanceBlockHtml, modelHash, provenanceTextLines,
} from '../../provenance/result-provenance';
import { buildIdentity } from '../../provenance/build-identity';
import { generateCalcReportHtml } from '../../engine/calc-report';
import { publishCombinations3D } from '../active-results';
import { compareWithResultsOnHand } from '../../actions/reproduce';
import { generateReportHtml, type ReportData } from '../../engine/pro-report';
import { exportResultsCSV, prepareResultsCSV } from '../file';
import { runGlobalSolve, runLiveCalc } from '../../engine/live-calc';
import { ensureResults } from '../../actions/solve';
import { reproduceFrom } from '../../actions/reproduce';
import { currentWorkbookSheets } from '../project-workbook';
import type { ResultProvenance } from '../../provenance/result-provenance';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = true;
  modelStore.clear();
});

/** A small braced frame with loads in two directions: enough shared nodes for summation order to matter. */
function buildFrame(): void {
  const n = [
    modelStore.addNode(0, 0, 0), modelStore.addNode(5, 0, 0), modelStore.addNode(5, 4, 0), modelStore.addNode(0, 4, 0),
    modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3), modelStore.addNode(5, 4, 3), modelStore.addNode(0, 4, 3),
  ];
  for (let i = 0; i < 4; i++) { modelStore.addElement(n[i], n[i + 4], 'frame'); modelStore.addSupport(n[i], 'fixed3d'); }
  for (let i = 0; i < 4; i++) modelStore.addElement(n[4 + i], n[4 + ((i + 1) % 4)], 'frame');
  modelStore.addElement(n[4], n[6], 'truss');
  modelStore.addElement(n[0], n[5], 'truss');
  modelStore.addNodalLoad3D(n[6], 12.5, -3.3, -40.1, 0, 0, 0);
}

function solveMain(): void {
  const r = modelStore.solve3D(uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setResults3D(r);
}

describe('result provenance', () => {
  it('records the build, the engine and every hash', async () => {
    buildFrame();
    solveMain();
    await ensureEngineHashes();
    const p = currentResultProvenance();
    const b = buildIdentity();
    expect(b.wasmHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.wasmHash).toBe(b.wasmHash);
    expect(p.engineVersion).not.toBe('not-loaded');
    expect(p.modelHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.resultsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.settings).toMatchObject({ analysisMode: 'pro', includeSelfWeight: true });
    expect(p.stale).toBe(false);
    expect(p.solvedWith?.resultsVersion).toBe(p.resultsVersion);
    expect(p.engineInputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.engineResultsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('solving the same model twice is bit-identical (web results and engine hashes)', async () => {
    buildFrame();
    solveMain();
    await ensureEngineHashes();
    const a = currentResultProvenance();
    resultsStore.clear();
    solveMain();
    await ensureEngineHashes();
    const b = currentResultProvenance();
    expect(b.resultsHash).toBe(a.resultsHash);
    expect(b.engineResultsSha256).toBe(a.engineResultsSha256);
    expect(b.engineInputSha256).toBe(a.engineInputSha256);
    const v = compareProvenance(a, b);
    expect(v.reproduced).toBe(true);
    expect(v.sameBuild).toBe(true);
  });

  it('the model hash survives a save and a reopen; editing the model changes it', () => {
    buildFrame();
    const before = modelHash(modelStore.snapshot());
    expect(deserializeProject(serializeProject())).toBe(true);
    expect(modelHash(modelStore.snapshot())).toBe(before);
    modelStore.addNode(9, 9, 9);
    expect(modelHash(modelStore.snapshot())).not.toBe(before);
  });

  it('a changed setting is caught by the settings hash, and reproduce says so', () => {
    buildFrame();
    solveMain();
    const a = currentResultProvenance();
    uiStore.includeSelfWeight = false;
    solveMain();
    const b = currentResultProvenance();
    const v = compareProvenance(a, b);
    expect(v.settings).toBe('differs');
    expect(v.results).toBe('differs');
    expect(v.reproduced).toBe(false);
  });

  it('a report prints the block and the reproduce path reads it back from the HTML', () => {
    buildFrame();
    solveMain();
    const p = currentResultProvenance();
    const block = provenanceBlockHtml(p, provenanceLabels());
    expect(block).toContain(p.modelHash);
    expect(block).toContain(p.wasmHash);
    const html = generateCalcReportHtml({
      config: { projectName: 'P', engineerName: '', companyName: '', date: '', notes: '' },
      is3D: true, analysisMode: 'PRO', provenance: { kind: 'single' }, hasDesignChecks: false,
      nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
      results3D: resultsStore.results3D!,
      resultProvenance: { record: p, labels: provenanceLabels() },
    });
    expect(html).toContain('data-testid="report-provenance"');
    const read = parseProvenance(html);
    expect(read).toEqual(p);
    expect(compareProvenance(read!, p).reproduced).toBe(true);
  });

  it('exports the base solve input for the CLI reproduce', () => {
    buildFrame();
    solveMain();
    const b = baseSolverInputJson();
    expect(b?.dim).toBe('3d');
    expect(() => JSON.parse(b!.json)).not.toThrow();
  });

  it('results from an older version are stale in the record until re-solved', async () => {
    buildFrame();
    const file = JSON.parse(serializeProject());
    delete file.snapshot.solvedWith;
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
    expect(recheckStore.stale).toBe(recheckStore.assessment!.changes.length > 0);
    expect(currentResultProvenance().stale).toBe(recheckStore.stale);
    solveMain();
    expect(currentResultProvenance().stale).toBe(false);
  });
});

/** The frame with a live-load case and two combinations, solved with them, as Calcular does. */
function solveWithCombinations(): void {
  buildFrame();
  const top = [...modelStore.nodes.keys()].slice(-1)[0];
  modelStore.addNodalLoad3D(top, 0, 7.5, -12, 0, 0, 0, 2);
  modelStore.addCombination('1.2D+1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
  modelStore.addCombination('1.4D', [{ caseId: 1, factor: 1.4 }]);
  resolveCombinations();
}

/** Solve the model on hand again, with its combinations. */
function resolveCombinations(): void {
  solveMain();
  const c = modelStore.solveCombinations3D(true, false, true);
  if (!c || typeof c === 'string') throw new Error(String(c));
  publishCombinations3D(c);
}

describe('reproduce recomputes the result the report claims, not the one on screen', () => {
  it('a combination report reproduces while the screen shows the base solve', () => {
    solveWithCombinations();
    const comboId = modelStore.model.combinations[0]!.id;
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = comboId;
    const claimed = currentResultProvenance();
    expect(claimed.scopeRef).toEqual({ kind: 'combo', id: comboId });
    resultsStore.activeView = 'single';
    const out = compareWithResultsOnHand(claimed);
    expect(out.ok && out.verdict.status).toBe('reproduced');
    expect(out.ok && out.verdict.shownResults).toBe('match');
  });

  it('a combination hash that does not match is not reproduced, whatever the screen shows', () => {
    solveWithCombinations();
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = modelStore.model.combinations[0]!.id;
    const claimed = { ...currentResultProvenance(), resultsHash: '0'.repeat(64) };
    resultsStore.activeView = 'single';
    const out = compareWithResultsOnHand(claimed);
    expect(out.ok && out.verdict.status).toBe('differs');
    expect(out.ok && out.verdict.reproduced).toBe(false);
  });

  it('a report of the other combination is compared with that combination, and a swapped scope differs', () => {
    solveWithCombinations();
    const [a, b] = modelStore.model.combinations.map((c) => c.id);
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = a!;
    const claimedA = currentResultProvenance();
    // The report claims combination B but carries A's numbers.
    const swapped = { ...claimedA, scopeRef: { kind: 'combo' as const, id: b! } };
    const out = compareWithResultsOnHand(swapped);
    expect(out.ok && out.verdict.status).toBe('differs');
  });

  it('a claimed scope that does not exist here is an incomplete comparison, never success', () => {
    solveWithCombinations();
    const base = currentResultProvenance();
    for (const scopeRef of [
      { kind: 'combo' as const, id: 999 },
      { kind: 'case' as const, id: 999 },
      { kind: 'envelope' as const, name: 'Not here' },
      { kind: 'other' as const, label: 'pdelta' },
    ]) {
      const out = compareWithResultsOnHand({ ...base, scopeRef, scope: 'x', resultsHash: base.resultsHash });
      expect(out.ok && out.verdict.status, JSON.stringify(scopeRef)).toBe('incomplete');
      expect(out.ok && out.verdict.reproduced).toBe(false);
    }
  });

  it('an envelope report without an envelope on hand is incomplete', () => {
    solveWithCombinations();
    resultsStore.activeView = 'envelope';
    const claimed = currentResultProvenance();
    expect(claimed.scopeRef).toEqual({ kind: 'envelope', name: null });
    // The same model solved without its combinations: no envelope.
    resultsStore.clear();
    solveMain();
    const out = compareWithResultsOnHand(claimed);
    expect(out.ok && out.verdict.status).toBe('incomplete');
  });

  it('a record written before scopes were recorded reproduces only a base-solve report', () => {
    solveWithCombinations();
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = modelStore.model.combinations[0]!.id;
    const { scopeRef: _s, ...legacy } = currentResultProvenance();
    const out = compareWithResultsOnHand(legacy as never);
    expect(out.ok && out.verdict.status).toBe('incomplete');
  });
});

describe('the verdict compares every hash the report claims', () => {
  async function pair(): Promise<{ a: ResultProvenance; b: ResultProvenance }> {
    buildFrame();
    solveMain();
    await ensureEngineHashes();
    const a = currentResultProvenance();
    return { a, b: structuredClone(a) };
  }

  it('an engine hash that differs is not reproduced', async () => {
    const { a, b } = await pair();
    expect(compareProvenance(a, b).status).toBe('reproduced');
    expect(compareProvenance({ ...a, engineInputSha256: 'f'.repeat(64) }, b).status).toBe('differs');
    expect(compareProvenance({ ...a, engineResultsSha256: 'f'.repeat(64) }, b).status).toBe('differs');
  });

  it('an engine hash the re-run could not compute is incomplete', async () => {
    const { a, b } = await pair();
    expect(compareProvenance(a, { ...b, engineResultsSha256: null }).status).toBe('incomplete');
  });

  it('a claimed certificate that differs is not reproduced; one not (yet) recomputed is incomplete', async () => {
    const { a, b } = await pair();
    const cert = { scope: 'single', status: 'certified', hash: 'c'.repeat(64) };
    expect(compareProvenance({ ...a, certificates: [cert] }, { ...b, certificates: [cert] }).status).toBe('reproduced');
    expect(compareProvenance({ ...a, certificates: [cert] }, { ...b, certificates: [{ ...cert, hash: 'd'.repeat(64) }] }).status).toBe('differs');
    expect(compareProvenance({ ...a, certificates: [cert] }, { ...b, certificates: [] }).status).toBe('incomplete');
  });

  it('a hash field this build does not know is never ignored: incomplete', async () => {
    const { a, b } = await pair();
    const v = compareProvenance({ ...a, futureCheckSha256: 'e'.repeat(64) } as ResultProvenance, b);
    expect(v.status).toBe('incomplete');
    expect(v.hashes.find((h) => h.field === 'futureCheckSha256')?.verdict).toBe('absent');
  });

  it('a base-solve report: its shown-results hash is checked on its own', async () => {
    const { a, b } = await pair();
    expect(a.scopeRef).toEqual({ kind: 'single' });
    expect(a.resultsHash).toBe(a.baseResultsHash);
    const changed = compareProvenance({ ...a, resultsHash: '9'.repeat(64) }, b);
    expect(changed.status).toBe('differs');
    expect(changed.shownResults).toBe('differs');
    expect(changed.results).toBe('match');
    const missing = compareProvenance({ ...a, resultsHash: null }, b);
    expect(missing.status).toBe('incomplete');
    expect(missing.shownResults).toBe('absent');
  });

  it('a different WASM build is reported, not failed', async () => {
    const { a, b } = await pair();
    const v = compareProvenance({ ...a, wasmHash: '0'.repeat(64) }, b);
    expect(v.status).toBe('reproduced');
    expect(v.sameBuild).toBe(false);
    expect(v.buildDifferences).toContain('wasmHash');
  });
});

describe('every export says STALE for a project not re-run since registered changes', () => {
  function openStale(): void {
    buildFrame();
    const file = JSON.parse(serializeProject());
    delete file.snapshot.solvedWith;
    expect(deserializeProject(JSON.stringify(file))).toBe(true);
    expect(recheckStore.stale).toBe(true);
  }
  const STALE = /STALE/;

  it('the shared text lines (CSV, workbook) open with the status', () => {
    openStale();
    const lines = provenanceTextLines(currentResultProvenance(), provenanceLabels());
    expect(lines[0]![1]).toMatch(STALE);
  });

  it('CSV', () => {
    openStale();
    expect(exportResultsCSV('not solved')).toMatch(STALE);
  });

  it('workbook cover', () => {
    openStale();
    const cover = currentWorkbookSheets(5, { model: false, results: false }).find((s) => s.name === 'Cover')!;
    expect(cover.rows.some((r) => r.some((c) => typeof c === 'string' && STALE.test(c)))).toBe(true);
  });

  it('calc report HTML (and so its print/PDF view)', () => {
    openStale();
    const p = currentResultProvenance();
    const html = generateCalcReportHtml({
      config: { projectName: 'P', engineerName: '', companyName: '', date: '', notes: '' },
      is3D: true, analysisMode: 'PRO', provenance: { kind: 'single' }, hasDesignChecks: false,
      nodes: [], elements: [], materials: [], sections: [], supports: [], loads: [], loadCases: [], combinations: [],
      solveError: 'not solved',
      resultProvenance: { record: p, labels: provenanceLabels() },
    });
    expect(html).toMatch(STALE);
    expect(html).toContain('provenance-stale');
  });

  it('PRO report HTML (and so its print/PDF view)', () => {
    openStale();
    const p = currentResultProvenance();
    const html = provenanceBlockHtml(p, provenanceLabels());
    expect(html).toMatch(STALE);
    // The PRO report appends exactly this block (`pro-report.ts`).
    const full = (() => {
      try {
        return generateReportHtml({
          projectName: 'p', date: 'd', nodes: [], elements: [], materials: [], sections: [], supports: [], loadCount: 0,
          results: { displacements: [], reactions: [], elementForces: [] }, verifications: [], t: (k: string) => k,
          resultProvenance: { record: p, labels: provenanceLabels() },
        } as unknown as ReportData);
      } catch { return null; }
    })();
    expect(full, 'the PRO report renders from minimal data').not.toBeNull();
    expect(full).toMatch(STALE);
  });
});

describe('building a record never solves', () => {
  it('the engine hashes are computed once per base solve, off the record path', async () => {
    buildFrame();
    solveMain();
    const runs = engineHashRunCount();
    // A report, a CSV, a workbook: each builds the record; none of them may start a solve.
    for (let i = 0; i < 3; i++) currentResultProvenance();
    expect(engineHashRunCount()).toBe(runs);
    expect(currentResultProvenance().engineInputSha256).toBeNull();
    await ensureEngineHashes();
    await ensureEngineHashes();
    expect(engineHashRunCount()).toBe(runs + 1);
    expect(currentResultProvenance().engineInputSha256).toMatch(/^[0-9a-f]{64}$/);
    // A new base solve is a new input: hashed again, once.
    resultsStore.clear();
    solveMain();
    expect(currentResultProvenance().engineInputSha256).toBeNull();
    await ensureEngineHashes();
    expect(engineHashRunCount()).toBe(runs + 2);
  });
});

describe('a report of a combination records and checks that combination\'s certificate', () => {
  async function settled(): Promise<void> {
    const until = Date.now() + 60_000;
    await new Promise((r) => setTimeout(r, 400));
    while (certificateStore.computing && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  }

  it('records the displayed combination\'s certificate, not the base solve\'s', async () => {
    solveWithCombinations();
    await settled();
    const id = modelStore.model.combinations[0]!.id;
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = id;
    const p = currentResultProvenance();
    expect(p.certificates.map((c) => c.scope)).toEqual([`combo:${id}`]);
    resultsStore.activeView = 'single';
    const out = compareWithResultsOnHand(p);
    expect(out.ok && out.verdict.status).toBe('reproduced');
  });

  it('a combination certificate that does not match is not reproduced', async () => {
    solveWithCombinations();
    await settled();
    const id = modelStore.model.combinations[0]!.id;
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = id;
    const p = currentResultProvenance();
    const tampered = { ...p, certificates: p.certificates.map((c) => ({ ...c, hash: 'a'.repeat(64) })) };
    const out = compareWithResultsOnHand(tampered);
    expect(out.ok && out.verdict.status).toBe('differs');
  });

  it('a combination certificate that is missing (or still computing) is incomplete', async () => {
    solveWithCombinations();
    await settled();
    const id = modelStore.model.combinations[0]!.id;
    resultsStore.activeView = 'combo';
    resultsStore.activeComboId = id;
    const p = currentResultProvenance();
    expect(p.certificates).toHaveLength(1);
    // Re-solved and re-combined, compared before the combinations are certified again.
    resolveCombinations();
    expect(certificateStore.computing).toBe(true);
    const out = compareWithResultsOnHand(p);
    expect(out.ok && out.verdict.status).toBe('incomplete');
  });
});

describe('an async export never pairs one state\'s data with another\'s provenance', () => {
  it('unchanged: the record describes the state the export started on', async () => {
    buildFrame();
    solveMain();
    const before = currentResultProvenance();
    const p = await provenanceForExport(captureProvenanceToken());
    expect(p.modelHash).toBe(before.modelHash);
    expect(p.resultsHash).toBe(before.resultsHash);
    expect(p.engineInputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a model edit during the await aborts it', async () => {
    buildFrame();
    solveMain();
    const pending = provenanceForExport(captureProvenanceToken());
    modelStore.addNode(42, 42, 42);
    await expect(pending).rejects.toBeInstanceOf(ExportChangedError);
  });

  it('another project opened during the await aborts it', async () => {
    buildFrame();
    solveMain();
    const other = serializeProject();
    const pending = provenanceForExport(captureProvenanceToken());
    expect(deserializeProject(other)).toBe(true);
    await expect(pending).rejects.toBeInstanceOf(ExportChangedError);
  });

  it('a new solve, or another result on screen, during the await aborts it', async () => {
    solveWithCombinations();
    let pending = provenanceForExport(captureProvenanceToken());
    solveMain();
    await expect(pending).rejects.toBeInstanceOf(ExportChangedError);
    pending = provenanceForExport(captureProvenanceToken());
    resultsStore.activeView = 'envelope';
    await expect(pending).rejects.toBeInstanceOf(ExportChangedError);
  });
});

describe('a PRO model with combinations, solved as Calcular solves it', () => {
  async function solvePro(): Promise<void> {
    buildFrame();
    const top = [...modelStore.nodes.keys()].slice(-1)[0];
    modelStore.addNodalLoad3D(top, 0, 7.5, -12, 0, 0, 0, 2);
    modelStore.addCombination('1.2D+1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
    await runGlobalSolve();
    expect(resultsStore.hasCombinations3D).toBe(true);
  }

  it('its report carries engine hashes, the solver input downloads, and reproduce works', async () => {
    await solvePro();
    const input = baseSolverInputJson();
    expect(input?.dim).toBe('3d');
    expect(() => JSON.parse(input!.json)).not.toThrow();
    const p = await provenanceForExport(captureProvenanceToken());
    expect(p.baseSolveMethod).toBe('case-superposition');
    expect(p.engineInputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.engineResultsSha256).toMatch(/^[0-9a-f]{64}$/);
    const out = await reproduceFrom(p);
    expect(out.ok && out.verdict.status).toBe('reproduced');
  });

  it('the CSV, as the first export after a solve, has the engine hashes', async () => {
    await solvePro();
    const csv = await prepareResultsCSV();
    expect(csv).toMatch(/input [0-9a-f]{64} · results [0-9a-f]{64}/);
  });
});

describe('reproducing a direct 3D solve with combinations', () => {
  for (const mode of ['3d', 'pro'] as const) {
    it.each(['manual', 'live'] as const)(`${mode}: preserves the %s solve's arithmetic`, async (entry) => {
      uiStore.analysisMode = mode;
      buildFrame();
      const top = [...modelStore.nodes.keys()].at(-1)!;
      modelStore.addNodalLoad3D(top, 0, 7.5, -12, 0, 0, 0, 2);
      modelStore.addCombination('1.2D+1.6L', [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }]);
      if (entry === 'live') await runLiveCalc(mode, 'rightHand');
      else expect((await ensureResults()).ok).toBe(true);
      const p = await provenanceForExport(captureProvenanceToken());
      expect(p.baseSolveMethod).toBe('direct');
      expect(p.baseResultsHash).not.toBeNull();
      const out = await reproduceFrom(p);
      expect(out.ok && out.verdict.status).toBe('reproduced');

      // Keeping the computation method must not conceal a real change in the model.
      modelStore.addNodalLoad3D(top, 0, 0, -1, 0, 0, 0);
      const changed = await reproduceFrom(p);
      expect(changed.ok && changed.verdict.model).toBe('differs');
      expect(changed.ok && changed.verdict.results).toBe('differs');
    });
  }
});

describe('the basic CSV as the first export after a solve', () => {
  it('has the engine hashes', async () => {
    buildFrame();
    solveMain();
    expect(currentResultProvenance().engineInputSha256).toBeNull();
    const csv = await prepareResultsCSV();
    expect(csv).toMatch(/input [0-9a-f]{64} · results [0-9a-f]{64}/);
  });
});
