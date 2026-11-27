export const STEEL = { id: 1, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 };
export const steelTruss = () => ({
  analysisMode: 'pro',
  materials: [[1, STEEL]],
  elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
  supports: [[1, { id: 1, nodeId: 1, type: 'pinned3d' }]],
  loads: [],
  loadCases: [{ id: 1, type: 'D' }],
}) as never;
