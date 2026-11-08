/** Canonical wire quantities. Brands disappear at runtime and JSON stays numeric. */
import { fromDisplay, toDisplay, type UnitSystem } from '../utils/units';
import type { SolverAxialDistributedLoad, SolverDistributedLoad, SolverLoad, SolverNodalLoad, SolverNode, SolverPointLoadOnElement, SolverSupport, SolverThermalLoad } from './types';
import type { SolverDistributedLoad3D, SolverElement3D, SolverLoad3D, SolverNodalLoad3D, SolverNode3D, SolverPointLoad3D, SolverSupport3D, SolverThermalLoad3D } from './types-3d';

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
export type Bimoment = Quantity<'kN·m²'>;
export type Ratio = Quantity<'ratio'>;
export type LineLoad = Quantity<'kN/m load'>;
export type AreaLoad = Quantity<'kN/m² load'>;
export type TemperatureDifference = Quantity<'Δ°C'>;
export type ThermalExpansion = Quantity<'1/°C'>;
export type TranslationalStiffness = Quantity<'kN/m spring'>;
export type RotationalStiffness = Quantity<'kN·m/rad'>;
export type Angle = Quantity<'rad'>;
export type AngleDeg = Quantity<'°'>;

// Explicit admission of existing canonical model values, only at the legacy DTO boundary.
export const mpa = (value: number): ModulusMPa => value as ModulusMPa;
export const areaM2 = (value: number): Area => value as Area;
export const inertiaM4 = (value: number): SecondMoment => value as SecondMoment;
export const warpingM6 = (value: number): WarpingConstant => value as WarpingConstant;
export const lengthM = (value: number): Length => value as Length;
export const forceKn = (value: number): Force => value as Force;
export const momentKnM = (value: number): Moment => value as Moment;
export const bimomentKnM2 = (value: number): Bimoment => value as Bimoment;
export const ratio = (value: number): Ratio => value as Ratio;
export const lineLoadKnM = (value: number): LineLoad => value as LineLoad;
export const areaLoadKnM2 = (value: number): AreaLoad => value as AreaLoad;
export const temperatureDeltaC = (value: number): TemperatureDifference => value as TemperatureDifference;
export const expansionPerC = (value: number): ThermalExpansion => value as ThermalExpansion;
export const springKnM = (value: number): TranslationalStiffness => value as TranslationalStiffness;
export const springKnMRad = (value: number): RotationalStiffness => value as RotationalStiffness;
export const angleRad = (value: number): Angle => value as Angle;
export const angleDeg = (value: number): AngleDeg => value as AngleDeg;
export const modulusInternal = (value: ModulusMPa): Modulus => (value * 1000) as Modulus;

interface DisplayQuantities {
  stress: ModulusMPa;
  sectionArea: Area;
  sectionInertia: SecondMoment;
  distributedLoad: LineLoad;
  areaLoad: AreaLoad;
  temperatureDelta: TemperatureDifference;
  springK: TranslationalStiffness;
  springKr: RotationalStiffness;
  displacement: Length;
  rotation: Angle;
}
const DISPLAY_QUANTITIES = {
  stress: true, sectionArea: true, sectionInertia: true, distributedLoad: true, areaLoad: true,
  temperatureDelta: true, springK: true, springKr: true, displacement: true, rotation: true,
} satisfies Record<keyof DisplayQuantities, true>;
export const isTypedDisplayQuantity = (quantity: string): quantity is keyof DisplayQuantities => Object.hasOwn(DISPLAY_QUANTITIES, quantity);
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

