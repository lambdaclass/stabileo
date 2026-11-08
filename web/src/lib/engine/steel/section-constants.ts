/**
 * J, Cw, Zx, Zy, F.2's c and a channel's Sy for the CIRSOC 301 checker, computed by the engine
 * (`cirsoc301_inputs` op `sectionConstants`). J and Z come from the section's geometry when the
 * section engine resolves it, unrotated, because the check runs in the member's own axes.
 */
import type { Section } from '../../store/model.svelte';
import { plasticModulus, plasticModulusWeak } from '../plastic-moments';
import { solverProperties } from '../../section/state';
import { cirsoc301InputsRequest } from './cirsoc301-inputs';

type Sec = Partial<Section> & { shape?: string };

export interface SteelSectionConstants {
  J: number;
  jBasis: 'declared' | 'geometry' | 'thinWalled' | 'none';
  Cw?: number;
  Zx?: number;
  Zy?: number;
  /** F.2's c: 1 for a doubly-symmetric I, (h₀/2)·√(I_weak/Cw) for a channel. */
  c?: number;
  /** Weak-axis elastic modulus to the flange tip; for a channel the centroid is near the web. */
  Sy?: number;
}

/**
 * Kept per section description. The plastic moduli mesh the section in the engine, some 60 ms a
 * profile, and the optimiser asks for the same few hundred profiles on every run; the answer
 * depends only on the fields in the key. A result computed without the engine is not kept, so
 * the first call after it starts gets the geometry's values.
 */
const CACHE_LIMIT = 512;
const cache = new Map<string, SteelSectionConstants>();
const keyOf = (s: Sec) => JSON.stringify([
  s.name, s.shape, s.a, s.b, s.h, s.tw, s.tf, s.t, s.j, s.iy, s.iz, s.rotation,
  s.polygon, s.holes, s.drawn, s.composition, s.canonical?.kind === 'geometry-backed' ? s.canonical.digest : null,
]);

export function steelSectionConstants(sec: Sec): SteelSectionConstants {
  const key = keyOf(sec);
  const hit = cache.get(key);
  if (hit) return { ...hit };
  const { value, engine } = computeConstants(sec);
  if (engine) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return { ...value };
}

function computeConstants(sec: Sec): { value: SteelSectionConstants; engine: boolean } {
  let geometryJ: number | null = null;
  try { geometryJ = solverProperties(sec as Section).j; } catch { geometryJ = null; }
  let engine = true;
  let zx: { zp: number; source: string } | undefined, zy: { zp: number; source: string } | undefined;
  try {
    const flat = { ...sec, rotation: 0 } as Section;
    zx = plasticModulus(flat);
    zy = plasticModulusWeak(flat);
  } catch {
    engine = false;
  }
  const value = cirsoc301InputsRequest<SteelSectionConstants>('sectionConstants', 'the CIRSOC 301 section constants J, Cw, c and Sy', {
    shape: sec.shape, b: sec.b, h: sec.h, tw: sec.tw, tf: sec.tf, iz: sec.iz, j: sec.j,
    ...(geometryJ !== null ? { geometryJ } : {}),
    ...(zx?.source === 'geometry' ? { geometryZx: zx.zp } : {}),
    ...(zy?.source === 'geometry' ? { geometryZy: zy.zp } : {}),
  });
  return { value, engine };
}
