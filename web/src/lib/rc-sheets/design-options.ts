/**
 * The definitions taken before design that the reinforcement sheets read, kept with the project's
 * design data (`ProjectDesignData.designOptions`, and `columnEndZones` beside it): how the beams
 * take torsion, their moments at the support faces, the slab as their flange, bent-up bars in beams
 * and in slabs, denser ties at column ends and chapter 18. Projects that kept them under
 * `rcSheets` read them from there until they are stated anew.
 */
import type { SheetCode, TorsionMode } from './types';

export type DeflectionSupport = 'none' | 'nonFragile' | 'fragile';
export const DEFLECTION_SUPPORTS: readonly DeflectionSupport[] = ['none', 'nonFragile', 'fragile'];
export type LoadMonths = 3 | 6 | 12 | 60;
export const LOAD_MONTHS: readonly LoadMonths[] = [3, 6, 12, 60];

/** What the design data say of deflections: what the members carry, how long the sustained load lasts, its share of the live load, the creep coefficient (EN 1992) and whether to calculate even where the depth spares it. */
export interface DeflectionSettings {
  supports?: DeflectionSupport;
  months?: LoadMonths;
  /** Share of the live load that is sustained, 0 to 1. */
  sustained?: number;
  /** φ(∞, t0) of EN 1992-1-1 §3.1.4. */
  creep?: number;
  always?: true;
}

export type DesignOptionFlag = 'faces' | 'flange' | 'bentBars' | 'slabBentBars' | 'seismic';
export const DESIGN_OPTION_FLAGS: readonly DesignOptionFlag[] = ['faces', 'flange', 'bentBars', 'slabBentBars', 'seismic'];

/** Each flag on when true; torsion by equilibrium when absent; the deflection settings at their defaults when absent (`deflection.ts`). */
export type DesignOptions = { torsion?: TorsionMode; deflection?: DeflectionSettings } & Partial<Record<DesignOptionFlag, true>>;

export type DesignOptionKey = DesignOptionFlag | 'torsion' | 'endZones' | 'minTieSpacing' | 'deflection' | 'creep' | 'months' | 'aggregate';

/** The deflection settings a stored shape states, each kept only when valid; undefined when none is. */
export function readDeflectionSettings(x: unknown): DeflectionSettings | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const out: DeflectionSettings = {
    ...(DEFLECTION_SUPPORTS.includes(o.supports as never) ? { supports: o.supports as DeflectionSettings['supports'] } : {}),
    ...(LOAD_MONTHS.includes(o.months as never) ? { months: o.months as DeflectionSettings['months'] } : {}),
    ...(num(o.sustained, 0, 1) ? { sustained: o.sustained as number } : {}),
    ...(num(o.creep, 0, 6) ? { creep: o.creep as number } : {}),
    ...(o.always === true ? { always: true as const } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

const flagsOf = (o: Record<string, unknown>, torsion: (x: unknown) => boolean): DesignOptions => ({
  ...(torsion(o.torsion) ? { torsion: o.torsion as TorsionMode } : {}),
  ...Object.fromEntries(DESIGN_OPTION_FLAGS.filter((k) => o[k] === true).map((k) => [k, true])),
  ...((d) => (d ? { deflection: d } : {}))(readDeflectionSettings(o.deflection)),
});

/** The options a stored shape states: its own `designOptions`, else those an older project kept under `rcSheets`; undefined when none. */
export function migrateDesignOptions(own: unknown, legacy: unknown): DesignOptions | undefined {
  const out = own && typeof own === 'object'
    ? flagsOf(own as Record<string, unknown>, (x) => x === 'equilibrium' || x === 'compatibility')
    : legacy && typeof legacy === 'object' ? flagsOf(legacy as Record<string, unknown>, (x) => x === 'compatibility') : {};
  return Object.keys(out).length ? out : undefined;
}

type Family = 'aci' | 'cirsoc' | 'ec2' | 'ts500';
const familyOf = (code: SheetCode): Family => (code === 'cirsoc201-2025' ? 'cirsoc' : code === 'aci318-19' ? 'aci' : code === 'ts500-2000' ? 'ts500' : 'ec2');

/** The clause an option applies under each code, empty where the code has none of its own; `off`, the i18n key of why it does not apply there. */
const RULES: Record<DesignOptionKey, Partial<Record<Family, string>> & { off?: Partial<Record<Family, string>> }> = {
  torsion: { cirsoc: '§22.7.3', aci: '§22.7.3', ec2: '6.3.1(2)', ts500: '8.2' },
  faces: { cirsoc: '§9.4.3.2', aci: '§9.4.3.2', ec2: '5.3.2.2(3), 6.2.1(8)' },
  flange: { cirsoc: 'Tabla 6.3.2.1', aci: 'Table 6.3.2.1', ec2: '5.3.2.1' },
  bentBars: { cirsoc: '§9.7.3; FIUBA §11.4', aci: '§9.7.3', ec2: '9.2.1.3' },
  slabBentBars: { cirsoc: '§8.7.4; FIUBA §13.1', aci: '§8.7.4', ec2: '9.3.1.2' },
  endZones: { cirsoc: '§25.7.2.1', aci: '§25.7.2.1', ts500: '7.4.1', off: { ec2: 'designData.opt.off.endZonesEc2' } },
  seismic: { cirsoc: 'Cap. 18', aci: 'Chapter 18', off: { ec2: 'designData.opt.off.seismic', ts500: 'designData.opt.off.seismic' } },
  minTieSpacing: { cirsoc: '§25.7.2.1(a)', aci: '§25.7.2.1(a)', ec2: '8.2(2)', ts500: '7.4.1' },
  deflection: { cirsoc: '§24.2, Tabla 24.2.2, Tabla 24.2.4.1.3', aci: '§24.2, Table 24.2.2, Table 24.2.4.1.3', ec2: '7.4.1, 7.4.3', ts500: '13.2' },
  months: { cirsoc: 'Tabla 24.2.4.1.3', aci: 'Table 24.2.4.1.3', off: { ec2: 'designData.opt.off.months', ts500: 'designData.opt.off.monthsTs500' } },
  creep: { ec2: '3.1.4, 7.4.3(5)', off: { cirsoc: 'designData.opt.off.creep', aci: 'designData.opt.off.creep', ts500: 'designData.opt.off.creep' } },
  aggregate: { cirsoc: '§25.2.1, §25.2.3', aci: '§25.2.1, §25.2.3', ec2: '8.2(2)', off: { ts500: 'designData.opt.off.aggregateTs500' } },
};

const CODE_NAME: Record<SheetCode, string> = { 'cirsoc201-2025': 'CIRSOC 201-2025', 'aci318-19': 'ACI 318-19', 'en1992-1-1': 'EN 1992-1-1', 'bs-en1992-1-1': 'BS EN 1992-1-1', 'ts500-2000': 'TS 500' };

/** What an option applies under the active code: its clause, with the code's name; and, where it does not apply, the i18n key of why. */
export function optionRule(key: DesignOptionKey, code: SheetCode): { clause: string; off?: string } {
  const f = familyOf(code), r = RULES[key], clause = r[f];
  const off = r.off?.[f];
  return { clause: clause ? `${CODE_NAME[code]} ${clause}` : CODE_NAME[code], ...(off ? { off } : {}) };
}
