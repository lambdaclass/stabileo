/**
 * The reinforcement of a beam line as it is built: bars along the line with where each starts and
 * ends, its face, its row, its hooks and the bar it laps with, and the stirrup zones along it.
 * Positions are metres along the line from its first node. The members' three regions (start,
 * span, end) are what the verifier reads; they are projected from this, and a line with no record
 * is read from them (`engine/design/beam-line.ts`).
 */

export const BEAM_LINE_VERSION = 1 as const;

export type BeamBarFace = 'top' | 'bottom';

/** What a bar does in the line, for marks and schedules. */
export type BeamBarRole = 'main' | 'support' | 'mounting' | 'extra';

export interface BeamLineBar {
  id: string;
  face: BeamBarFace;
  /** Row from the face, 0 at the face. */
  row: number;
  count: number;
  diameter: number;
  /** Metres along the line. */
  from: number;
  to: number;
  hookStart?: boolean;
  hookEnd?: boolean;
  role: BeamBarRole;
}

export interface BeamStirrupZone {
  id: string;
  from: number;
  to: number;
  diameter: number;
  legs: number;
  spacing: number;
}

export interface BeamLineReinforcement {
  version: typeof BEAM_LINE_VERSION;
  /** Members in order along the line. */
  members: number[];
  /** Each member's length, m, in the same order. */
  lengths: number[];
  bars: BeamLineBar[];
  stirrups: BeamStirrupZone[];
  /** Skin bars of a deep beam, per member id (§9.7.2.3). */
  skin?: Record<string, { diameter: number; spacing: number }>;
  /** The rebar hash of each member's projection when this was saved: a record whose members
   *  have changed since is stale and is read from the members again. */
  memberHashes?: Record<string, string>;
  /** Consecutive members reinforced as one span (predefined spans), by index along the line. */
  spans?: number[][];
}

export const lineKey = (members: readonly number[]): string => members.join('-');
