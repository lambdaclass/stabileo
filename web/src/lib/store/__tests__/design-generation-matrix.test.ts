import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { modelStore, resultsStore, uiStore } from '..';
import { designRunStore } from '../design-run.svelte';
import { detailingStore } from '../detailing.svelte';
import { verificationStore } from '../verification.svelte';
import { currentFrameDesignQuality } from './design-quality-fixture';
import { designWithResizing } from '../design-resize';
import { DEFAULT_RUN_MS } from '../../engine/design/candidate-search';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';

// Fresh end-to-end designs, never a saved assignment or a hand-selected repair target.
// STABILEO_DESIGN_MATRIX=1 STABILEO_DESIGN_MATRIX_OUT=/tmp/generation.json npx vitest run --project unit src/lib/store/__tests__/design-generation-matrix.test.ts
// Default: the workspace sizing cycle, including section changes and fresh analysis.
// RESIZE=0 measures just the first sizing pass; CONTROL=1 disables the new physical search.
const examples = ['rc-beam-flexure', 'rc-design-qa-8', 'rc-design-qa-row2', 'rc-design-qa-seismic', 'rc-design-frame', 'pro-edificio-7p']
  .filter(id => !process.env.STABILEO_DESIGN_MATRIX_EXAMPLE || id === process.env.STABILEO_DESIGN_MATRIX_EXAMPLE);
const records: unknown[] = [];
afterEach(() => vi.restoreAllMocks());

