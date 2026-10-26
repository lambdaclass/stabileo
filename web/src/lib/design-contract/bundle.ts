/**
 * What the calculation hands to design: the model as analysed, the combinations with where they
 * came from, and the forces at stations along every member, per combination.
 *
 * Design reads this and never recomputes it. Versioned, serialisable, and with its units stated,
 * so a design module in another repository, or another program, can read it without the app.
 */
export const STRUCTURAL_BUNDLE_VERSION = 2 as const;

/**
 * The unit of every number in the bundle, by kind of quantity.
 *
 * Version 2 made the materials honour `stress`: version 1 declared kPa and carried the model's
 * MPa, and a concrete's f'c in `fy`.
 */
export interface BundleUnits {
  length: 'm';
  force: 'kN';
  moment: 'kN·m';
  /** Every modulus and strength of a material: e, g, fy, fu, fc and the timber reference values. */
  stress: 'kPa';
  /** A material's weight density, `rho`. */
  density: 'kN/m³';
  /** A material's coefficient of thermal expansion, `alpha`. */
  thermalExpansion: '1/°C';
  /** A section's `a`. */
  area: 'm²';
  /** A section's `iy`, `iz` and `j`. */
  inertia: 'm⁴';
  /** A section's `rotation` about the member axis. */
  angle: 'deg';
}

/** What a material is, as the calculation classified it. */
export type BundleMaterialFamily = 'concrete' | 'steel' | 'timber' | 'masonry' | 'aluminium' | 'unknown';

/**
 * A material, every stress in `units.stress`.
 *
 * A concrete states its specified compressive strength as `fc` and carries no `fy`; a metal
 * states `fy` (and `fu` when known) and no `fc`.
 */
export interface BundleMaterial {
  id: number;
  name: string;
  family: BundleMaterialFamily;
  /** Young's modulus. */
  e?: number;
  /** Shear modulus, when the material states one. */
  g?: number;
  nu?: number;
  /** Weight density, `units.density`. */
  rho?: number;
  /** Coefficient of thermal expansion, `units.thermalExpansion`. Absent: the material did not state one. */
  alpha?: number;
  fy?: number;
  fu?: number;
  fc?: number;
  /** Timber reference design values, stresses in `units.stress`. */
  timber?: { fb: number; ft: number; fc: number; fcPerp?: number; fv: number; e: number; emin?: number; kind: string; cf?: unknown };
  [k: string]: unknown;
}

export interface BundleStation {
  /** Normalised position along the member, 0 at node I. */
  t: number;
  /** Distance from node I, m. */
  x: number;
  /** Axial, + tension (the solver's sign), and shears and moments in member local axes. */
  n: number; vy: number; vz: number; my: number; mz: number; torsion: number;
}

export interface BundleCombination {
  id: number;
  name: string;
  /** The code, edition and rule that wrote it, when the generator did. */
  origin?: { code: string; family?: string; edition?: string; rule?: string; purpose?: string };
}

export interface BundleMember {
  id: number;
  nodeI: number;
  nodeJ: number;
  sectionId: number;
  materialId: number;
  length: number;
  /** Per combination id, the forces at the member's stations. */
  stations: Record<number, BundleStation[]>;
}

export interface StructuralBundle {
  version: typeof STRUCTURAL_BUNDLE_VERSION;
  units: BundleUnits;
  /** Revision of the analysis these forces come from; a design outcome is tied to it. */
  analysisRevision: number;
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  /** Geometry only: lengths in `units.length`, `a` in `units.area`, `iy`/`iz`/`j` in `units.inertia`. */
  sections: Array<{ id: number; name: string; [k: string]: unknown }>;
  materials: BundleMaterial[];
  combinations: BundleCombination[];
  members: BundleMember[];
  /** Support reactions per combination id: node id → [Fx, Fy, Fz, Mx, My, Mz]. */
  reactions: Record<number, Record<number, [number, number, number, number, number, number]>>;
}
