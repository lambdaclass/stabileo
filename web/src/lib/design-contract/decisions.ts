/**
 * The design decisions a project stores: what was chosen, not what was computed.
 *
 * Results are recomputed when a project opens; decisions are what a person or a design run
 * settled and must survive a save. Versioned so the schema can grow (physical elements, typed
 * reinforcement, connection typologies) without breaking older files.
 */
import type { ProvidedReinforcement, SlabPanelReinforcement, WallReinforcement } from './reinforcement';
import type { BeamLineReinforcement } from './beam-line';

export const DESIGN_DECISIONS_VERSION = 1 as const;

export type DecisionState = 'proposed' | 'edited' | 'locked';

export interface ElementDecision {
  state: DecisionState;
  reinforcement?: ProvidedReinforcement;
  /** Steel: unbraced length for lateral-torsional buckling, and effective-length factors. */
  bracing?: { Lb?: number; Kx?: number; Ky?: number };
}

export interface DesignDecisions {
  version: typeof DESIGN_DECISIONS_VERSION;
  byElement: Record<number, ElementDecision>;
  /** Connection designs as the connection module stores them, by joint key. */
  byJoint: Record<string, unknown>;
  /** Footings as the model stores them. */
  footings: unknown[];
}

/** What the decisions read from a model snapshot: the shape every field has today. */
export interface DecisionSource {
  elements: Iterable<[number, {
    reinforcement?: ProvidedReinforcement; unbracedLength?: number; kStrong?: number; kWeak?: number;
  }]>;
  /** Members a person retouched; absent, a member with bars counts as proposed. */
  manual?: ReadonlySet<number>;
  /** Members whose bars a person pinned against a redesign. */
  locked?: ReadonlySet<number>;
  jointDesigns?: Record<string, unknown> | Map<string, unknown>;
  footings?: Iterable<unknown>;
}

/**
 * The decisions of a project as it stands, from the fields that hold them today. The first
 * version of the schema reads them where they already are: nothing moves in the file yet.
 */
export function decisionsOf(src: DecisionSource): DesignDecisions {
  const byElement: Record<number, ElementDecision> = {};
  for (const [id, e] of src.elements) {
    const bracing = {
      ...(e.unbracedLength !== undefined ? { Lb: e.unbracedLength } : {}),
      ...(e.kStrong !== undefined ? { Kx: e.kStrong } : {}),
      ...(e.kWeak !== undefined ? { Ky: e.kWeak } : {}),
    };
    if (!e.reinforcement && Object.keys(bracing).length === 0) continue;
    byElement[id] = {
      state: src.locked?.has(id) ? 'locked' : src.manual?.has(id) ? 'edited' : 'proposed',
      ...(e.reinforcement ? { reinforcement: e.reinforcement } : {}),
      ...(Object.keys(bracing).length > 0 ? { bracing } : {}),
    };
  }
  const joints = src.jointDesigns instanceof Map ? Object.fromEntries(src.jointDesigns) : (src.jointDesigns ?? {});
  return { version: DESIGN_DECISIONS_VERSION, byElement, byJoint: joints, footings: [...(src.footings ?? [])] };
}

// ─── What the project stores today ─────────────────────────────────

/**
 * The decisions the model keeps beside the bars: which members a person locked against a
 * redesign, the last proposal the design gave each member (what «revert» goes back to, also
 * after the project is reopened), and the copies saved of a level's or the whole frame's bars.
 */
export interface StoredDecisions {
  version: 1;
  locked: number[];
  proposals: Record<string, ProvidedReinforcement>;
  copies: DecisionCopy[];
  /** Beam lines edited as lines, by `lineKey`. */
  lines?: Record<string, BeamLineReinforcement>;
  /** Beam lines kept equal: groups of line keys. */
  frameGroups?: string[][];
  /** Lap length of a column's bars a person set, m, by column element id (one value per stack group). */
  columnLaps?: Record<string, number>;
  /** Walls' reinforcement a person set, by wall id (one wall on one level). */
  walls?: Record<string, WallReinforcement>;
  /** Slab panels' reinforcement a person set, by panel id. */
  slabs?: Record<string, SlabPanelReinforcement>;
  /** Joist-and-block panels' systems a person set, by panel id (`engine/joists/joist-design.ts`). */
  joists?: Record<string, unknown>;
}

