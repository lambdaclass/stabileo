export const TR_WIND = 'ts498-1997-wind';
export const TR_SNOW = 'ts498-1997-snow';
export const TR_SEISMIC = 'tbdy2018';

export interface Axes { x: boolean; y: boolean }
export interface Ts498WindInput {
  shape?: 'general' | 'tower';
  exposedSlope?: boolean;
  directions?: Axes;
}

export type SnowZone = 'I' | 'II' | 'III' | 'IV';
export interface Ts498SnowInput {
  zone?: SnowZone;
  altitudeM?: number;
  noSnow?: boolean;
  roofSlopeDeg?: number;
  slidingPrevented?: boolean;
}

export type SoilClass = 'ZA' | 'ZB' | 'ZC' | 'ZD' | 'ZE' | 'ZF';
export type MassUse = 'storage' | 'assembly' | 'residential';
export interface TbdyInput {
  ss?: number;
  s1?: number;
  soil?: SoilClass;
  bks?: 1 | 2 | 3;
  system?: string;
  systemY?: string;
  regular?: boolean;
  etaBi?: number;
  tp?: number;
  ct?: number;
  massUse?: MassUse;
  eccentricity?: boolean;
  orthogonal?: boolean;
  directions?: Axes;
}

export const DEFAULT_TBDY: Required<Pick<TbdyInput, 'soil' | 'bks' | 'system' | 'regular' | 'eccentricity' | 'orthogonal'>> = {
  soil: 'ZC', bks: 3, system: 'A11', regular: true, eccentricity: true, orthogonal: true,
};

export function windInputOf(ci: Readonly<Record<string, unknown>> | undefined): Ts498WindInput {
  return (ci?.[TR_WIND] as Ts498WindInput | undefined) ?? {};
}
export function snowInputOf(ci: Readonly<Record<string, unknown>> | undefined): Ts498SnowInput {
  return (ci?.[TR_SNOW] as Ts498SnowInput | undefined) ?? {};
}
export function seismicInputOf(ci: Readonly<Record<string, unknown>> | undefined): TbdyInput & typeof DEFAULT_TBDY {
  const given = (ci?.[TR_SEISMIC] as TbdyInput | undefined) ?? {};
  const set = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) as TbdyInput;
  return { ...DEFAULT_TBDY, ...set };
}
