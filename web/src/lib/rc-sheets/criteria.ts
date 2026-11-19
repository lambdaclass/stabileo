/**
 * The criteria Stabileo takes where the code leaves room, every one within what the code asks: a
 * criterion only adds a rule, it never relaxes a check. Each is a number the project may state in
 * its design data (`designOptions.criteria`), in the unit it is shown in; what it leaves out is
 * read at its default. Most come from the FIUBA reinforced-concrete course notes;
 * the sheets cite them as `CRITERION`, which the views translate.
 */

export const CRITERION = '{criterion}';

/** A clause with the criterion after it, or the criterion alone. */
export const withCriterion = (clause?: string): string => (clause ? `${clause}; ${CRITERION}` : CRITERION);

/** A text with the criterion's token in the reader's language. */
export const localizeCriterion = (s: string | undefined, tr: (key: string) => string): string =>
  s ? s.split(CRITERION).join(tr('rcSheets.criterion')) : '';

export type CriterionFamily = 'beam' | 'column' | 'slab';
export const CRITERION_FAMILIES: readonly CriterionFamily[] = ['beam', 'column', 'slab'];

/**
 * One criterion: its family, its default and range as stated, the unit it is stated in, an
 * optional prefix (`h/` for a divisor) and `scale`, what the stated value is divided by for the
 * design (100 for cm and %).
 */
export interface CriterionSpec { family: CriterionFamily; value: number; min: number; max: number; step: number; unit: string; prefix?: string; scale?: number; digits?: number; integer?: true }

const cm = (value: number, min: number, max: number, step = 1): CriterionSpec => ({ family: 'beam', value, min, max, step, unit: 'cm', scale: 100 });

export const CRITERIA = {
  beamStirrupSpacing: { ...cm(30, 10, 60), family: 'beam' },
  beamFourLegsWidth: { ...cm(40, 20, 200, 5), family: 'beam' },
  beamStirrupDiameters: { family: 'beam', value: 2, min: 1, max: 4, step: 1, unit: '', integer: true },
  beamHangerShare: { family: 'beam', value: 50, min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  beamCompressionMargin: { family: 'beam', value: 30, min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  beamKneeHaunch: { family: 'beam', value: 0.7, min: 0.2, max: 3, step: 0.05, unit: '%', scale: 100, digits: 2 },
  beamMinDepth: { ...cm(12, 8, 60), family: 'beam' },
  beamWidthFrom: { family: 'beam', value: 5, min: 2, max: 10, step: 0.5, unit: '', prefix: 'b ≥ h/', digits: 1 },
  beamWidthTo: { family: 'beam', value: 3, min: 1, max: 6, step: 0.5, unit: '', prefix: 'b ≤ h/', digits: 1 },
  beamSectionStep: { ...cm(5, 1, 10), family: 'beam' },
  columnSwayKMin: { family: 'column', value: 1.2, min: 1, max: 2.5, step: 0.05, unit: '', prefix: 'k ≥ ', digits: 2 },
  columnBarPitch: { ...cm(30, 15, 50), family: 'column' },
  columnCornerOnlyFace: { ...cm(40, 20, 80, 5), family: 'column' },
  columnRowClear: { family: 'column', value: 4 / 3, min: 1, max: 2.5, step: 0.01, unit: '·dagg', digits: 2 },
  slabOneWaySpacing: { ...cm(25, 10, 45), family: 'slab' },
  slabDistributionShare: { family: 'slab', value: 20, min: 0, max: 60, step: 5, unit: '%', scale: 100 },
  slabJoinThickness: { ...cm(2, 0, 10, 0.5), family: 'slab', digits: 1 },
  slabBendOneWay: { family: 'slab', value: 7, min: 5, max: 12, step: 0.5, unit: '', prefix: 'ln/', digits: 1 },
  slabBendTwoWay: { family: 'slab', value: 8, min: 5, max: 12, step: 0.5, unit: '', prefix: 'ln/', digits: 1 },
  slabMinThickness: { ...cm(8, 5, 30), family: 'slab' },
} as const satisfies Record<string, CriterionSpec>;

export type CriterionId = keyof typeof CRITERIA;
export const CRITERION_IDS = Object.keys(CRITERIA) as CriterionId[];

/** The criteria a project states, in the units they are shown in. */
export type CriteriaValues = Partial<Record<CriterionId, number>>;

/** Every criterion as the design reads it: lengths in m, shares as fractions, divisors and factors as they are. */
export type Criteria = Record<CriterionId, number>;

export const criterionSpec = (id: CriterionId): CriterionSpec => CRITERIA[id];
const spec = criterionSpec;

const inRange = (id: CriterionId, v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= spec(id).min - 1e-9 && v <= spec(id).max + 1e-9 && (!spec(id).integer || Number.isInteger(v));

/** The criteria a stored shape states, each kept only when it is one and within its range and off its default; undefined when none is. */
export function readCriteria(raw: unknown): CriteriaValues | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: CriteriaValues = {};
  for (const id of CRITERION_IDS) if (inRange(id, o[id]) && Math.abs(o[id] - spec(id).value) > 1e-9) out[id] = o[id];
  return Object.keys(out).length ? out : undefined;
}

/** Every criterion as the design reads it, the stated ones over the defaults. */
export function criteriaOf(stated?: CriteriaValues): Criteria {
  const out = {} as Criteria;
  for (const id of CRITERION_IDS) {
    const s = spec(id), v = stated?.[id];
    const raw = inRange(id, v) ? v : s.value;
    out[id] = s.scale ? raw / s.scale : raw;
  }
  return out;
}

export const DEFAULT_CRITERIA: Criteria = criteriaOf();

/** The criteria a context carries, the defaults where it carries none. */
export const critOf = (c: { criteria?: Criteria }): Criteria => c.criteria ?? DEFAULT_CRITERIA;

/** The stated criteria that differ from their defaults, as one key, or null when none does: the defaults are no change. */
export const criteriaKey = (stated?: CriteriaValues): CriteriaValues | null => readCriteria(stated) ?? null;

export const criteriaOfFamily = (f: CriterionFamily): CriterionId[] => CRITERION_IDS.filter((id) => spec(id).family === f);
