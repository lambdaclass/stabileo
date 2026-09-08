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
  /*
   * Two spans on three supports that each restrain only the vertical — the
   * textbook case where the degree formula and the truth disagree.
   *
   *   g = 3·m + r − 3·n = 3×2 + 3 − 3×3 = 0
   *
   * Zero says "isostatic", and the structure is a mechanism: nothing holds it
   * horizontally. Kinematic analysis reports it as HYPOSTATIC anyway, names
   * node 3 and the ux degree of freedom, and refuses to solve.
   *
   * It exists for the blog post on the conceptual side of the advanced tools,
   * which needs a model where a reader can watch a formula be overruled.
   * Deliberately not in the examples menu: that is a catalogue of structures
   * that work, and this one is meant not to.
   */
  'hidden-mechanism': () => import('./fixtures/hidden-mechanism.json'),
};

// 3D examples (basic + PRO)
const fixtures3D: Record<string, FixtureLoader> = {
  '3d-portal-frame': () => import('./fixtures/3d-portal-frame.json'),
  '3d-space-truss': () => import('./fixtures/3d-space-truss.json'),
  '3d-cantilever-load': () => import('./fixtures/3d-cantilever-load.json'),
  '3d-grid-slab': () => import('./fixtures/3d-grid-slab.json'),
  '3d-tower': () => import('./fixtures/3d-tower.json'),
  '3d-torsion-beam': () => import('./fixtures/3d-torsion-beam.json'),
  // A cantilever tube under 1 kN·m, sized to the blog post on torsion theories:
  // CHS 105×5 is a 50 mm mean radius with a 5 mm wall, the t/rm = 0.10 row of
  // its table. Opened from the post's embedded editor, so the reader sees
  // Cauchy and Bredt disagree on the very section the text is about.
  'torsion-tube': () => import('./fixtures/torsion-tube.json'),
  // A simply supported 20×40 H-25 beam with D and L cases and the two usual
  // combinations, sized for the blog post on CIRSOC 201 flexural verification:
  // the governing combination lands near the moment the text works through.
  // Registered here so a post can load it; deliberately not in the examples
  // menu, which is a catalogue for users rather than for articles.
  'rc-beam-flexure': () => import('./fixtures/rc-beam-flexure.json'),
  '3d-nave-industrial': () => import('./fixtures/3d-nave-industrial.json'),
  '3d-building': () => import('./fixtures/3d-building.json'),
  'pro-edificio-7p': () => import('./fixtures/pro-edificio-7p.json'),
  'rc-qa-diagnostic': () => import('./fixtures/rc-qa-diagnostic.json'),
  // Shell QA diagnostic: slab (bending) + tabique wall (membrane) + columns +
  // curved balcony beam, so every shell contour component varies somewhere.
  'rc-qa-diagnostic-shells': () => import('./fixtures/rc-qa-diagnostic-shells.json'),
  // PRO generators (now JSON)
  'torre-irregular-con-retiros': () => import('./fixtures/torre-irregular-con-retiros.json'),
  'rc-design-frame': () => import('./fixtures/rc-design-frame.json'),
  // Small deterministic RC design fixture (8 members) for fast unit + browser
  // tests: adequate sections, load combinations present, every member verifiable.
  'rc-design-qa-8': () => import('./fixtures/rc-design-qa-8.json'),
  // Same family, sized so the SUPPORT regions land in row 2 of Table 9.7.6.2.2 (V_s required
  // above 0,33·√f'c·bw·d). A 300 mm web has 242 mm between its two leg centres against row
  // 2's 200 mm across-width limit, so a third leg — a crosstie — is mandatory. qa-8 is
  // entirely row 1 and therefore cannot exercise the across-width column at all.
  'rc-design-qa-row2': () => import('./fixtures/rc-design-qa-row2.json'),
  // CAD → RC draft examples generated from real architectural DXFs by
  // scripts/build-cad-dxf-examples.ts (PR [9] stress tests).
  'cad-arch-structure-dxf': () => import('./fixtures/cad-arch-structure-dxf.json'),
  'cad-arch-only-dxf': () => import('./fixtures/cad-arch-only-dxf.json'),
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

/**
 * Fixtures that are NOT supposed to solve.
 *
 * Every audit suite walks the fixtures directory and asserts that each model
 * solves, produces finite diagrams and agrees between 2D and 3D. That is the
 * right default and it must stay strict — so a model whose entire purpose is
 * to be unsolvable has to say so here rather than have the assertion relaxed
 * for everyone.
 *
 * Listing one is a claim that its failure is the designed behaviour. Do not
 * add a fixture here to quiet a suite: if a model that should work stops
 * working, the audit is right and the model is wrong.
 */
export const INTENTIONALLY_UNSOLVABLE = new Set<string>([
  // Three supports that each restrain only the vertical: g = 0 by formula,
  // a mechanism in fact. The blog post on the conceptual side of the advanced
  // tools opens the kinematic panel on it precisely to show the solver refuse.
  'hidden-mechanism',
]);

export function getFixture(name: string): FixtureLoader | undefined {
  return fixtures2D[name] ?? fixtures3D[name];
}

export function is2DFixture(name: string): boolean {
  return name in fixtures2D;
}

export function is3DFixture(name: string): boolean {
  return name in fixtures3D;
}
