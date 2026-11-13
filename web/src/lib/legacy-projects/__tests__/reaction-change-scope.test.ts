import { describe, expect, it } from 'vitest';
import stagedHistoryChange from '../../provenance/result-changes/staged-history-forces-unavailable.json';
import compensatedChange from '../../provenance/result-changes/pdelta-compensated-physical-recovery.json';
import pdeltaPhysicalChange from '../../provenance/result-changes/pdelta-physical-residual-certification.json';
import reactionRecoveryChange from '../../provenance/result-changes/arc-length-reactions.json';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import declaredQuantities from 'virtual:result-change-quantities';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { declaresMove, judge } from '../legacy';

describe('analysis-scoped reaction quantities (#1952)', () => {
  it('known wrong result: #1952: path declarations cannot excuse static values through either gate', () => {
    const metadata = RESULT_CHANGES.changes.find(c => c.id === 'arc-length-reactions')!;
    const entry = { ...metadata, quantities: declaredQuantities[metadata.id] };
    for (const dimension of ['plane2D', 'space3D']) {
      const features = ['members', dimension, 'pathAnalysis', 'analysis:linear', 'analysis:nonlinear', 'analysis:pdelta'];
      for (const family of ['base', 'case[1]', 'combo[1]', 'envelope.maxAbs', 'pdelta.results']) {
        for (const quantity of ['reactions[n1].rz', 'elementForces[e1].mStart', 'displacements[n1].uz']) {
          const path = `${family}.${quantity}`;
          expect(fieldCovered(reactionRecoveryChange, path, features), `${dimension} ${path}`).toBe(false);
          expect(declaresMove(entry, path), `${dimension} ${path}`).toBe(false);
        }
      }
      for (const quantity of ['reactions[n1].rz', 'elementForces[e1].mStart']) {
        expect(fieldCovered(reactionRecoveryChange, `nonlinear.results.${quantity}`, features)).toBe(true);
        expect(fieldCovered(reactionRecoveryChange, `nonlinear.results.${quantity}`, features.filter(f => f !== 'analysis:nonlinear'))).toBe(false);
        expect(fieldCovered(reactionRecoveryChange, `nonlinear.results.${quantity}`, ['members', dimension, 'analysis:linear'])).toBe(false);
      }
      expect(fieldCovered(reactionRecoveryChange, 'pdelta.results.equilibrium.equilibriumOk', features)).toBe(false);
      expect(fieldCovered(pdeltaPhysicalChange, 'pdelta.results.equilibrium.equilibriumOk', [...features, 'frameMembers'])).toBe(true);
    }
  });

  it('known wrong result: #1952: exported quantities cannot explain fabricated static corpus values', () => {
    const metadata = RESULT_CHANGES.changes.find(c => c.id === 'arc-length-reactions')!;
    const entry = { ...metadata, quantities: declaredQuantities[metadata.id] };
    for (const family of ['base', 'case[1]', 'combo[1]']) {
      for (const quantity of ['reactions[n1].rz', 'elementForces[e1].mStart']) {
        const path = `${family}.${quantity}`;
        const before = { 'solve.ok': true, [path]: 1 };
        expect(judge('unrelated static output', before, { ...before, [path]: 2 }, [entry]).kind, path).toBe('unexplained');
        expect(judge('unchanged static output', before, before, [entry]).kind, path).toBe('same');
      }
    }
  });
});

