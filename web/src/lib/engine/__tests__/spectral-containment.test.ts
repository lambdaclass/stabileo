import { describe, expect, it } from 'vitest';
import { spectralCaseResult, type SpectralCaseDef } from '../spectral-case';
import { magnitudeCombination, superposed } from '../combination-methods';
import type { AnalysisResults3D } from '../types-3d';
import type { ModalResult3D } from '../result-types';

const warning = { code: 'known_issue', severity: 'warning', phase: 'MD-ORTHOGONALITY', value: 759, message: 'modal' } as const;
const unitWarning = { ...warning, phase: 'NUM-INVARIANCE', value: 762, message: 'unit' };
const clean: AnalysisResults3D = {
  displacements: [{ nodeId: 1, ux: 0.12345, uy: -0.8, uz: 0.3, rx: 0, ry: 0, rz: 0 }],
  reactions: [], elementForces: [],
};
const modal = { modes: [
  { omega: 2, period: Math.PI, participationX: 1, participationY: -2 },
  { omega: 3, period: 2 * Math.PI / 3, participationX: -0.5, participationY: 1 },
] } as ModalResult3D;

describe('spectral diagnostic propagation preserves numerical results', () => {
  for (const rule of ['srss', 'cqc', 'abs'] as const) {
    it.each(['percentage', 'srss'] as const)(rule + ' with %s directions', directions => {
      const def: SpectralCaseDef = { source: { kind: 'code' }, factors: { x: 1, y: 0.3, z: 0 }, rule, directions, xi: 0.05, scale: 1 };
      const units = [clean, clean];
      const baseline = spectralCaseResult(def, modal, () => 1.5, units);
      const result = spectralCaseResult(def, { ...modal, structuredDiagnostics: [warning] }, () => 1.5,
        units.map(r => ({ ...r, structuredDiagnostics: [unitWarning] })));
      expect(result.structuredDiagnostics).toEqual([unitWarning, warning]);
      const { structuredDiagnostics, ...numbers } = result;
      expect(numbers).toEqual(baseline);
      const summed = superposed([{ r: clean, f: 1 }, { r: result, f: -2 }]);
      const { structuredDiagnostics: summedDiagnostics, ...summedNumbers } = summed;
      expect(summedDiagnostics).toEqual([unitWarning, warning]);
      expect(summedNumbers).toEqual(superposed([{ r: clean, f: 1 }, { r: baseline, f: -2 }]));
      for (const method of ['srss', 'abs'] as const) {
        const magnitude = magnitudeCombination(method, [{ caseId: 1, factor: 2 }], new Map([[1, result]]))!;
        const { structuredDiagnostics: magnitudeDiagnostics, ...magnitudeNumbers } = magnitude;
        expect(magnitudeDiagnostics).toEqual([unitWarning, warning]);
        expect(magnitudeNumbers).toEqual(magnitudeCombination(method, [{ caseId: 1, factor: 2 }], new Map([[1, baseline]])));
      }
    });
  }
});
