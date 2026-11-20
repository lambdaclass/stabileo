import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { axesStore } from '../../axes/axes.svelte';
import { DEFAULT_AXES, type AxesChoice } from '../../axes/frame';
import type { AnalysisResults } from '../../engine/types';
import type { AnalysisResults3D } from '../../engine/types-3d';
import type { PDeltaResult, PDeltaResult3D } from '../../engine/result-types';
import { initSolver, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import type { MemberDesignOutcome } from '../../engine/design/outcome';
import { buildProjectFile, deserializeProject, loadFile, loadProject, serializeProject } from '../file';
import { expandDesignRefusals, MAX_EXPANDED_REFUSAL_CHARS } from '../ded-design-refusals';
import { recordRefusals, storedRefusal } from '../design-refusals';
import { historyStore } from '../history.svelte';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';

function refusal(elementId: number, detail: string): MemberDesignOutcome {
  return {
    elementId,
    elementType: 'beam',
    codeId: 'test',
    codeVersion: 'test',
    outcome: 'SEARCH_EXHAUSTED',
    limiting: ['anchorage'],
    reasons: [{ key: 'design.reason.alternativesExhausted', params: { detail, ratio: Infinity } }],
    searchStats: { candidatesTried: 2, verifierCalls: 2, ms: 0, truncated: false, envelopeExhausted: false },
  };
}

function splitSpanRefusals(): MemberDesignOutcome[] {
  const nodes = Array.from({ length: 5 }, (_, i) => modelStore.addNode(i, 0, 0));
  const members = nodes.slice(1).map((node, i) => modelStore.addElement(nodes[i]!, node, 'frame')!);
  const sharedEvidence = 'Verificación de anclaje'.repeat(128);
  return [
    refusal(members[0]!, sharedEvidence),
    refusal(members[2]!, 'Other span'),
    refusal(members[3]!, sharedEvidence + ' with different evidence'),
    refusal(members[1]!, sharedEvidence),
  ];
}

const openers = [
  ['deserializeProject', async (text: string) => { expect(deserializeProject(text)).toBe(true); }],
  ['loadProject', async (text: string) => { await loadProject(new File([text], 'project.ded')); }],
  ['loadFile', async (text: string) => {
    await expect(loadFile(new File([text], 'project.ded'))).resolves.toEqual({ type: 'tab', count: 1 });
  }],
] as const;

function structuralResults(result: AnalysisResults | AnalysisResults3D | string | null) {
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.displacements.length).toBeGreaterThan(0);
  const { timings: _timings, ...values } = result;
  return values;
}

function solveSavedModel() {
  const is2D = uiStore.analysisMode === '2d';
  const weight = uiStore.includeSelfWeight;
  const linear = structuralResults(is2D ? modelStore.solve(weight) : modelStore.solve3D(weight));
  let nonlinear: PDeltaResult | PDeltaResult3D;
  if (is2D) {
    const input = modelStore.buildSolverInput(weight);
    if (!input) throw new Error('Missing 2D solver input');
    nonlinear = solvePDelta(input);
  } else {
    const input = modelStore.buildSolverInput3D(weight, false, { basic: true });
    if (!input) throw new Error('Missing 3D solver input');
    nonlinear = solvePDelta3D(input);
  }
  expect(nonlinear.isStable).toBe(true);
  expect(nonlinear.converged).toBe(true);
  return {
    linear,
    nonlinear: {
      ...nonlinear,
      results: structuralResults(nonlinear.results),
      linearResults: structuralResults(nonlinear.linearResults),
    },
  };
}

