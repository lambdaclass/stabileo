/**
 * A fingerprint of what a design and its detailing were made from.
 *
 * The detailing used to learn that it was out of date only when the member demands were
 * recomputed: a section changed, the solve was cleared, and the bars, the sheets and the IFC
 * went on describing the old structure with nothing saying so. The fingerprint is stored with
 * the detailing when it is generated and compared with the model's current one, so any output
 * built from it can say "out of date" — after a reload too, because both halves persist.
 *
 * What it covers is what the analysis or the design reads: geometry, sections, materials,
 * supports, loads, cases, combinations, shells, constraints, self-weight and the physical
 * elements (their members and their kind). What it leaves out on purpose:
 *  - reinforcement, names and views: an edit to the bars has its own path (`applyEdit`), and a
 *    name or a camera changes nothing that was computed;
 *  - the project design data: it mixes design inputs with sheet and budget settings, and a
 *    sheet format must not make the bars out of date. Its design inputs reach the verification
 *    through their own invalidation.
 */
import { modelStore } from './model.svelte';
import { PHYSICAL_GROUP_KIND } from '../model/physical';

/** Two 32-bit string hashes side by side: cheap, and a collision of both is not a practical concern. */
export function hashString(s: string): string {
  let a = 0x811c9dc5, b = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a ^= c; a = Math.imul(a, 0x01000193);
    b = (Math.imul(b, 33) ^ c) | 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** The design inputs of a model, as plain data in a stable order. */
export function designInputs(m: typeof modelStore.model): unknown {
  const sorted = <T>(map: Map<number, T>, f: (v: T) => unknown) =>
    [...map.entries()].sort((x, y) => x[0] - y[0]).map(([id, v]) => [id, f(v)]);
  const a = m as unknown as Record<string, unknown>;
  return {
    nodes: sorted(m.nodes, (n) => [n.x, n.y, n.z ?? 0]),
    elements: sorted(m.elements, (e) => {
      const { reinforcement: _r, name: _n, ...rest } = e as typeof e & { reinforcement?: unknown; name?: string };
      return rest;
    }),
    sections: sorted(m.sections, (s) => {
      const { canonical: _c, ...rest } = s as typeof s & { canonical?: unknown };
      return rest;
    }),
    materials: sorted(m.materials, (x) => x),
    supports: sorted(m.supports, (x) => x),
    plates: sorted(m.plates, (x) => x),
    quads: sorted(m.quads, (x) => x),
    loads: m.loads,
    loadCases: a.loadCases,
    combinations: a.combinations,
    constraints: m.constraints,
    selfWeight: (a.analysis as { selfWeight?: unknown } | undefined)?.selfWeight ?? null,
    physical: [...m.groups.values()]
      .filter((g) => g.kind === PHYSICAL_GROUP_KIND)
      .sort((x, y) => x.id - y.id)
      .map((g) => [g.id, g.members, (g.data as { kind?: string; typology?: string } | undefined)?.kind ?? null,
        (g.data as { typology?: string } | undefined)?.typology ?? null]),
  };
}

/**
 * JSON with every object's keys in order. A model that went through a save and an open holds the
 * same values with its keys in another order (a load case written `{ type, id }` comes back
 * `{ id, type }`), and that must not read as a change.
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export function fingerprintOf(m: typeof modelStore.model): string {
  return hashString(canonicalJson(designInputs(m)));
}

let memo: { keys: unknown[]; value: string } | null = null;

/**
 * The current model's design fingerprint.
 *
 * Every collection is replaced (never mutated) on a change, so the identities of the collections
 * say whether anything changed; the hash is recomputed only then. Reading them here also makes a
 * caller inside a `$derived` follow the model.
 */
export function designFingerprint(): string {
  const m = modelStore.model;
  const a = m as unknown as Record<string, unknown>;
  const keys = [m.nodes, m.elements, m.sections, m.materials, m.supports, m.plates, m.quads, m.loads,
    a.loadCases, a.combinations, m.constraints, a.analysis, m.groups];
  if (memo && memo.keys.length === keys.length && memo.keys.every((k, i) => k === keys[i])) return memo.value;
  memo = { keys, value: fingerprintOf(m) };
  return memo.value;
}
