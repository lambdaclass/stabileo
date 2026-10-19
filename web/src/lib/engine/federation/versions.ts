/**
 * Published versions of the project: what each one was, kept as a fingerprint (a hash of every
 * node, member, shell, section, material, support and load, by id) rather than a copy, so the
 * project stays light and any two versions, or a version and the model now, can be compared
 * entity by entity: added, modified, removed.
 */
import { fnv } from './linked';

export const FINGERPRINT_CLASSES = ['nodes', 'elements', 'quads', 'sections', 'materials', 'supports', 'loads'] as const;
export type FingerprintClass = (typeof FINGERPRINT_CLASSES)[number];
export type ModelFingerprint = Record<FingerprintClass, Record<string, string>>;

export interface PublishedVersion {
  number: number;
  /** ISO date and time it was published. */
  date: string;
  /** Who publishes it and why, as the person writes them. */
  author: string; note: string;
  fingerprint: ModelFingerprint;
  counts: Record<FingerprintClass, number>;
}

/** A stable text of a value: object keys sorted, numbers rounded to 1e-9. */
export function stable(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e9) / 1e9) : String(v);
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** The model's entities as hashes by id. Loads, which carry their own id inside, are keyed by it. */
export function fingerprintOf(m: {
  nodes: Map<number, unknown>; elements: Map<number, unknown>; quads: Map<number, unknown>; sections: Map<number, unknown>;
  materials: Map<number, unknown>; supports: Map<number, unknown>; loads: ReadonlyArray<{ type: string; data: { id: number } }>;
}): ModelFingerprint {
  const of = (map: Map<number, unknown>) => Object.fromEntries([...map].map(([id, v]) => [String(id), fnv(stable(v))]));
  return {
    nodes: of(m.nodes), elements: of(m.elements), quads: of(m.quads), sections: of(m.sections), materials: of(m.materials), supports: of(m.supports),
    loads: Object.fromEntries(m.loads.map((l) => [`${l.type}:${l.data.id}`, fnv(stable(l))])),
  };
}

export interface FingerprintDiff { added: string[]; modified: string[]; removed: string[] }

/** What changed from `a` to `b`, by class of entity. */
export function compareFingerprints(a: ModelFingerprint, b: ModelFingerprint): Record<FingerprintClass, FingerprintDiff> {
  const out = {} as Record<FingerprintClass, FingerprintDiff>;
  for (const c of FINGERPRINT_CLASSES) {
    const x = a[c] ?? {}, y = b[c] ?? {};
    out[c] = {
      added: Object.keys(y).filter((k) => !(k in x)),
      modified: Object.keys(y).filter((k) => k in x && x[k] !== y[k]),
      removed: Object.keys(x).filter((k) => !(k in y)),
    };
  }
  return out;
}

export const countsOf = (f: ModelFingerprint) => Object.fromEntries(FINGERPRINT_CLASSES.map((c) => [c, Object.keys(f[c] ?? {}).length])) as Record<FingerprintClass, number>;
