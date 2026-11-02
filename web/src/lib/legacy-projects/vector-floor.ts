/**
 * The comparison of an old project file's results (#718): the snapshot gate's rule
 * (`compare.mjs`), except that a component may also differ by VECTOR_ATOL of the vector it
 * belongs to: a floating-point round-off bound (1e-10, a hundred times κ·ε on these models'
 * components), far below the gate's own 1e-7 of a quantity's peak. Round-off in a component statics makes zero (a horizontal reaction under
 * vertical loads, a truss member's shear) moves between releases, and against its own peak
 * 5e-14 → 7e-14 kN reads as a 25 % change. Never used by the snapshot gate, whose builds are
 * bit-for-bit reproducible. Families never mix units and never span two records.
 */
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { compareValues, RTOL } from '../../../scripts/results-snapshot/compare.mjs';
import type { Values } from './capture-results';

export const VECTOR_ATOL = 1e-10;

export const UNIT_FAMILIES: Record<string, Record<string, string[]>> = {
  displacements: { translation: ['ux', 'uy', 'uz'], rotation: ['rx', 'ry', 'rz'] },
  reactions: { force: ['rx', 'ry', 'rz', 'fx', 'fy', 'fz'], moment: ['mx', 'my', 'mz'] },
  elementForces: {
    force: ['nStart', 'nEnd', 'vStart', 'vEnd', 'vyStart', 'vyEnd', 'vzStart', 'vzEnd'],
    moment: ['mStart', 'mEnd', 'mxStart', 'mxEnd', 'myStart', 'myEnd', 'mzStart', 'mzEnd'],
  },
  quadStresses: { stress: ['sigmaXx', 'sigmaYy', 'tauXy', 'vonMises'], moment: ['mx', 'my', 'mxy'], shear: ['qx', 'qy'] },
  quadNodalStresses: { stress: ['sigmaXx', 'sigmaYy', 'tauXy', 'vonMises'], moment: ['mx', 'my', 'mxy'] },
};

const FAMILY_OF = new Map(
  Object.entries(UNIT_FAMILIES).flatMap(([collection, families]) => Object.entries(families)
    .flatMap(([family, fields]) => fields.map((f) => [`${collection}.${f}`, family] as const))),
);

/** The vector instance a quantity is a component of (`base.reactions[n3].<force>`), or null. */
export function familyOf(path: string): string | null {
  const m = /^(.*?)([A-Za-z0-9]+)(\[[^\]]*\])\.([A-Za-z0-9]+)$/.exec(path);
  const family = m && FAMILY_OF.get(`${m[2]}.${m[4]}`);
  return m && family ? `${m[1]}${m[2]}${m[3]}.<${family}>` : null;
}

export interface Diff {
  changed: Array<{ path: string; before: unknown; after: unknown }>;
  removed: string[];
  added: string[];
  differs: boolean;
}

/** `compareValues`, with a change dropped when it is round-off of its vector's size. */
export function compareLegacy(reference: Values, current: Values): Diff {
  const diff = compareValues(reference, current) as Diff;
  const peak = new Map<string, number>();
  for (const m of [reference, current]) {
    for (const [path, v] of Object.entries(m)) {
      const f = typeof v === 'number' && familyOf(path);
      if (f && !((peak.get(f) ?? -1) >= Math.abs(v as number))) peak.set(f, Math.abs(v as number));
    }
  }
  const changed = diff.changed.filter(({ path, before, after }) => {
    const f = familyOf(path);
    if (!f || typeof before !== 'number' || typeof after !== 'number') return true;
    return Math.abs(before - after) > RTOL * Math.max(Math.abs(before), Math.abs(after)) + VECTOR_ATOL * (peak.get(f) ?? 0);
  });
  return { ...diff, changed, differs: changed.length > 0 || diff.removed.length > 0 || diff.added.length > 0 };
}
