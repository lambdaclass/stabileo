import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberDesignOutcome } from '../../engine/design/outcome';
import { buildProjectFile, deserializeProject, loadFile, loadProject, serializeProject } from '../file';
import { recordRefusals, storedRefusal } from '../design-refusals';
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
    uiStore.analysisMode = 'pro';
  });

  it.skip.each(openers)('known wrong result: #2365 — %s restores every piece from one copy of its evidence', async (_name, open) => {
    const outcomes = splitSpanRefusals();
    recordRefusals(outcomes);
    const plain = JSON.stringify(buildProjectFile());
    const saved = serializeProject();
    expect(Buffer.byteLength(saved)).toBeLessThan(Buffer.byteLength(plain));
    expect(JSON.parse(saved).version).toBe('2.1');
    modelStore.clear();

    await open(saved);
    for (const outcome of outcomes) expect(storedRefusal(outcome.elementId)).toEqual(outcome);
    expect(modelStore.model.detailing?.designRefusals).toEqual(JSON.parse(plain).snapshot.detailing.designRefusals);
  });
});
