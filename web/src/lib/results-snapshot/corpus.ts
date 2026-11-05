/**
 * The reference corpus of the results snapshot gate (#716).
 *
 * Each case is a project as an engineer opens it (a bundled example, or a committed `.ded`) in a
 * workspace, solved and checked through the app's own entry points (`capture.ts`). Chosen to
 * touch every result family the app publishes while staying fast enough for every pull request:
 * every 2D/3D example small enough to snapshot whole, one or more of each analysis and design
 * family, and the refusals. The large showcase models (stadiums, towers, bridges, the CAD
 * imports, the 408-member flagship) are left out: they exercise the same code paths at a size
 * that would make the snapshot a megabyte and the job minutes long.
 *
 * Adding a case is free (a new snapshot is coverage, not a result change); changing or removing
 * one is a result change for the gate (`scripts/results-snapshot/gate.mjs`).
 */

export type Workspace = '2d' | '3d' | 'pro';
export type Advanced = 'pdelta' | 'modal' | 'spectral' | 'buckling';

export interface SnapshotCase {
  /** File name in `web/results-snapshots/`, without `.json`. */
  name: string;
  /** A bundled example (`templates/fixture-index.ts`) or a committed `.ded` (path from `web/`). */
  source: { example: string } | { ded: string };
  /** The workspace it is opened and solved in. */
  workspace: Workspace;
  /** PRO's «Design» setting on: the CIRSOC 201 code check, the CIRSOC 301 steel check, footings. */
  design?: boolean;
  /** PRO's Advanced analyses run after the solve, as the Advanced tab runs them. */
  advanced?: Advanced[];
  /** Which test file runs it, so the corpus runs on parallel workers. */
  group: 'basic' | 'pro' | 'design';
  /** What the case is there for. */
  covers: string;
}

const ex = (example: string) => ({ example });