export interface NodeWire { id: number; x: Length; z: Length }
export interface Node3DWire { id: number; x: Length; y: Length; z: Length }
export interface NodalLoadWire { nodeId: number; fx: Force; fz: Force; my: Moment }
export interface PointLoadWire { elementId: number; a: Length; p: Force; px?: Force; my?: Moment }
export interface NodalLoad3DWire { nodeId: number; fx: Force; fy: Force; fz: Force; mx: Moment; my: Moment; mz: Moment; bw?: Bimoment }
export interface PointLoad3DWire { elementId: number; a: Length; py: Force; pz: Force }
export interface DistributedLoadWire { elementId: number; qI: LineLoad; qJ: LineLoad; a?: Length; b?: Length }
export interface ThermalLoadWire { elementId: number; dtUniform: TemperatureDifference; dtGradient: TemperatureDifference; alpha?: ThermalExpansion; depth?: Length }
export interface DistributedLoad3DWire {
  qXI?: LineLoad; qXJ?: LineLoad; elementId: number; qYI: LineLoad; qYJ: LineLoad; qZI: LineLoad; qZJ: LineLoad; a?: Length; b?: Length;
}
export interface ThermalLoad3DWire {
  elementId: number; dtUniform: TemperatureDifference; dtGradientY: TemperatureDifference; dtGradientZ: TemperatureDifference;
  alpha?: ThermalExpansion; depthY?: Length; depthZ?: Length;
}
export interface PlateThermalLoadWire { elementId: number; dtUniform: TemperatureDifference; dtGradient: TemperatureDifference; alpha?: ThermalExpansion }
export interface SupportWire {
  kx?: TranslationalStiffness; ky?: TranslationalStiffness; kz?: RotationalStiffness; dx?: Length; dz?: Length; dry?: Angle; angle?: Angle;
}
export interface Support3DWire {
  kx?: TranslationalStiffness; ky?: TranslationalStiffness; kz?: TranslationalStiffness;
  krx?: RotationalStiffness; kry?: RotationalStiffness; krz?: RotationalStiffness;
  dx?: Length; dy?: Length; dz?: Length; drx?: Angle; dry?: Angle; drz?: Angle;
}
export interface Element3DWire { rollAngle?: AngleDeg }
type Branded<T, W> = Omit<T, keyof W> & W;
export type LoadWire =
  | { type: 'nodal'; data: Branded<SolverNodalLoad, NodalLoadWire> }
  | { type: 'pointOnElement'; data: Branded<SolverPointLoadOnElement, PointLoadWire> }
  | { type: 'distributed'; data: Branded<SolverDistributedLoad, DistributedLoadWire> }
  | { type: 'thermal'; data: Branded<SolverThermalLoad, ThermalLoadWire> }
  | { type: 'axialDistributed'; data: Branded<SolverAxialDistributedLoad, DistributedLoadWire> };
export type Load3DWire =
  | { type: 'nodal'; data: Branded<SolverNodalLoad3D, NodalLoad3DWire> }
  | { type: 'pointOnElement'; data: Branded<SolverPointLoad3D, PointLoad3DWire> }
  | { type: 'distributed'; data: Branded<SolverDistributedLoad3D, DistributedLoad3DWire> }
  | { type: 'thermal'; data: Branded<SolverThermalLoad3D, ThermalLoad3DWire> };

const unbranded = (load: never): never => load;

