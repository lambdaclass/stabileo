import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultDesignData } from '../../model/design-data';
import type { ModelSnapshot } from '../../store/history.svelte';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures } from '../model-features';
import { stampSolve, type SolveStamp } from '../solve-stamp';
import timeHistoryNotice from '../result-changes/time-history-reaction-availability.json';

const pathNotices = [
  'staged-history-forces-unavailable',
  'staged-physical-stiffness-recovery',
  'staged-support-spring-history',
  'withheld-staged-equilibrium-forces',
];
const shellNotices = pathNotices.filter(id => id !== 'staged-support-spring-history').sort();
const modes = ['2d', '3d', 'pro'] as const;
const analyses = ['linear', 'nonlinear', 'pdelta'] as const;
const entry = (id: string) => RESULT_CHANGES.changes.find(change => change.id === id)!;
const readSnapshot = (name: string): ModelSnapshot => JSON.parse(readFileSync(
  new URL(`../../../../legacy-projects/v0.4.0/${name}.ded`, import.meta.url), 'utf8',
)).snapshot;
const roundTrip = (snapshot: ModelSnapshot): ModelSnapshot => JSON.parse(JSON.stringify(snapshot));
const notices = (snapshot: ModelSnapshot, stamp: SolveStamp | null) => assessProject(snapshot, stamp).changes
  .map(change => change.id).filter(id => pathNotices.includes(id)).sort();

function savedShell(analysisMode: typeof modes[number]): ModelSnapshot {
  const snapshot = readSnapshot('deep-beam-shell');
  return roundTrip({
    ...snapshot,
    analysisMode,
    designData: { ...defaultDesignData(), site: {
      phases: [{ id: 'first', name: 'Shells', start: '2026-11-13', days: 1 }],
      assign: Object.fromEntries(snapshot.quads!.map(([id]) => [`q${id}`, 'first'])),
    } },
  });
}

describe('known wrong result: #1952 — saved staged snapshot notice extraction', () => {
  it.each(modes)('assesses a real shell-only %s snapshot without feature overrides', analysisMode => {
    const snapshot = savedShell(analysisMode);
    expect(snapshot.elements).toEqual([]);
    expect(snapshot.constraints ?? []).toEqual([]);
    expect(modelFeatures(snapshot)).toContain('shells');
    expect(modelFeatures(snapshot)).not.toContain('springs');
    expect(modelFeatures(snapshot)).toContain('stagedConstruction');
    for (const analysis of analyses) {
      const stamp = { ...stampSolve(analysis, null), resultsVersion: Math.min(...shellNotices.map(id => entry(id).resultsVersion)) - 1 };
      const { recorded: _recorded, ...legacy } = stamp;
      for (const provenance of [null, stamp, legacy]) expect(notices(snapshot, provenance)).toEqual(shellNotices);
    }
    expect(modelFeatures(snapshot)).toContain('pathAnalysis');
  });

  it.each(modes)('honours each staged notice version boundary in %s', analysisMode => {
    const snapshot = savedShell(analysisMode);
    for (const id of shellNotices) {
      for (const analysis of analyses) {
        const stamp = { ...stampSolve(analysis, null), resultsVersion: entry(id).resultsVersion - 1 };
        expect(notices(snapshot, stamp)).toContain(id);
        expect(notices(snapshot, { ...stamp, resultsVersion: entry(id).resultsVersion })).not.toContain(id);
      }
    }
  });

  it.each(modes)('shares the saved-phase predicate with spring history notices in %s', analysisMode => {
    const snapshot = savedShell(analysisMode);
    const spring = readSnapshot('spring-support').supports.find(([, support]) => support.type === 'spring')!;
    const supportId = snapshot.nextId.support++;
    snapshot.supports.push([supportId, { ...spring[1], id: supportId }]);
    for (const structure of [snapshot, { ...snapshot, quads: [] }]) {
      const saved = roundTrip(structure);
      expect(modelFeatures(saved)).toContain('springs');
      for (const analysis of analyses) {
        const id = 'staged-support-spring-history';
        const stamp = { ...stampSolve(analysis, null), resultsVersion: entry(id).resultsVersion - 1 };
        expect(notices(saved, stamp)).toContain(id);
        expect(notices(saved, { ...stamp, resultsVersion: entry(id).resultsVersion })).not.toContain(id);
      }
      expect(notices(saved, null)).toEqual(structure === snapshot ? [...pathNotices].sort() : [
        'staged-support-spring-history', 'withheld-staged-equilibrium-forces',
      ]);
    }
  });

  it.each(modes)('keeps ordinary %s shells and springs outside staged path notices', analysisMode => {
    const staged = savedShell(analysisMode);
    const spring = readSnapshot('spring-support');
    for (const snapshot of [staged, { ...spring, analysisMode }]) {
      for (const designData of [undefined, defaultDesignData(), { ...defaultDesignData(), site: { phases: [], assign: {} } }]) {
        const saved = roundTrip({ ...snapshot, designData });
        expect(modelFeatures(saved)).not.toContain('stagedConstruction');
        expect(modelFeatures(saved)).not.toContain('pathAnalysis');
        for (const analysis of analyses) {
          const stamp = { ...stampSolve(analysis, null), resultsVersion: Math.min(...shellNotices.map(id => entry(id).resultsVersion)) - 1 };
          for (const provenance of [null, stamp]) expect(notices(saved, provenance)).toEqual([]);
        }
      }
    }
  });
});

it.each(['en', 'es', 'pt', 'de', 'fr', 'tr'] as const)(
  'known wrong result: #1952 — %s time-history notice describes empty peak reactions', locale => {
    expect(timeHistoryNotice.explanation[locale]).toContain('peakReactions: []');
  },
);
