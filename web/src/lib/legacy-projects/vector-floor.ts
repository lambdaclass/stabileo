/**
 * The comparison of an old project file's results (#718): the snapshot gate's rule
 * (`compare.mjs`), except for a reaction force component that statics makes zero: when both values are within
 * VECTOR_ATOL (1e-12, a few thousand ε) of the vector it belongs to, they are the same zero.
 * v0.2.0's truss and Warren truss reactions need it (rx 5.7e-14 → 7.1e-14 and −9.2e-14 → −4.3e-14
 * kN beside 35 kN), which against their own peak read as 25 % and 54 % changes. Never used by the
 * snapshot gate, whose builds are bit-for-bit reproducible. Only reaction forces, the one quantity
 * the releases need it for; never another node's reaction.
 */
import { compareValues } from '../../../scripts/results-snapshot/compare.mjs';
import type { Values } from './capture-results';

export const VECTOR_ATOL = 1e-12;

export const UNIT_FAMILIES: Record<string, Record<string, string[]>> = {
  reactions: { force: ['rx', 'ry', 'rz', 'fx', 'fy', 'fz'] },
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

/** `compareValues`, with a change dropped when both values are round-off zeros of their vector. */
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
    const zero = VECTOR_ATOL * (peak.get(f) ?? 0);
    return !(Math.abs(before) <= zero && Math.abs(after) <= zero);
  });
  return { ...diff, changed, differs: changed.length > 0 || diff.removed.length > 0 || diff.added.length > 0 };
}