/** These adapters keep the key order and presence of their input, so the wire JSON is byte-identical. */
export function nodeToWire(n: SolverNode): Branded<SolverNode, NodeWire> {
  return { ...n, ...present(n, 'x', n.x, lengthM), ...present(n, 'z', n.z, lengthM) } as Branded<SolverNode, NodeWire>;
}
export function node3DToWire(n: SolverNode3D): Branded<SolverNode3D, Node3DWire> {
  return { ...n, ...present(n, 'x', n.x, lengthM), ...present(n, 'y', n.y, lengthM), ...present(n, 'z', n.z, lengthM) } as Branded<SolverNode3D, Node3DWire>;
}
export function loadToWire(load: SolverLoad): LoadWire {
  switch (load.type) {
    case 'nodal': {
      const d = load.data;
      return { ...load, data: { ...d, ...present(d, 'fx', d.fx, forceKn), ...present(d, 'fz', d.fz, forceKn), ...present(d, 'my', d.my, momentKnM) } as Branded<SolverNodalLoad, NodalLoadWire> };
    }
    case 'pointOnElement': {
      const d = load.data;
      return { ...load, data: { ...d, ...present(d, 'a', d.a, lengthM), ...present(d, 'p', d.p, forceKn), ...present(d, 'px', d.px, forceKn), ...present(d, 'my', d.my, momentKnM) } as Branded<SolverPointLoadOnElement, PointLoadWire> };
    }
    case 'distributed':
      return { ...load, data: distributedToWire(load.data) };
    case 'axialDistributed':
      return { ...load, data: distributedToWire(load.data) };
    case 'thermal': {
      const d = load.data;
      return {
        ...load,
        data: {
          ...d, ...present(d, 'dtUniform', d.dtUniform, temperatureDeltaC), ...present(d, 'dtGradient', d.dtGradient, temperatureDeltaC),
          ...present(d, 'alpha', d.alpha, expansionPerC), ...present(d, 'depth', d.depth, lengthM),
        } as Branded<SolverThermalLoad, ThermalLoadWire>,
      };
    }
    default:
      return unbranded(load);
  }
}
function distributedToWire(d: SolverDistributedLoad | SolverAxialDistributedLoad): Branded<SolverDistributedLoad, DistributedLoadWire> {
  return {
    ...d, ...present(d, 'qI', d.qI, lineLoadKnM), ...present(d, 'qJ', d.qJ, lineLoadKnM), ...present(d, 'a', d.a, lengthM), ...present(d, 'b', d.b, lengthM),
  } as Branded<SolverDistributedLoad, DistributedLoadWire>;
}
export function load3DToWire(load: SolverLoad3D): Load3DWire {
  switch (load.type) {
    case 'nodal': {
      const d = load.data;
      return {
        ...load,
        data: {
          ...d, ...present(d, 'fx', d.fx, forceKn), ...present(d, 'fy', d.fy, forceKn), ...present(d, 'fz', d.fz, forceKn),
          ...present(d, 'mx', d.mx, momentKnM), ...present(d, 'my', d.my, momentKnM), ...present(d, 'mz', d.mz, momentKnM),
          ...present(d, 'bw', d.bw, bimomentKnM2),
        } as Branded<SolverNodalLoad3D, NodalLoad3DWire>,
      };
    }
    case 'pointOnElement': {
      const d = load.data;
      return { ...load, data: { ...d, ...present(d, 'a', d.a, lengthM), ...present(d, 'py', d.py, forceKn), ...present(d, 'pz', d.pz, forceKn) } as Branded<SolverPointLoad3D, PointLoad3DWire> };
    }
    case 'distributed': {
      const d = load.data;
      return {
        ...load,
        data: {
          ...d, ...present(d, 'qXI', d.qXI, lineLoadKnM), ...present(d, 'qXJ', d.qXJ, lineLoadKnM),
          ...present(d, 'qYI', d.qYI, lineLoadKnM), ...present(d, 'qYJ', d.qYJ, lineLoadKnM),
          ...present(d, 'qZI', d.qZI, lineLoadKnM), ...present(d, 'qZJ', d.qZJ, lineLoadKnM),
          ...present(d, 'a', d.a, lengthM), ...present(d, 'b', d.b, lengthM),
        } as Branded<SolverDistributedLoad3D, DistributedLoad3DWire>,
      };
    }
    case 'thermal': {
      const d = load.data;
      return {
        ...load,
        data: {
          ...d, ...present(d, 'dtUniform', d.dtUniform, temperatureDeltaC),
          ...present(d, 'dtGradientY', d.dtGradientY, temperatureDeltaC), ...present(d, 'dtGradientZ', d.dtGradientZ, temperatureDeltaC),
          ...present(d, 'alpha', d.alpha, expansionPerC), ...present(d, 'depthY', d.depthY, lengthM), ...present(d, 'depthZ', d.depthZ, lengthM),
        } as Branded<SolverThermalLoad3D, ThermalLoad3DWire>,
      };
    }
    default:
      return unbranded(load);
  }
}
type PlateThermalNumbers = { elementId: number; dtUniform: number; dtGradient: number; alpha?: number };
export function plateThermalToWire(d: PlateThermalNumbers): PlateThermalLoadWire {
  return {
    ...d, ...present(d, 'dtUniform', d.dtUniform, temperatureDeltaC), ...present(d, 'dtGradient', d.dtGradient, temperatureDeltaC),
    ...present(d, 'alpha', d.alpha, expansionPerC),
  } as PlateThermalLoadWire;
}
export function supportToWire(s: SolverSupport): Branded<SolverSupport, SupportWire> {
  return {
    ...s, ...present(s, 'kx', s.kx, springKnM), ...present(s, 'ky', s.ky, springKnM), ...present(s, 'kz', s.kz, springKnMRad),
    ...present(s, 'dx', s.dx, lengthM), ...present(s, 'dz', s.dz, lengthM), ...present(s, 'dry', s.dry, angleRad), ...present(s, 'angle', s.angle, angleRad),
  } as Branded<SolverSupport, SupportWire>;
}
export function support3DToWire(s: SolverSupport3D): Branded<SolverSupport3D, Support3DWire> {
  return {
    ...s, ...present(s, 'kx', s.kx, springKnM), ...present(s, 'ky', s.ky, springKnM), ...present(s, 'kz', s.kz, springKnM),
    ...present(s, 'krx', s.krx, springKnMRad), ...present(s, 'kry', s.kry, springKnMRad), ...present(s, 'krz', s.krz, springKnMRad),
    ...present(s, 'dx', s.dx, lengthM), ...present(s, 'dy', s.dy, lengthM), ...present(s, 'dz', s.dz, lengthM),
    ...present(s, 'drx', s.drx, angleRad), ...present(s, 'dry', s.dry, angleRad), ...present(s, 'drz', s.drz, angleRad),
  } as Branded<SolverSupport3D, Support3DWire>;
}
export function element3DToWire(e: SolverElement3D): Branded<SolverElement3D, Element3DWire> {
  return { ...e, ...present(e, 'rollAngle', e.rollAngle, angleDeg) } as Branded<SolverElement3D, Element3DWire>;
}