export interface DecisionCopy {
  id: string;
  label: string;
  /** ISO time it was saved. */
  at: string;
  /** The level it is of; absent: the whole frame. */
  levelId?: string;
  /** Each member's bars at the time, null for a member that had none. */
  byElement: Record<string, ProvidedReinforcement | null>;
}

export const emptyStoredDecisions = (): StoredDecisions => ({ version: 1, locked: [], proposals: {}, copies: [] });

export function migrateStoredDecisions(raw: unknown): StoredDecisions {
  if (!raw || typeof raw !== 'object') return emptyStoredDecisions();
  const e = raw as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)))] : []);
  const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, ProvidedReinforcement>) : {});
  const copies = Array.isArray(e.copies) ? (e.copies as Array<Record<string, unknown>>).filter((c) => c && typeof c.id === 'string').map((c) => ({
    id: c.id as string, label: typeof c.label === 'string' ? c.label : '', at: typeof c.at === 'string' ? c.at : '',
    ...(typeof c.levelId === 'string' ? { levelId: c.levelId } : {}),
    byElement: rec(c.byElement) as Record<string, ProvidedReinforcement | null>,
  })) : [];
  const lines = e.lines && typeof e.lines === 'object' && !Array.isArray(e.lines)
    ? Object.fromEntries(Object.entries(e.lines as Record<string, BeamLineReinforcement>).filter(([, l]) => l && Array.isArray(l.members) && Array.isArray(l.bars) && Array.isArray(l.stirrups)))
    : {};
  const frameGroups = Array.isArray(e.frameGroups)
    ? (e.frameGroups as unknown[]).filter((g): g is string[] => Array.isArray(g) && g.every((k) => typeof k === 'string') && g.length > 1)
    : [];
  const walls = e.walls && typeof e.walls === 'object' && !Array.isArray(e.walls)
    ? Object.fromEntries(Object.entries(e.walls as Record<string, WallReinforcement>).filter(([, w]) => w && w.vertical && w.horizontal))
    : {};
  return {
    version: 1, locked: ids(e.locked), proposals: rec(e.proposals), copies,
    ...(Object.keys(lines).length ? { lines } : {}),
    ...(Object.keys(walls).length ? { walls } : {}),
    ...(e.joists && typeof e.joists === 'object' && !Array.isArray(e.joists) ? { joists: e.joists as Record<string, unknown> } : {}),
    ...(e.slabs && typeof e.slabs === 'object' && !Array.isArray(e.slabs) ? { slabs: Object.fromEntries(Object.entries(e.slabs as Record<string, SlabPanelReinforcement>).filter(([, x]) => x && x.base && Array.isArray(x.bands))) } : {}),
    ...(frameGroups.length ? { frameGroups } : {}),
    ...((laps) => (Object.keys(laps).length ? { columnLaps: laps } : {}))(
      e.columnLaps && typeof e.columnLaps === 'object' && !Array.isArray(e.columnLaps)
        ? Object.fromEntries(Object.entries(e.columnLaps as Record<string, unknown>).filter((x): x is [string, number] => typeof x[1] === 'number' && Number.isFinite(x[1]) && x[1] > 0))
        : {}),
  };
}

/** The proposals a design run just wrote, kept to revert to. */
export function withProposals(d: StoredDecisions, written: Iterable<[number, ProvidedReinforcement]>): StoredDecisions {
  const proposals = { ...d.proposals };
  for (const [id, r] of written) proposals[String(id)] = JSON.parse(JSON.stringify(r));
  return { ...d, proposals };
}
