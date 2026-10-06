/**
 * Which fields of each load type are its magnitude: what scales when the load is scaled (a what-if
 * slider, the "scale loads" operation, a case duplicated with a factor). Positions, ids, frames and
 * cases are not among them.
 *
 * Every load type the model defines has an entry, and each entry names only fields that type has:
 * a load type added to `Load` without one here fails the typecheck, instead of keeping its value
 * whatever the factor says. Legacy aliases (`fy`, `mz` on a plane load) are listed too, so the
 * load scales whichever of the pair the solver reads.
 */
import type { Load } from '../../store/model.svelte';

export type MagnitudeFields = { [T in Load['type']]: ReadonlyArray<keyof Extract<Load, { type: T }>['data']> };

export const MAGNITUDE_FIELDS: MagnitudeFields = {
  nodal: ['fx', 'fz', 'my', 'fy', 'mz'],
  distributed: ['qI', 'qJ'],
  pointOnElement: ['p', 'px', 'my', 'mz'],
  thermal: ['dtUniform', 'dtGradient', 'dtGradientY', 'strain'],
  nodal3d: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'],
  distributed3d: ['qYI', 'qYJ', 'qZI', 'qZJ', 'qXI', 'qXJ'],
  pointOnElement3d: ['py', 'pz', 'px', 'mx', 'my', 'mz'],
  surface3d: ['q'],
  thermalQuad3d: ['dtUniform', 'dtGradient'],
  prestress3d: ['force'],
  displacement3d: ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'],
};

/** A copy of a load with its magnitude times `k`; a field it does not state stays unstated. */
export function scaledLoad<L extends Load>(l: L, k: number): L {
  const data = { ...l.data } as Record<string, unknown>;
  for (const f of MAGNITUDE_FIELDS[l.type] as readonly string[]) {
    const v = data[f];
    if (typeof v === 'number') data[f] = v * k;
  }
  return { ...l, data } as L;
}
