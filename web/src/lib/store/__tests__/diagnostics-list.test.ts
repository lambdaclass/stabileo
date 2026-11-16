import { afterEach, describe, expect, it } from 'vitest';
import { collectDiagnostics, groupDiagnostics, reviewCount, withoutIssueRef } from '../diagnostics-list';
import { modelStore, resultsStore, uiStore } from '../index';
import type { SolverDiagnostic } from '../../engine/types';

const loose = (plate: string): SolverDiagnostic => ({
  source: 'model', severity: 'warning', code: 'PLATE_LOOSE_CORNER', message: 'Plate with loose nodes', details: { plate, nodes: '1, 2' },
});

describe('the diagnostics list', () => {
  afterEach(() => { resultsStore.clear3D(); modelStore.clear(); uiStore.analysisMode = '2d'; });

  it('groups findings that say the same thing, in the order they first appear', () => {
    const info: SolverDiagnostic = { source: 'model', severity: 'info', code: 'PHYSICAL_REVIEW', message: 'Review', details: { n: 2 } };
    const groups = groupDiagnostics([loose('M2'), info, loose('M3'), loose('L4')]);
    expect(groups.map((g) => [g.first.code, g.items.length])).toEqual([['PLATE_LOOSE_CORNER', 3], ['PHYSICAL_REVIEW', 1]]);
    expect(groups[0]!.items.map((d) => d.details?.plate)).toEqual(['M2', 'M3', 'L4']);
  });

  it('keeps the engine issue numbers out of the sentence', () => {
    expect(withoutIssueRef('Verify the stability independently before designing. (#762)')).toBe('Verify the stability independently before designing.');
    expect(withoutIssueRef('Run a P-Delta analysis (#1551) first')).toBe('Run a P-Delta analysis first');
    expect(withoutIssueRef('Node #4 is loose')).toBe('Node #4 is loose');
  });

  it('counts a result notice once and identical model findings once', () => {
    uiStore.analysisMode = 'pro';
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
    const clean = { displacements: [], reactions: [], elementForces: [] };
    const known = { code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'ENGINE' };
    resultsStore.setResults3D({ ...clean, structuredDiagnostics: [known] } as never);
    const before = groupDiagnostics(collectDiagnostics(true)).filter((g) => g.first.severity !== 'info').length;
    const count = reviewCount(true);
    expect(count.results).toBe(1);
    expect(count.model).toBe(before);
    expect(count.total).toBe(count.model + count.results);
    expect(groupDiagnostics(collectDiagnostics(true)).some((g) => g.first.code === 'known_issue'), 'a result notice is not also a model finding').toBe(false);
  });
});
