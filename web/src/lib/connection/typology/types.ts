/**
 * The typologies of a steel joint: what each one is made of and what its design returns. A
 * typology composes the clause modules of `lib/connection/` (bolts J.3, welds J.2, connecting
 * elements J.4, the column under flange forces J.10, the base plate J.8–J.9, prying) and never
 * restates a clause itself.
 *
 * Units inside: mm, MPa, kN, kN·m. The parts it draws are in metres, in global coordinates.
 */
import type { BoltGrade } from '../bolted-joint';

export type Typology = 'basePinned' | 'baseFixed' | 'endPlate' | 'shearTab' | 'splice' | 'gusset' | 'knee' | 'apex';
export const TYPOLOGIES: readonly Typology[] = ['basePinned', 'baseFixed', 'endPlate', 'shearTab', 'splice', 'gusset', 'knee', 'apex'];

export type V3 = { x: number; y: number; z: number };

export interface JointSection { name: string; d: number; bf: number; tf: number; tw: number; r?: number; A: number; Fy: number; Fu: number; /** The catalogue's shape: I, H, U, L, RHS, CHS… */ shape?: string }

export interface JointMember {
  id: number;
  kind: 'column' | 'beam' | 'brace';
  /** Unit vector from the joint along the member. */
  dir: V3;
  /** Angle above the horizontal, degrees (0 for a beam, 90 for a column rising from the joint). */
  inclination: number;
  section: JointSection | null;
  /** Its end forces at the joint, envelope magnitudes: axial (+ tension), shear, strong-axis moment. */
  N: number; V: number; M: number;
  /** A moment release at this end. */
  released: boolean;
}

export interface TypologyContext {
  nodeId: number;
  /** The joint, m. */
  origin: V3;
  members: JointMember[];
  /** The support at the node, when it is a column base. */
  support: 'fixed' | 'pinned' | null;
  /** Concrete under a base, MPa. */
  concreteFc?: number;
}

export interface TypologyParams {
  plateT: number;
  boltD: number;
  boltGrade: BoltGrade;
  /** Bolt rows (and columns where the typology has two). */
  rows: number;
  weldLeg: number;
  stiffeners?: boolean;
  /** Base plate plan, mm, and anchors. */
  plateN?: number; plateB?: number; anchorD?: number; anchors?: number;
}

export interface TypologyCheck { key: string; labelKey: string; demand: number; capacity: number; unit: string; ratio: number }

/** A box: centre, two in-plane unit axes and the size along u, v and their normal, metres. */
export interface Part { kind: 'plate' | 'bolt' | 'weld' | 'stiffener' | 'anchor'; center: V3; u: V3; v: V3; size: [number, number, number] }

export type TypologyState = 'designed' | 'exceeded' | 'unresolved';

export interface TypologyDesign {
  kind: Typology;
  params: TypologyParams;
  checks: TypologyCheck[];
  parts: Part[];
  state: TypologyState;
  /** Why it cannot be resolved here, a locale key. */
  unresolvedKey?: string;
  /** The member the connection is detailed for (the beam, the brace, the column at a base). */
  mainId?: number;
  /** What the design assumed for want of data, locale keys. */
  assumptions?: string[];
}
