/** Canonical wire quantities. Brands disappear at runtime and JSON stays numeric. */
import { fromDisplay, toDisplay, type UnitSystem } from '../utils/units';

declare const unit: unique symbol;
export type Quantity<U extends string> = number & { readonly [unit]: U };
export type ModulusMPa = Quantity<'MPa'>;
export type Modulus = Quantity<'kN/m²'>;
export type Area = Quantity<'m²'>;
export type SecondMoment = Quantity<'m⁴'>;
export type WarpingConstant = Quantity<'m⁶'>;
export type Length = Quantity<'m'>;
export type Force = Quantity<'kN'>;
export type Moment = Quantity<'kN·m'>;
export type Ratio = Quantity<'ratio'>;

// Explicit admission of existing canonical model values, only at the legacy DTO boundary.
export const mpa = (value: number): ModulusMPa => value as ModulusMPa;
export const areaM2 = (value: number): Area => value as Area;
export const inertiaM4 = (value: number): SecondMoment => value as SecondMoment;
export const warpingM6 = (value: number): WarpingConstant => value as WarpingConstant;
export const lengthM = (value: number): Length => value as Length;
export const ratio = (value: number): Ratio => value as Ratio;
export const modulusInternal = (value: ModulusMPa): Modulus => (value * 1000) as Modulus;

interface DisplayQuantities {
  stress: ModulusMPa;
  sectionArea: Area;
  sectionInertia: SecondMoment;
}
/** Enter a display number once; the return value carries the canonical wire unit. */
export function elasticFromDisplay<Q extends keyof DisplayQuantities>(value: number, quantity: Q, system: UnitSystem): DisplayQuantities[Q] {
  return fromDisplay(value, quantity, system) as DisplayQuantities[Q];
}
/** NoInfer prevents widening Q to admit a value in a different dimension. */
export function elasticToDisplay<Q extends keyof DisplayQuantities>(value: DisplayQuantities[NoInfer<Q>], quantity: Q, system: UnitSystem): number {
  return toDisplay(value, quantity, system);
}

export interface ElasticMaterialWire { id: number; e: ModulusMPa; nu: Ratio }
export interface ElasticSectionWire { id: number; name?: string; a: Area; iz: SecondMoment; asY?: Area }

/** Compatibility adapters for the stored numeric model; no conversion or rounding. */
export function materialToWire(m: { id: number; e: number; nu: number }): ElasticMaterialWire {
  return { ...m, e: mpa(m.e), nu: ratio(m.nu) };
}
export function sectionToWire(s: { id: number; name?: string; a: number; iz: number; asY?: number }): ElasticSectionWire {
  const result: ElasticSectionWire = { ...s, a: areaM2(s.a), iz: inertiaM4(s.iz), asY: s.asY === undefined ? undefined : areaM2(s.asY) };
  // Keep absent asY absent, including for the non-JSON JsValue route.
  if (!Object.hasOwn(s, 'asY')) delete result.asY;
  return result;
}

export interface ElasticSection3DWire {
  id: number; name?: string; a: Area; iy: SecondMoment; iz: SecondMoment; j: SecondMoment;
  cw?: WarpingConstant; asY?: Area; asZ?: Area; shearCenterY?: Length; shearCenterZ?: Length;
}
type OptionalSection3DKey = 'cw' | 'asY' | 'asZ' | 'shearCenterY' | 'shearCenterZ';
type Section3DNumbers = { id: number; name?: string; a: number; iy: number; iz: number; j: number; cw?: number; asY?: number; asZ?: number; shearCenterY?: number; shearCenterZ?: number };
const present = <K extends string, B>(s: object, key: K, value: number | undefined, brand: (v: number) => B): { [P in K]?: B } =>
  (Object.hasOwn(s, key) ? { [key]: value === undefined ? undefined : brand(value) } : {}) as { [P in K]?: B };
/** Keeps the key order and presence of `s`, so the wire JSON is byte-identical. */
export function section3DToWire(s: Section3DNumbers): ElasticSection3DWire {
  return {
    ...(s as Omit<Section3DNumbers, OptionalSection3DKey>), a: areaM2(s.a), iy: inertiaM4(s.iy), iz: inertiaM4(s.iz), j: inertiaM4(s.j),
    ...present(s, 'cw', s.cw, warpingM6),
    ...present(s, 'asY', s.asY, areaM2),
    ...present(s, 'asZ', s.asZ, areaM2),
    ...present(s, 'shearCenterY', s.shearCenterY, lengthM),
    ...present(s, 'shearCenterZ', s.shearCenterZ, lengthM),
  };
}