it.runIf(process.env.STABILEO_DESIGN_MATRIX === '1').each(examples)('generates and retains a design from scratch: %s', async example => {
  modelStore.clear(); resultsStore.clear(); verificationStore.clear(); detailingStore.clear();
  designRunStore.resetMarks();
  await modelStore.loadExample(example);
  uiStore.analysisMode = 'pro';
  modelStore.reinforcementTransaction(api => {
    for (const id of modelStore.elements.keys()) api.setReinforcement(id, undefined);
  });
  expect([...modelStore.elements.values()].every(e => !e.reinforcement)).toBe(true);
  const analysisStart = performance.now();
  const combinations = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (!combinations || typeof combinations === 'string') throw new Error(String(combinations));
  const solved = validateAndSolve3D(modelStore.model as never, true, false);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setResults3D(solved);
  resultsStore.setCombinationResults3D(combinations.perCase, combinations.perCombo, combinations.envelope);
  const analysisMs = performance.now() - analysisStart;
  const useResize = process.env.STABILEO_DESIGN_MATRIX_RESIZE !== '0';
  const nominalBudgetMs = Number(process.env.STABILEO_DESIGN_MATRIX_RUN_MS ?? (useResize ? DEFAULT_RUN_MS : 180_000));
  let beforeRepair: ReturnType<typeof currentFrameDesignQuality> | undefined;
  const detailPasses: Array<{ detailingRuns: number; memberSearches: number; verifierCalls: number;
    changed: number[]; aborted: boolean; notReached: number }> = [];
  const generate = detailingStore.generate;
  vi.spyOn(detailingStore, 'generate').mockImplementation(options => {
    if (useResize && options?.physicalSearch) beforeRepair = currentFrameDesignQuality();
    const result = generate(process.env.STABILEO_DESIGN_MATRIX_CONTROL === '1'
      ? { ...options, physicalSearch: undefined } : options);
    expect(result, detailingStore.lastError ?? '').not.toBeNull();
    const search = detailingStore.lastFeedbackLoop?.physicalSearch;
    detailPasses.push({ detailingRuns: search?.stats.detailingRuns ?? 0,
      memberSearches: search?.stats.memberSearches ?? 0, verifierCalls: search?.stats.verifierCalls ?? 0,
      changed: search?.changed ?? [], aborted: verificationStore.runSummary?.aborted ?? false,
      notReached: verificationStore.runSummary?.notReached ?? 0 });
    return result;
  });
  const designStart = performance.now();
  const designCpuStart = process.cpuUsage();
  const resize = useResize
    ? await designWithResizing({ families: ['column', 'beam'], edited: 'keep', steel: false,
      maxRunMs: nominalBudgetMs }) : undefined;
  if (resize) expect(resize.report.concrete?.ok).toBe(true);
  else expect(designRunStore.designAll({ maxRunMs: nominalBudgetMs })).toMatchObject({ ok: true });
  const designMs = performance.now() - designStart;
  const designCpu = process.cpuUsage(designCpuStart);
  const designCpuMs = (designCpu.user + designCpu.system) / 1000;
  const quality = currentFrameDesignQuality();
  const complete = verificationStore.contexts.size > 0 && quality.verifiedIds.length === verificationStore.contexts.size
    && !quality.output.aborted && quality.output.notReached === 0;
  if (resize?.stopped === 'verified') expect(complete, 'a completed sizing run needs every final member verdict').toBe(true);
  const search = detailingStore.lastFeedbackLoop?.physicalSearch;
  const record = { example, nominalBudgetMs, beforeRepair, elements: modelStore.elements.size, complete, analysisMs, designMs, designCpuMs, detailPasses: [...detailPasses], ...quality,
    resize: resize ? { rounds: resize.rounds, stopped: resize.stopped, changes: resize.changes } : null,
    search: search ? { stats: search.stats, changed: search.changed, termination: search.termination, trials: search.trials } : null,
    members: [...verificationStore.contexts].map(([id, ctx]) => ({ id, kind: ctx.elementType, section: ctx.section,
      outcome: verificationStore.outcomeFor(id)?.outcome, reinforcement: modelStore.elements.get(id)?.reinforcement,
      failures: verificationStore.outcomeFor(id)?.provisional?.verdict.checks.filter(c => c.status === 'fail'),
    })),
    conflicts: detailingStore.lastRun?.assemblies.flatMap(a => a.conflicts.filter(c => c.severity !== 'marginal')),
  };
  records.push(record);
  writeFileSync(process.env.STABILEO_DESIGN_MATRIX_OUT ?? '/tmp/design-generation-matrix.json', JSON.stringify(records, null, 2));
  console.log(JSON.stringify({ ...record, members: undefined, conflicts: undefined,
    resize: resize ? { rounds: resize.rounds, stopped: resize.stopped, changes: resize.changes.length } : null,
    search: search ? { stats: search.stats, changed: search.changed, termination: search.termination } : null }));
  expect(quality.output.aborted).toBe(false);
  expect(quality.output.notReached).toBe(0);
  expect(quality.output.passingWithBlockingConflicts).toEqual([]);
  expect(quality.output.passingWithoutFinalVerification).toEqual([]);
  if (beforeRepair) {
    expect(quality.verifiedIds).toEqual(expect.arrayContaining(beforeRepair.verifiedIds));
    expect(quality.output.blockingConflicts).toBeLessThanOrEqual(beforeRepair.output.blockingConflicts);
    expect(quality.output.exhausted).toBeLessThanOrEqual(beforeRepair.output.exhausted);
    expect(detailPasses.reduce((n, p) => n + p.detailingRuns, 0)).toBeLessThanOrEqual(4);
  }
  expect(detailPasses.every(p => !p.aborted && p.notReached === 0), 'every nominal pass must reach its scope').toBe(true);
  if (process.env.STABILEO_DESIGN_MATRIX_BASELINE) {
    const before = JSON.parse(readFileSync(process.env.STABILEO_DESIGN_MATRIX_BASELINE, 'utf8'))
      .find((r: { example: string }) => r.example === example);
    expect(before, 'each case needs a measured baseline').toBeDefined();
    expect(!!before.resize, 'compare the same sizing mode').toBe(!!resize);
    expect(quality.verifiedIds).toEqual(expect.arrayContaining(before.verifiedIds));
    expect(quality.output.blockingConflicts).toBeLessThanOrEqual(before.output.blockingConflicts);
    expect(quality.output.exhausted).toBeLessThanOrEqual(before.output.exhausted);
  }
  expect(detailingStore.generate(), detailingStore.lastError ?? '').not.toBeNull();
  expect(currentFrameDesignQuality()).toEqual(quality);
}, Number(process.env.STABILEO_DESIGN_MATRIX_TIMEOUT_MS ?? 600_000));
