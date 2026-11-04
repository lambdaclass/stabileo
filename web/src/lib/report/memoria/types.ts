/**
 * The memoria de cálculo as data: what each chapter states, already read from the model, its
 * analysis and its design. The renderer turns it into a document in the language chosen for it;
 * nothing here is computed again when it is printed.
 */
import type { CheckRow } from '../../design-contract';
import type { LoadBasis } from '../../model/design-data';

export type MemberFamily = 'beam' | 'column' | 'wall' | 'slab' | 'footing' | 'joint' | 'steel' | 'connection' | 'seismic' | 'timber' | 'aluminium' | 'coldFormed' | 'composite' | 'masonry' | 'fire';
export const MEMBER_FAMILIES: readonly MemberFamily[] = ['beam', 'column', 'wall', 'slab', 'footing', 'joint', 'steel', 'connection', 'seismic', 'timber', 'aluminium', 'coldFormed', 'composite', 'masonry', 'fire'];
/**
 * The families whose results are calculations, never stated as satisfying a code: the metallic
 * ones (the steel commitment) and the materials added with them, checked from values the engineer
 * enters or from codes this app reads for the first time.
 */
export const CAUTIOUS_FAMILIES: ReadonlySet<string> = new Set(['steel', 'connection', 'timber', 'aluminium', 'coldFormed', 'composite', 'fire']);
/** The codes those results come from, read as experimental in the scope chapter. */
export const EXPERIMENTAL_CODES: ReadonlySet<string> = new Set(['cirsoc-301', 'cirsoc-601', 'cirsoc-303', 'en-1999-1-1', 'aisc-360', 'nds', 'en-1993-1-2', 'fema-356', 'timber-fire', 'project-fire-table', 'aci-318', 'en-1992-1-1', 'bs-en-1992-1-1', 'en-1993-1-1', 'bs-en-1993-1-1']);

/** The chapters of the catalog, in the order they print; some have parts of their own. */
export const CHAPTERS = {
  cover: [],
  scope: [],
  hypotheses: [],
  actions: [],
  global: ['modal', 'storeyShear', 'drift'],
  summary: [],
  members: MEMBER_FAMILIES,
  notices: [],
  quantities: ['byLevel', 'byType', 'rebar', 'steel', 'connections'],
} as const satisfies Record<string, readonly string[]>;
export type ChapterKey = keyof typeof CHAPTERS;
/** A chapter (`members`) or one of its parts (`members.beam`). */
export type ChapterId = ChapterKey | `${ChapterKey}.${string}`;

export const ALL_CHAPTERS: ChapterId[] = (Object.keys(CHAPTERS) as ChapterKey[]).flatMap((k) => [k, ...CHAPTERS[k].map((p) => `${k}.${p}` as ChapterId)]);

export interface MemoriaElement {
  id: string;
  family: MemberFamily;
  /** How the element is called on the drawings and in the model. */
  name: string;
  level?: string;
  /** Section, material and other data the ficha heads with, as label/value pairs. */
  data: Array<[string, string]>;
  rows: CheckRow[];
  /** What the design assumed or left out for this element, already in words. */
  notes: string[];
  /**
   * What holds the element short of conformity besides its rows, already in words: the member's
   * verdict (`store/member-verdict.ts`). Its rows are local checks; while this is non-empty the
   * element is not stated as satisfying, whatever they read (`memoElementState`).
   */
  heldBy?: string[];
}

/** The element's state, the one the summary, the workbook and the IFC print. */
export type MemoElementState = 'none' | 'fail' | 'open' | 'ok';

/**
 * The element's state from its rows and its holds. A failing row fails it; a row not evaluated,
 * or a hold, leaves it open; only then does it satisfy. One function, so the memoria's summary,
 * the workbook's element column and the IFC's DesignState cannot read the same element apart.
 */
export function memoElementState(e: Pick<MemoriaElement, 'rows' | 'heldBy'>): MemoElementState {
  const held = (e.heldBy?.length ?? 0) > 0;
  if (e.rows.length === 0 && !held) return 'none';
  if (e.rows.some((r) => r.status === 'fail')) return 'fail';
  if (held || e.rows.some((r) => r.status === 'notVerified' || r.status === 'unsupported')) return 'open';
  return 'ok';
}

export interface ScopeEntry {
  code: string;
  /** i18n key of the feature (`capability.<key>`). */
  feature: string;
  offered: boolean;
  clauses: string[];
  limitation?: string;
}

export interface MemoriaInput {
  project: { name: string; client?: string; site?: string; jobNumber?: string; designer?: string; checker?: string; date: string; revision?: string };
  codes: string[];
  scope: ScopeEntry[];
  hypotheses: {
    analysis: string[];
    stiffness: Array<{ label: string; a: number; iy: number; iz: number; j: number; count: number }>;
    diaphragms: Array<{ level: string; nodes: number }>;
    shells: Array<{ kind: string; count: number; thickness: number }>;
    supports: Array<{ kind: string; count: number }>;
  };
  actions: {
    cases: Array<{ name: string; type: string; loads: number }>;
    combinations: Array<{ name: string; expression: string }>;
    basis?: LoadBasis;
  };
  global: {
    modal?: Array<{ mode: number; period: number; mx: number; my: number; cumX: number; cumY: number }>;
    storeyShear?: Array<{ level: string; vx: number; vy: number; kx: number | null; ky: number | null; soft: boolean }>;
    drift?: { limit: number; cd: number; rows: Array<{ level: string; ratioX: number; ratioY: number; status: string }> };
  };
  elements: MemoriaElement[];
  /**
   * The project's verdict over its concrete design members (`store/member-verdict.ts`), already in
   * words: the summary heads with it, so no table of favourable local checks reads as approval.
   */
  verdict?: { state: 'conforms' | 'held' | 'empty'; text: string; reasons: string[] };
  notices: { automatic: string[]; manual: string[] };
  quantities: {
    byLevel: Array<{ level: string; concrete: number; formwork: number; steel: number }>;
    byType: Array<{ kind: string; concrete: number; formwork: number; steel: number; count: number }>;
    rebar: Array<{ diameter: number; length: number; mass: number }>;
    steel: Array<{ profile: string; count: number; length: number; mass: number }>;
    connections: Array<{ item: string; count: number; mass: number }>;
  };
}
