import { beforeEach, describe, expect, it } from 'vitest';
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

describe('#2365 shared refusal evidence in portable projects', () => {
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
