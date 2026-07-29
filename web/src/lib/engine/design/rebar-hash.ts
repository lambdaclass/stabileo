/**
 * Stable canonical hash of a ProvidedReinforcement.
 *
 * Used as the memo-cache key for provided-rebar verification and as the identity a
 * design certificate is bound to: when the hash changes the certificate is void.
 *
 * Requirements it must satisfy (pinned by tests):
 *   - key-order invariant  (object literal order must not change the hash)
 *   - float-noise invariant (0.15 vs 0.1500000000000002 hash the same)
 *   - any real change to counts / diameters / spacing / continuity changes the hash
 *
 * Pure: no store access, no side effects.
 */

import type { ProvidedReinforcement } from '../../store/model.svelte';
import { canonicalJson, fnv1a } from './canonical-hash';

/**
 * Canonical JSON form — deterministic, key-sorted, float-quantised.
 *
 * The canonicalisation itself lives in `canonical-hash.ts`: PR18's floor families need the
 * same certificate-binding guarantee for footing geometry, ground profiles and physical bar
 * assemblies, and a second copy of this machinery is how two parts of one project come to
 * disagree about whether the same object changed. `'none'` for an absent reinforcement is
 * the one rebar-specific rule and stays here.
 */
export function canonicalRebarJson(reinf: ProvidedReinforcement | undefined): string {
  if (!reinf) return 'none';
  return canonicalJson(reinf);
}

/**
 * Stable hash of provided reinforcement. Includes the canonical length so two
 * different structures cannot collide on a short FNV digest alone.
 */
export function rebarHash(reinf: ProvidedReinforcement | undefined): string {
  const json = canonicalRebarJson(reinf);
  return `${fnv1a(json)}${json.length.toString(36)}`;
}
