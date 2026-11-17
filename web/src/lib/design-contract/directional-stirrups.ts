import type { StirrupDef, ProvidedReinforcement } from './reinforcement';

export type ShearDirection = 'primary' | 'secondary';
const legBrand: unique symbol = Symbol('directional stirrup legs');
export type DirectionalLegs<D extends ShearDirection> = Readonly<{ direction: D; count: number; [legBrand]: true }>;

export function stirrupLegs<D extends ShearDirection>(cage: Pick<StirrupDef, 'legs' | 'secondaryLegs'>, direction: D): DirectionalLegs<D> {
  const count = direction === 'primary' ? cage.legs : cage.secondaryLegs ?? 2;
  if (!Number.isInteger(count) || count < 2) throw new Error(`Invalid ${direction} stirrup leg count`);
  return Object.freeze({ direction, count, [legBrand]: true as const });
}

export function shearProvision<D extends ShearDirection>(direction: D, legs: DirectionalLegs<NoInfer<D>>, legArea: number, spacing: number): number {
  if (legs.direction !== direction) throw new Error('Stirrup direction mismatch');
  if (!(spacing > 0) || !Number.isFinite(spacing)) throw new Error('Invalid stirrup spacing');
  return legs.count * legArea / spacing;
}

export function migrateDirectionalStirrups(provided: ProvidedReinforcement | undefined): ProvidedReinforcement | undefined {
  if (!provided) return provided;
  const migrate = (s: StirrupDef | undefined) => s ? { ...s, secondaryLegs: s.secondaryLegs ?? 2 } : undefined;
  return { ...provided,
    ...(provided.stirrups ? { stirrups: migrate(provided.stirrups) } : {}),
    ...(provided.regions ? { regions: { ...provided.regions,
      ...(provided.regions.stirrupsSupport ? { stirrupsSupport: migrate(provided.regions.stirrupsSupport) } : {}),
      ...(provided.regions.stirrupsStart ? { stirrupsStart: migrate(provided.regions.stirrupsStart) } : {}),
      ...(provided.regions.stirrupsEnd ? { stirrupsEnd: migrate(provided.regions.stirrupsEnd) } : {}),
      ...(provided.regions.stirrupsSpan ? { stirrupsSpan: migrate(provided.regions.stirrupsSpan) } : {}),
    } } : {}),
  };
}

export function patchSupportEnds(
  regions: NonNullable<ProvidedReinforcement['regions']>, patch: Partial<StirrupDef>, resolved?: StirrupDef,
): void {
  const applied: Partial<StirrupDef> = {};
  for (const key of Object.keys(patch) as Array<keyof StirrupDef>) {
    const value = patch[key];
    if (value !== undefined) applied[key] = resolved?.[key] ?? value;
  }
  for (const key of ['stirrupsStart', 'stirrupsEnd'] as const) {
    const cage = regions[key];
    if (cage) regions[key] = { ...cage, ...applied };
  }
}

export function beamSeatingStirrupDiameter(rebar: ProvidedReinforcement | undefined, nominalDiameter: number): number {
  const regions = rebar?.regions;
  const maxDiameter = Math.max(
    rebar?.stirrups?.diameter ?? 0, regions?.stirrupsSupport?.diameter ?? 0, regions?.stirrupsSpan?.diameter ?? 0,
    regions?.stirrupsStart?.diameter ?? 0, regions?.stirrupsEnd?.diameter ?? 0,
  );
  return maxDiameter > 0 ? maxDiameter : nominalDiameter;
}
