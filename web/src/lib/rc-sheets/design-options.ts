/**
 * The definitions taken before design that the reinforcement sheets read, kept with the project's
 * design data (`ProjectDesignData.designOptions`, and `columnEndZones` beside it): how the beams
 * take torsion, their moments at the support faces, the slab as their flange, bent-up bars in beams
 * and in slabs, denser ties at column ends and chapter 18. Projects that kept them under
 * `rcSheets` read them from there until they are stated anew.
 */
import type { SheetCode, TorsionMode } from './types';

export type DesignOptionFlag = 'faces' | 'flange' | 'bentBars' | 'slabBentBars' | 'seismic';
export const DESIGN_OPTION_FLAGS: readonly DesignOptionFlag[] = ['faces', 'flange', 'bentBars', 'slabBentBars', 'seismic'];

/**
 * What a row with no arrangement for its section and concrete may be offered: a stronger concrete
 * (`raiseFc` false: never), up to `fcMax` MPa, among `fcClasses` (the code's classes when absent).
 */
export interface AlternativeOptions { raiseFc?: false; fcMax?: number; fcClasses?: number[] }

/** Each flag on when true; torsion by equilibrium when absent. */
export type DesignOptions = { torsion?: TorsionMode; alternatives?: AlternativeOptions } & Partial<Record<DesignOptionFlag, true>>;

export type DesignOptionKey = DesignOptionFlag | 'torsion' | 'endZones' | 'minTieSpacing' | 'alternatives';

const flagsOf = (o: Record<string, unknown>, torsion: (x: unknown) => boolean): DesignOptions => ({
  ...(torsion(o.torsion) ? { torsion: o.torsion as TorsionMode } : {}),
  ...Object.fromEntries(DESIGN_OPTION_FLAGS.filter((k) => o[k] === true).map((k) => [k, true])),
  ...((a) => (a ? { alternatives: a } : {}))(alternativesOf(o.alternatives)),
});

const strength = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 10 && x <= 120;

function alternativesOf(raw: unknown): AlternativeOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const classes = Array.isArray(o.fcClasses) ? [...new Set(o.fcClasses.filter(strength))].sort((p, q) => p - q) : [];
  const out: AlternativeOptions = {
    ...(o.raiseFc === false ? { raiseFc: false as const } : {}),
    ...(strength(o.fcMax) ? { fcMax: o.fcMax } : {}),
    ...(classes.length ? { fcClasses: classes } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

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
  alternatives: { cirsoc: '§19.2; FIUBA §3.1', aci: '§19.2', ec2: 'Table 3.1', ts500: 'Table 3.1' },
};

const CODE_NAME: Record<SheetCode, string> = { 'cirsoc201-2025': 'CIRSOC 201-2025', 'aci318-19': 'ACI 318-19', 'en1992-1-1': 'EN 1992-1-1', 'bs-en1992-1-1': 'BS EN 1992-1-1', 'ts500-2000': 'TS 500' };

/** What an option applies under the active code: its clause, with the code's name; and, where it does not apply, the i18n key of why. */
export function optionRule(key: DesignOptionKey, code: SheetCode): { clause: string; off?: string } {
  const f = familyOf(code), r = RULES[key], clause = r[f];
  const off = r.off?.[f];
  return { clause: clause ? `${CODE_NAME[code]} ${clause}` : CODE_NAME[code], ...(off ? { off } : {}) };
}
