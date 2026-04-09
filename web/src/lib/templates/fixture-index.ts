/**
 * Index of all example model fixtures.
 * Each fixture is a JSON file in the fixtures/ directory.
 * Dynamic imports keep the initial bundle small — fixtures are loaded on demand.
 */
type FixtureLoader = () => Promise<any>;

// 2D examples
const fixtures2D: Record<string, FixtureLoader> = {
  'simply-supported': () => import('./fixtures/simply-supported.json'),
  'cantilever': () => import('./fixtures/cantilever.json'),
  'cantilever-point': () => import('./fixtures/cantilever-point.json'),
  'continuous-beam': () => import('./fixtures/continuous-beam.json'),
  'portal-frame': () => import('./fixtures/portal-frame.json'),
  'two-story-frame': () => import('./fixtures/two-story-frame.json'),
  'multi-section-frame': () => import('./fixtures/multi-section-frame.json'),
  'color-map-demo': () => import('./fixtures/color-map-demo.json'),
  'truss': () => import('./fixtures/truss.json'),
  'warren-truss': () => import('./fixtures/warren-truss.json'),
  'howe-truss': () => import('./fixtures/howe-truss.json'),
  'point-loads': () => import('./fixtures/point-loads.json'),
  'spring-support': () => import('./fixtures/spring-support.json'),
  'thermal': () => import('./fixtures/thermal.json'),
  'settlement': () => import('./fixtures/settlement.json'),
  'three-hinge-arch': () => import('./fixtures/three-hinge-arch.json'),
  'gerber-beam': () => import('./fixtures/gerber-beam.json'),
  'bridge-moving-load': () => import('./fixtures/bridge-moving-load.json'),
  'bridge-highway': () => import('./fixtures/bridge-highway.json'),
  'frame-cirsoc-dl': () => import('./fixtures/frame-cirsoc-dl.json'),
  'building-3story-dlw': () => import('./fixtures/building-3story-dlw.json'),
  'frame-seismic': () => import('./fixtures/frame-seismic.json'),
};

// 3D examples (basic + PRO)
const fixtures3D: Record<string, FixtureLoader> = {
  '3d-portal-frame': () => import('./fixtures/3d-portal-frame.json'),
  '3d-space-truss': () => import('./fixtures/3d-space-truss.json'),
  '3d-cantilever-load': () => import('./fixtures/3d-cantilever-load.json'),
  '3d-grid-slab': () => import('./fixtures/3d-grid-slab.json'),
  '3d-tower': () => import('./fixtures/3d-tower.json'),
  '3d-torsion-beam': () => import('./fixtures/3d-torsion-beam.json'),
  '3d-nave-industrial': () => import('./fixtures/3d-nave-industrial.json'),
  '3d-building': () => import('./fixtures/3d-building.json'),
  'pro-edificio-7p': () => import('./fixtures/pro-edificio-7p.json'),
  // PRO generators (now JSON)
  'torre-irregular-con-retiros': () => import('./fixtures/torre-irregular-con-retiros.json'),
  'rc-design-frame': () => import('./fixtures/rc-design-frame.json'),
  'pipe-rack': () => import('./fixtures/pipe-rack.json'),
  'mat-foundation': () => import('./fixtures/mat-foundation.json'),
  'suspension-bridge': () => import('./fixtures/suspension-bridge.json'),
  'cable-stayed-bridge': () => import('./fixtures/cable-stayed-bridge.json'),
  'offshore-platform': () => import('./fixtures/offshore-platform.json'),
  'full-stadium': () => import('./fixtures/full-stadium.json'),
  'xl-diagrid-tower': () => import('./fixtures/xl-diagrid-tower.json'),
  'geodesic-dome': () => import('./fixtures/geodesic-dome.json'),
  'la-bombonera': () => import('./fixtures/la-bombonera.json'),
  // Template catalog 3D (now JSON)
  'space-frame': () => import('./fixtures/space-frame.json'),
  'grid-beams': () => import('./fixtures/grid-beams.json'),
  'tower-3d-2': () => import('./fixtures/tower-3d-2.json'),
  'tower-3d-4': () => import('./fixtures/tower-3d-4.json'),
  'hinged-arch-3d': () => import('./fixtures/hinged-arch-3d.json'),
  'cable-stayed-bridge-small': () => import('./fixtures/cable-stayed-bridge-small.json'),
  'stadium-canopy': () => import('./fixtures/stadium-canopy.json'),
};

export function getFixture(name: string): FixtureLoader | undefined {
  return fixtures2D[name] ?? fixtures3D[name];
}

export function is2DFixture(name: string): boolean {
  return name in fixtures2D;
}

export function is3DFixture(name: string): boolean {
  return name in fixtures3D;
}
