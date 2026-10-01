/**
 * One rule for which loads the 3D scene draws: syncLoads draws by it and the box selection picks
 * by it, so a marquee never takes a load that is not on the screen — and Delete never removes one.
 */
import { describe, it, expect } from 'vitest';
import { isLoadDrawn, loadsLayerDrawn, type LoadDrawView } from '../load-drawn';

const view = (over: Partial<LoadDrawView> = {}): LoadDrawView => ({
  showLoads: true, hideLoadsWithDiagram: false, diagramType: 'none', visibleCases: null, isHidden: () => false, ...over,
});
const load = (data: { caseId?: number; nodeId?: number; elementId?: number; quadId?: number }) => ({ data });

describe('isLoadDrawn', () => {
  it('draws every load when nothing hides them', () => {
    expect(isLoadDrawn(load({ caseId: 2, nodeId: 1 }), view())).toBe(true);
  });
  it('draws none with the loads layer off', () => {
    expect(loadsLayerDrawn(view({ showLoads: false }))).toBe(false);
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), view({ showLoads: false }))).toBe(false);
  });
  it('draws none while a diagram is shown and loads hide with it', () => {
    const v = view({ hideLoadsWithDiagram: true, diagramType: 'moment' });
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), v)).toBe(false);
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), view({ hideLoadsWithDiagram: true }))).toBe(true);
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), view({ diagramType: 'moment' }))).toBe(true);
  });
  it('draws only the ticked load cases, and a load without a case always', () => {
    const v = view({ visibleCases: [1] });
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), v)).toBe(true);
    expect(isLoadDrawn(load({ caseId: 2, nodeId: 1 }), v)).toBe(false);
    expect(isLoadDrawn(load({ nodeId: 1 }), v)).toBe(true);
    expect(isLoadDrawn(load({ caseId: 1, nodeId: 1 }), view({ visibleCases: [] }))).toBe(false);
  });
  it('does not draw a load on what the view hides', () => {
    const v = view({ isHidden: (t) => t.elementId === 5 });
    expect(isLoadDrawn(load({ caseId: 1, elementId: 5 }), v)).toBe(false);
    expect(isLoadDrawn(load({ caseId: 1, elementId: 6 }), v)).toBe(true);
  });
});