describe('#2365 shared refusal evidence in portable projects', () => {
  beforeAll(async () => { await initSolver(); });

  beforeEach(() => {
    modelStore.clear();
    historyStore.clear();
    uiStore.analysisMode = 'pro';
  });

  it.each(openers)('%s restores every piece from one copy of its evidence', async (_name, open) => {
    const outcomes = splitSpanRefusals();
    recordRefusals(outcomes);
    const plain = JSON.stringify(buildProjectFile());
    const saved = serializeProject();
    expect(Buffer.byteLength(saved)).toBeLessThan(Buffer.byteLength(plain));
    const file = JSON.parse(saved);
    expect(file.version).toBe('2.1');
    expect(file.snapshot.detailing.designRefusals.records).toHaveLength(3);
    modelStore.clear();

    await open(saved);
    for (const outcome of outcomes) expect(storedRefusal(outcome.elementId)).toEqual(outcome);
    expect(modelStore.model.detailing?.designRefusals).toEqual(JSON.parse(plain).snapshot.detailing.designRefusals);
  });

  it.each(openers)('%s still reads plain 2.0 refusal evidence with exact values', async (_name, open) => {
    const outcomes = splitSpanRefusals().slice(0, 3);
    recordRefusals(outcomes);
    const saved = serializeProject();
    expect(JSON.parse(saved).version).toBe('2.0');
    modelStore.clear();

    await open(saved);
    for (const outcome of outcomes) expect(storedRefusal(outcome.elementId)).toEqual(outcome);
  });

  afterEach(() => axesStore.reset());

  const frames = [
    { frame: 'canonical axes', choice: DEFAULT_AXES },
    { frame: 'reflected axes', choice: { up: '-Y', right: '-X', hand: 'left' } satisfies AxesChoice },
  ];
  const framedOpeners = frames.flatMap(({ frame, choice }) =>
    openers.map(([opener, open]) => ({ opener, open, frame, choice })),
  );
  for (const [mode, example] of [['2d', 'continuous-beam'], ['3d', '3d-portal-frame']] as const) {
    it.each(framedOpeners)(`$opener preserves ${mode} linear and P-Delta results across 2.0 and 2.1 with $frame`, async ({ open, choice }) => {
      const legacy = readFileSync(new URL(`../../../../legacy-projects/v0.2.0/${example}.ded`, import.meta.url), 'utf8');
      expect(JSON.parse(legacy).version).toBe('2.0');
      await open(legacy);
      expect(uiStore.analysisMode).toBe(mode);
      expect(JSON.parse(serializeProject()).version).toBe('2.0');
      const before = solveSavedModel();
      axesStore.choice = choice;
      expect(axesStore.choice).toEqual(choice);
      const evidence = 'Shared refusal for split pieces'.repeat(128);
      const members = [...modelStore.elements.keys()].slice(0, 2);
      expect(members).toHaveLength(2);
      const refusals = members.map(id => refusal(id, evidence));
      recordRefusals(refusals);
      const compact = serializeProject();
      expect(JSON.parse(compact).version).toBe('2.1');
      modelStore.clear();

      await open(compact);
      expect(uiStore.analysisMode).toBe(mode);
      expect(axesStore.choice).toEqual(choice);
      expect(solveSavedModel()).toEqual(before);
      for (const outcome of refusals) expect(storedRefusal(outcome.elementId)).toEqual(outcome);
    });
  }

  it.each([
    ['an unknown record', (file: ReturnType<typeof JSON.parse>) => { file.snapshot.detailing.designRefusals.members[0][1] = 99; }],
    ['a duplicate member', (file: ReturnType<typeof JSON.parse>) => {
      const members = file.snapshot.detailing.designRefusals.members;
      members[1][0] = members[0][0];
    }],
    ['a record with its own member ID', (file: ReturnType<typeof JSON.parse>) => {
      file.snapshot.detailing.designRefusals.records[0].elementId = 111;
    }],
    ['the legacy version label', (file: ReturnType<typeof JSON.parse>) => { file.version = '2.0'; }],
  ])('refuses a compact project with %s before changing the open model', async (_name, corrupt) => {
    recordRefusals(splitSpanRefusals());
    const file = JSON.parse(serializeProject());
    expect(file.version).toBe('2.1');
    corrupt(file);
    const text = JSON.stringify(file);

    modelStore.clear();
    modelStore.model.name = 'Open project';
    modelStore.addNode(0, 1);
    const before = modelStore.snapshot();
    const undo = historyStore.undoCount;
    expect(deserializeProject(text)).toBe(false);
    await expect(loadProject(new File([text], 'bad.ded'))).rejects.toThrow();
    await expect(loadFile(new File([text], 'bad.ded'))).rejects.toThrow();
    expect(modelStore.snapshot()).toEqual(before);
    expect(historyStore.undoCount).toBe(undo);
  });

  it('allows expansion up to the compact evidence limit and refuses one character more', () => {
    const elementId = 1000;
    const record = { outcome: 'SEARCH_EXHAUSTED', detail: '' };
    const count = 1024;
    const rowChars = JSON.stringify({ elementId, ...record }).length + 1;
    const detailChars = Math.floor((MAX_EXPANDED_REFUSAL_CHARS - 1) / count) - rowChars;
    const extraTailChars = (MAX_EXPANDED_REFUSAL_CHARS - 1) % count;
    const packed = {
      fingerprint: '0000000000000000',
      records: [
        { ...record, detail: 'a'.repeat(detailChars) },
        { ...record, detail: 'b'.repeat(detailChars + extraTailChars) },
      ],
      members: Array.from({ length: count }, (_, i) => [elementId + i, i === count - 1 ? 1 : 0]),
    };
    expect(expandDesignRefusals(packed)?.outcomes.length).toBe(MAX_EXPANDED_REFUSAL_CHARS);
    packed.records[1]!.detail += 'b';
    expect(expandDesignRefusals(packed)).toBeNull();
  });
});
