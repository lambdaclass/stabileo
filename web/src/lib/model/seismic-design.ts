/**
 * How a seismic project designs its concrete: which members resist the earthquake (primary) and
 * which only follow it (secondary), the inertia each category takes in the analysis, the
 * overstrength of capacity design, the strong-column ratio, and the storeys whose forces are
 * amplified because they are softer than the rest (open ground floors, lighter infill).
 */
import { CIRSOC201_STIFFNESS } from '../engine/member-behaviour';

export type SeismicRole = 'primary' | 'secondary';
/** Frame members only: walls and slabs are shells, and the solver takes no inertia factor on a shell yet. */
export type SeismicCategory = 'primaryBeam' | 'secondaryBeam' | 'primaryColumn' | 'secondaryColumn';
export const SEISMIC_CATEGORIES: readonly SeismicCategory[] = ['primaryBeam', 'secondaryBeam', 'primaryColumn', 'secondaryColumn'];
export type SoftKind = 'column' | 'beam' | 'wall';

export interface SoftStoreys {
  /** Storey elevations (the floor at the top of the storey), m. */
  levels: number[];
  shear: Record<SoftKind, number>;
  moment: Record<SoftKind, number>;
}

export interface SeismicDesignSettings {
  /** λo: probable over nominal strength of the bars (1,25·fy in the probable moment, more with strain hardening). */
  overstrength: number;
  /** ΣMn columns ≥ this × ΣMn beams at each joint. */
  strongColumn: number;
  /** Slab bars within the effective flange count in a beam's negative capacity. */
  slabFlange: boolean;
  /** Inertia factors per category for the analysis (Tabla 6.6.3.1.1(a) by default). */
  inertia: Record<SeismicCategory, number>;
  /**
   * Roles fixed by hand, by element id, as older projects stored them. They are read once into
   * the lateral-system declaration (`lateral-system.ts`, `migrateDesignData`), which is what the
   * roles come from now, and are kept empty here.
   */
  roles: Record<string, SeismicRole>;
  softStoreys: SoftStoreys;
}

export const DEFAULT_SOFT_FACTOR = 1.5;

export function defaultSeismicDesign(): SeismicDesignSettings {
  const s = CIRSOC201_STIFFNESS;
  const soft = { column: DEFAULT_SOFT_FACTOR, beam: DEFAULT_SOFT_FACTOR, wall: DEFAULT_SOFT_FACTOR };
  return {
    overstrength: 1.4, strongColumn: 1.2, slabFlange: true,
    inertia: { primaryBeam: s.beam, secondaryBeam: s.beam, primaryColumn: s.column, secondaryColumn: s.column },
    roles: {},
    softStoreys: { levels: [], shear: { ...soft }, moment: { ...soft } },
  };
}

const num = (v: unknown, d: number, lo = 0, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) && v > lo && v <= hi ? v : d);

/** Settings as stored, over the defaults, keeping only what is well formed. */
export function migrateSeismicDesign(raw: unknown): SeismicDesignSettings {
  const d = defaultSeismicDesign();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const inertia = { ...d.inertia };
  const ri = (r.inertia ?? {}) as Record<string, unknown>;
  for (const k of SEISMIC_CATEGORIES) inertia[k] = num(ri[k], d.inertia[k], 0, 1);
  const roles: Record<string, SeismicRole> = {};
  for (const [k, v] of Object.entries((r.roles ?? {}) as Record<string, unknown>)) if (v === 'primary' || v === 'secondary') roles[k] = v;
  const ss = (r.softStoreys ?? {}) as Record<string, unknown>;
  const f = (o: unknown, base: Record<SoftKind, number>) => {
    const x = (o ?? {}) as Record<string, unknown>;
    return { column: num(x.column, base.column, 0, 10), beam: num(x.beam, base.beam, 0, 10), wall: num(x.wall, base.wall, 0, 10) };
  };
  return {
    overstrength: num(r.overstrength, d.overstrength, 0.9, 2),
    strongColumn: num(r.strongColumn, d.strongColumn, 0.9, 3),
    slabFlange: typeof r.slabFlange === 'boolean' ? r.slabFlange : d.slabFlange,
    inertia, roles,
    softStoreys: {
      levels: Array.isArray(ss.levels) ? (ss.levels as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [],
      shear: f(ss.shear, d.softStoreys.shear), moment: f(ss.moment, d.softStoreys.moment),
    },
  };
}
