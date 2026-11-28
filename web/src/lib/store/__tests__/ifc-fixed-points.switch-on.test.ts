import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '..';
import { setFixedPoint } from '../rc-structure-plan';
import { stackKey } from '../../rc-sheets/fixed-points';

describe('the IFC of a building with columns', () => {
  it('says each column\'s fixed point, as its stack states it, and draws the axes as a grid', async () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
    await modelStore.loadExample('rc-design-qa-8');
    const { exportProjectIfc } = await import('../ifc-export');
    const plain = exportProjectIfc((k) => k, 'en', 'fp');
    expect(plain).toMatch(/IFCPROPERTYSINGLEVALUE\('FixedPoint',\$,IFCLABEL\('centre'\),\$\)/);
    const col = [...modelStore.elements.values()].find((e) => { const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!; return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6; })!;
    const base = modelStore.nodes.get(col.nodeI)!;
    setFixedPoint(stackKey([base.x, base.y]), 'px');
    expect(exportProjectIfc((k) => k, 'en', 'fp')).toMatch(/IFCPROPERTYSINGLEVALUE\('FixedPoint',\$,IFCLABEL\('face px'\),\$\)/);
    const { columnFixedPoints } = await import('../rc-sheets-ifc');
    const members = [{ id: `span-${col.id}`, kind: 'column', profile: { kind: 'rect' } }] as never as Parameters<typeof columnFixedPoints>[0];
    columnFixedPoints(members, new Map([[`span-${col.id}`, col.nodeI]]));
    expect(members[0]!.props).toMatchObject({ FixedPoint: 'face px', FixedPointX: Math.round(base.x * 1000) / 1000 });
    const axes = modelStore.grid?.axes ?? [];
    if (axes.some((a) => a.axis === 'x') && axes.some((a) => a.axis === 'y')) expect(plain).toContain('IFCGRID(');
  });
});
