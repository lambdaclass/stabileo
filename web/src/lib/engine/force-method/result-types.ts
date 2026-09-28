/**
 * What the force method returns, plane or space: the states, the coefficients
 * both ways, the answer and its check against the stiffness method.
 */
import type { Redundant, IndeterminacyCount } from './primary';

export interface BarState {
  elementId: number;
  L: number;
  /**
   * The app's convention: N positive in tension, the J end read from the
   * other side. In 3D, v and m are the local xy plane's (Vy, Mz); the other
   * plane and torsion ride alongside.
   */
  ends: {
    nStart: number; vStart: number; mStart: number; nEnd: number; vEnd: number; mEnd: number;
    myStart?: number; myEnd?: number; tStart?: number;
  };
  /** m is Mz in 3D (M in 2D); my and t only in 3D. */
  samples: Array<{ x: number; m: number; n: number; my?: number; t?: number }>;
}

export interface StateResult {
  bars: BarState[];
  /** Reactions of the primary in this state, per restrained component, node frame. */
  reactions: Array<{ nodeId: number; component: number; value: number }>;
}

export interface TermRow {
  elementId: number | null;
  source: 'bending' | 'axial' | 'torsion' | 'thermal' | 'spring' | 'bar' | 'settlement';
  value: number;
}

export interface Geometry {
  /** True for a space structure: nodes carry y, bars their local axes. */
  is3D?: boolean;
  nodes: Array<{ id: number; x: number; z: number; y?: number }>;
  elements: Array<{
    id: number; nodeI: number; nodeJ: number; type: 'frame' | 'truss'; hingeStart: boolean; hingeEnd: boolean;
    /** 3D: local y and z, for drawing Mz and My off the bar. */
    ey?: [number, number, number]; ez?: [number, number, number];
  }>;
  /** `restrained` has 3 entries in 2D and 6 in 3D. */
  supports: Array<{ nodeId: number; restrained: boolean[]; spring: boolean; angle?: number }>;
}

export interface ForceMethodResult {
  is3D?: boolean;
  count: IndeterminacyCount;
  isostatic: boolean;
  redundants: Redundant[];
  original: Geometry;
  primary: Geometry;
  /** states[0] is state 0; states[i] is Xᵢ = 1. */
  states: StateResult[];
  delta: number[][];
  delta0: number[];
  /** Prescribed displacement at each redundant — 0 unless a released support settles. */
  prescribed: number[];
  deltaTerms: TermRow[][][];
  delta0Terms: TermRow[][];
  /** The same coefficients, as displacements of the primary structure. */
  deltaCheck: number[][];
  delta0Check: number[];
  X: number[];
  final: StateResult;
  verification: { maxForceDiff: number; maxReactionDiff: number; scale: number; ok: boolean };
  /** The stiffness method's answer on the original structure, for Step 9's table. */
  stiffness: StateResult;
}
