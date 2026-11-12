import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import { stampSolve, unknownStamp, type SolveStamp } from '../solve-stamp';

const id = 'pdelta-rotation-corrections';
const version = RESULT_CHANGES.changes.find(change => change.id === id)!.resultsVersion;
const changes = (model: FeatureSnapshot, analyses: string[], resultsVersion = version - 1) =>
  assessProject(model, { resultsVersion, analyses } as unknown as SolveStamp, model.analysisMode).changes.map(change => change.id);

describe('P-Delta residual corrections #1940', () => {
  it('marks P-Delta results for frames and shells', () => {
    const models: FeatureSnapshot[] = [
      { analysisMode: '2d', elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] },
      { analysisMode: 'pro', elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] },
      { analysisMode: 'pro', elements: [], plates: [[1, { id: 1 }]] },
      { analysisMode: 'pro', elements: [], quads: [[1, { id: 1 }]] },
    ];
    for (const model of models) {
      expect(changes(model, ['linear', 'pdelta'])).toContain(id);
      expect(changes(model, ['linear'])).not.toContain(id);
      expect(changes(model, ['buckling'])).not.toContain(id);
      expect(changes(model, ['corotational'])).not.toContain(id);
      expect(changes(model, ['pdelta'], version)).not.toContain(id);
    }
  });
});

const stiffnessModels: Array<[string, FeatureSnapshot]> = [
  ...(['2d', '3d', 'pro'] as const).flatMap(analysisMode => [
    ...(['frame', 'truss'] as const).map(type => [
      `${analysisMode} ${type}`,
      { analysisMode, elements: [[1, { id: 1, type, nodeI: 1, nodeJ: 2, materialId: 1 }]] },
    ] as [string, FeatureSnapshot]),
    [`${analysisMode} spring`, { analysisMode, supports: [[1, { nodeId: 1, type: 'spring3d', kx: 1 }]] }] as [string, FeatureSnapshot],
  ]),
  ['DKT shell', { analysisMode: 'pro', plates: [[1, { id: 1 }]] }],
  ['MITC4 shell', { analysisMode: '3d', quads: [[1, { id: 1 }]] }],
  ['curved shell', { analysisMode: 'pro', quads: [[1, { id: 1, curved: true }]] }],
  ['solid shell', { analysisMode: 'pro', solidShells: [[1, {}]] }],
  ['connector', { analysisMode: 'pro', connectors: [[1, { kShear: 1 }]] }],
];
const notices = (model: FeatureSnapshot, stamp: SolveStamp | null) =>
  assessProject(model, stamp, model.analysisMode).changes.map(change => change.id);
const before = (kind: Parameters<typeof stampSolve>[0]) => ({ ...stampSolve(kind, null), resultsVersion: version - 1 });

describe('P-Delta correction applicability boundaries #1940', () => {
  it.skip('known wrong result: #1940 excludes models without stiffness even with unknown or P-Delta history', () => {
    for (const analysisMode of ['2d', '3d', 'pro']) {
      for (const model of [
        { analysisMode, elements: [], supports: [], loadCases: [] },
        { analysisMode, supports: [[1, { nodeId: 1, type: 'fixed3d' }]], loads: [{ type: 'nodal3d', data: { nodeId: 1 } }] },
        { analysisMode, constraints: [{ slaveNode: 1, masterNode: 2 }], groups: [[1, { kind: 'generated' }]] },
      ] satisfies FeatureSnapshot[]) {
        for (const stamp of [null, unknownStamp(), before('pdelta')]) {
          expect(notices(model, stamp), `${analysisMode} ${stamp?.analyses ?? 'unknown'}`).not.toContain(id);
        }
      }
    }
  });

  it.each(stiffnessModels)('includes older P-Delta and unknown histories for %s', (_name, model) => {
    for (const stamp of [null, unknownStamp(), before('pdelta')]) {
      expect(notices(model, stamp)).toContain(id);
    }
  });

  it.each(stiffnessModels)('excludes other recorded analyses and corrected results for %s', (_name, model) => {
    for (const kind of ['linear', 'modal', 'buckling', 'nonlinear', 'ssi', 'plastic', 'harmonic'] as const) {
      expect(notices(model, before(kind)), kind).not.toContain(id);
    }
    for (const resultsVersion of [version, version + 1]) {
      expect(notices(model, { ...before('pdelta'), resultsVersion })).not.toContain(id);
    }
  });
});