export const CORPUS: SnapshotCase[] = [
  // ── Basic, 2D: the DSM chain, combinations, the special supports and loads ──
  { name: '2d-simply-supported', source: ex('simply-supported'), workspace: '2d', group: 'basic', covers: '2D beam, distributed load' },
  { name: '2d-cantilever-point', source: ex('cantilever-point'), workspace: '2d', group: 'basic', covers: '2D cantilever, point load' },
  { name: '2d-continuous-beam-unequal', source: ex('continuous-beam-unequal'), workspace: '2d', group: 'basic', covers: '2D hyperstatic continuous beam' },
  { name: '2d-portal-frame', source: ex('portal-frame'), workspace: '2d', group: 'basic', covers: '2D frame, sway' },
  { name: '2d-two-story-frame', source: ex('two-story-frame'), workspace: '2d', group: 'basic', covers: '2D multi-storey frame' },
  { name: '2d-multi-section-frame', source: ex('multi-section-frame'), workspace: '2d', group: 'basic', covers: '2D frame, several sections' },
  { name: '2d-warren-truss', source: ex('warren-truss'), workspace: '2d', group: 'basic', covers: '2D truss' },
  { name: '2d-howe-truss', source: ex('howe-truss'), workspace: '2d', group: 'basic', covers: '2D truss' },
  { name: '2d-gerber-beam', source: ex('gerber-beam'), workspace: '2d', group: 'basic', covers: '2D hinges (Gerber beam)' },
  { name: '2d-three-hinge-arch', source: ex('three-hinge-arch'), workspace: '2d', group: 'basic', covers: '2D three-hinged arch' },
  { name: '2d-spring-support', source: ex('spring-support'), workspace: '2d', group: 'basic', covers: '2D spring support' },
  { name: '2d-thermal', source: ex('thermal'), workspace: '2d', group: 'basic', covers: '2D thermal load' },
  { name: '2d-settlement', source: ex('settlement'), workspace: '2d', group: 'basic', covers: '2D support settlement' },
  { name: '2d-frame-cirsoc-dl', source: ex('frame-cirsoc-dl'), workspace: '2d', group: 'basic', covers: '2D load cases and CIRSOC combinations' },
  { name: '2d-building-3story-dlw', source: ex('building-3story-dlw'), workspace: '2d', group: 'basic', covers: '2D D/L/W cases and combinations' },
  { name: '2d-frame-seismic', source: ex('frame-seismic'), workspace: '2d', group: 'basic', covers: '2D seismic case and combinations' },
  { name: '2d-hidden-mechanism', source: ex('hidden-mechanism'), workspace: '2d', group: 'basic', covers: 'refusal: a mechanism the solver must refuse' },

  // ── Basic, 3D ──
  { name: '3d-portal-frame', source: ex('3d-portal-frame'), workspace: '3d', group: 'basic', covers: '3D frame' },
  { name: '3d-space-truss', source: ex('3d-space-truss'), workspace: '3d', group: 'basic', covers: '3D truss' },
  { name: '3d-torsion-beam', source: ex('3d-torsion-beam'), workspace: '3d', group: 'basic', covers: '3D torsion' },
  { name: '3d-grid-slab', source: ex('3d-grid-slab'), workspace: '3d', group: 'basic', covers: '3D grillage' },
  { name: '3d-tower', source: ex('3d-tower'), workspace: '3d', group: 'basic', covers: '3D braced tower' },
  { name: '3d-hinged-arch', source: ex('hinged-arch-3d'), workspace: '3d', group: 'basic', covers: '3D hinged arch' },
  { name: '3d-building', source: ex('3d-building'), workspace: '3d', group: 'basic', covers: '3D building, cases and combinations' },
  { name: '2d-in-3d-portal-frame', source: ex('portal-frame'), workspace: '3d', group: 'basic', covers: 'a 2D example solved in the 3D workspace' },

  // ── PRO: self-weight rules, combinations, shells, advanced analyses ──
  { name: 'pro-3d-portal-frame', source: ex('3d-portal-frame'), workspace: 'pro', advanced: ['pdelta', 'modal', 'spectral', 'buckling'], group: 'pro', covers: 'PRO frame: P-Δ, modal, spectral, buckling' },
  { name: 'pro-3d-tower', source: ex('3d-tower'), workspace: 'pro', advanced: ['pdelta', 'modal', 'buckling'], group: 'pro', covers: 'PRO braced tower: P-Δ, modal, buckling' },
  { name: 'pro-deep-beam-shell', source: ex('deep-beam-shell'), workspace: 'pro', group: 'pro', covers: 'PRO shell (MITC4 quads in membrane)' },
  { name: 'pro-rc-qa-diagnostic-shells', source: ex('rc-qa-diagnostic-shells'), workspace: 'pro', group: 'pro', covers: 'PRO slab and wall shells with frame members, combinations' },
  { name: 'pro-mat-foundation', source: ex('mat-foundation'), workspace: 'pro', group: 'pro', covers: 'PRO mat on plates with a frame' },

  // ── PRO with design on: CIRSOC 201, CIRSOC 301, footings ──
  { name: 'design-rc-design-qa-8', source: ex('rc-design-qa-8'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201 code check of an RC frame' },
  { name: 'design-rc-design-qa-row2', source: ex('rc-design-qa-row2'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201, shear row 2 (Table 9.7.6.2.2)' },
  { name: 'design-rc-design-qa-seismic', source: ex('rc-design-qa-seismic'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201 with a seismic case' },
  { name: 'design-rc-beam-flexure', source: ex('rc-beam-flexure'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201 beam flexure' },
  { name: 'design-rc-qa-diagnostic', source: ex('rc-qa-diagnostic'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201, 10 cases and 12 combinations' },
  { name: 'design-steel-3d-portal-frame', source: ex('3d-portal-frame'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 301 steel check' },
  { name: 'design-steel-3d-tower', source: ex('3d-tower'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 301 steel check, angles and I sections' },
  { name: 'design-steel-pipe-rack', source: ex('pipe-rack'), workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 301 steel check, HEB and IPE' },
  { name: 'design-footing-rc-footing-cad-poc', source: { ded: 'src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json' }, workspace: 'pro', design: true, group: 'design', covers: 'CIRSOC 201 frame and an isolated footing on a soil profile' },
];
