/**
 * The ONE canonical-hash implementation.
 *
 * ── Why this was extracted ─────────────────────────────────────────
 *
 * `rebar-hash.ts` grew this machinery for a single purpose: bind a design certificate to
 * the reinforcement it was issued against, so that moving the steel voids the certificate.
 * PR18's floor families need exactly the same guarantee for footing geometry, ground
 * profiles, demand inputs and physical bar assemblies — and a SECOND hash implementation is
 * how two parts of one project come to disagree about whether the same object changed.
 *
 * So the canonicalisation, the quantisation and the digest live here, once.
 * `rebarHash` is now a thin specialisation of it and its hashes are unchanged, which is
 * pinned by its own existing tests rather than asserted here.
 *
 * ── The three properties that matter ───────────────────────────────
 *
 *   key-order invariant   an object literal written in a different order hashes the same
 *   float-noise invariant 0.15 and 0.1500000000000002 hash the same
 *   change-detecting      any real change to a value changes the hash
 *
 * The first two are what stop a certificate being voided by a re-serialisation that
 * changed nothing; the third is the whole point.
 *
 * Pure: no store, no runes, no clock.
 */

/**
 * Quantisation: 4 decimals is finer than any physically meaningful value in this project
 * (a length in m to 0,1 mm) while absorbing IEEE-754 accumulation noise.
 */
function q(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '_';
  // Normalise -0 to 0 and strip trailing zeros for a compact stable form.
  const v = Math.round(n * 1e4) / 1e4;
  return (v === 0 ? 0 : v).toString();
}

export function canonicalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return q(value);
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      const v = src[k];
      if (v === undefined) continue; // absent and explicit-undefined must hash alike
      out[k] = canonicalise(v);
    }
    return out;
  }
  return String(value);
}

/** Canonical JSON form — deterministic, key-sorted, float-quantised. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

/** FNV-1a 32-bit, rendered base36. Fast, allocation-free, no crypto dependency. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Stable hash of any canonicalisable value.
 *
 * The canonical LENGTH is appended so that two different structures cannot collide on a
 * short FNV digest alone — a 32-bit digest over a design space this large would otherwise
 * make a false "unchanged" verdict a realistic possibility, and a false unchanged is the
 * one answer a certificate must never give.
 */
export function stableHash(value: unknown): string {
  const json = canonicalJson(value);
  return `${fnv1a(json)}${json.length.toString(36)}`;
}