describe('staged history quantity scope (#1952)', () => {
  it('known wrong result: #1952: staged fields require path context through the snapshot gate', () => {
    for (const dimension of ['plane2D', 'space3D']) {
      for (const structure of ['members', 'shells']) {
        for (const path of ['stages[0].results.reactions.length', 'finalResults.elementForces.length']) {
          const features = [dimension, structure, 'analysis:linear', 'analysis:nonlinear'];
          expect(fieldCovered(stagedHistoryChange, path, features), path).toBe(false);
          expect(fieldCovered(stagedHistoryChange, path, [...features, 'pathAnalysis']), path).toBe(true);
        }
      }
    }
  });

  it('known wrong result: #1952: staged declarations cannot authorize other analysis collections', () => {
    const metadata = RESULT_CHANGES.changes.find(c => c.id === stagedHistoryChange.id)!;
    const exported = { ...metadata, quantities: declaredQuantities[metadata.id] };
    for (const dimension of ['plane2D', 'space3D']) {
      for (const structure of ['members', 'shells']) {
        const features = [dimension, structure, 'pathAnalysis', 'analysis:linear', 'analysis:nonlinear', 'analysis:pdelta'];
        for (const family of ['base', 'case[1]', 'combo[1]', 'envelope.maxAbs', 'pdelta.results', 'nonlinear.results']) {
          for (const quantity of ['reactions[n1].rz', 'elementForces[e1].mStart', 'constraintForces[0].force', 'plateStresses[e1].sigmaXx', 'quadStresses[e1].sigmaXx', 'quadNodalStresses[0].sigmaXx', 'structuredDiagnostics[0].message', 'displacements[n1].uz']) {
            const path = `${family}.${quantity}`;
            expect(fieldCovered(stagedHistoryChange, path, features), path).toBe(false);
            expect(declaresMove(exported, path), path).toBe(false);
          }
        }
        for (const path of ['stages[0].results.reactions.length', 'stages[1].results.structuredDiagnostics[0].message', 'finalResults.elementForces.length']) {
          expect(fieldCovered(stagedHistoryChange, path, features), path).toBe(true);
          expect(fieldCovered(stagedHistoryChange, path, [dimension, 'analysis:linear']), path).toBe(false);
        }
      }
    }
  });

  it('known wrong result: #1952: staged notices cannot explain fabricated static answers', () => {
    const metadata = RESULT_CHANGES.changes.find(c => c.id === stagedHistoryChange.id)!;
    const exported = { ...metadata, quantities: declaredQuantities[metadata.id] };
    for (const family of ['base', 'case[1]', 'combo[1]', 'envelope.maxAbs']) {
      for (const quantity of ['reactions[n1].rz', 'elementForces[e1].mStart', 'quadStresses[e1].sigmaXx']) {
        const path = `${family}.${quantity}`;
        const before = { 'solve.ok': true, [path]: 1 };
        expect(judge('changed static result', before, { ...before, [path]: 2 }, [exported]).kind, path).toBe('unexplained');
        expect(judge('unchanged static result', before, before, [exported]).kind, path).toBe('same');
      }
    }
    expect(judge('linear refusal', { 'solve.ok': true }, { 'solve.ok': false }, [exported]).kind).toBe('unexplained');
  });
});

describe('compensated P-Delta recovery scope (#1952)', () => {
  it('registers P-Delta snapshot fields without widening the legacy static gate', () => {
    const metadata = RESULT_CHANGES.changes.find(c => c.id === compensatedChange.id);
    expect(metadata).toBeDefined();
    const entry = { ...metadata!, quantities: declaredQuantities[compensatedChange.id] };
    for (const dimension of ['plane2D','space3D']) {
      const features = ['members',dimension,'analysis:linear','analysis:pdelta'];
      for (const quantity of ['reactions[n1].rz','elementForces[e1].mStart','equilibrium.relativeResidual','equilibrium.residualOk']) {
        const path = `pdelta.results.${quantity}`;
        expect(fieldCovered(compensatedChange,path,features)).toBe(true);
        expect(declaresMove(entry,path)).toBe(false);
        for (const family of ['base','case[1]','combo[1]']) {
          const unrelated = `${family}.${quantity}`;
          expect(fieldCovered(compensatedChange,unrelated,features)).toBe(false);
          expect(declaresMove(entry,unrelated)).toBe(false);
        }
      }
      expect(fieldCovered(compensatedChange,'pdelta.results.reactions[n1].rz',[dimension,'members','analysis:linear'])).toBe(false);
    }
  });
});
