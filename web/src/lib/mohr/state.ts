import type { Tensor3 } from './space';
import { PRESETS } from './space';

export const UNITS = ['MPa', 'kPa', 'kN/cm²', 'kgf/cm²'] as const;
export type Unit = typeof UNITS[number];
const UNIT_CODES: Record<Unit, string> = { MPa: 'mpa', kPa: 'kpa', 'kN/cm²': 'kncm2', 'kgf/cm²': 'kgfcm2' };

/** How many of each unit make one MPa; 1 kgf = 9.80665 N exactly. */
export const PER_MPA: Record<Unit, number> = { MPa: 1, kPa: 1000, 'kN/cm²': 0.1, 'kgf/cm²': 100 / 9.80665 };
/** Decimals a stress is shown with in each unit, so a value reads to about the same precision whatever the unit. */
export const UNIT_DIGITS: Record<Unit, number> = { MPa: 2, kPa: 0, 'kN/cm²': 3, 'kgf/cm²': 1 };
/** A round increment of about 1 MPa, in each unit, for arrow keys, the wheel and dragging a field. */
export const UNIT_STEP: Record<Unit, number> = { MPa: 1, kPa: 1000, 'kN/cm²': 0.1, 'kgf/cm²': 10 };

export const toUnit = (mpa: number, unit: Unit) => mpa * PER_MPA[unit];
export const fromUnit = (value: number, unit: Unit) => value / PER_MPA[unit];
/** The factors from `unit` to every unit, for sizing that must not change when the unit does. */
export const unitScales = (unit: Unit) => UNITS.map((u) => PER_MPA[u] / PER_MPA[unit]);

/** Stresses are kept in MPa; `unit` only chooses how they are entered and shown. */
export interface Mohr2DState {
  sx: number;
  sy: number;
  txy: number;
  theta: number;
  unit: Unit;
  tauDown: boolean;
}

export interface Mohr3DState {
  s: Tensor3;
  phi: number;
  theta: number;
  unit: Unit;
}

export type MohrKind = 'plane' | 'space';

export const DEFAULT_2D: Mohr2DState = { sx: 80, sy: 20, txy: 30, theta: 0, unit: 'MPa', tauDown: false };
export const DEFAULT_3D: Mohr3DState = { s: { ...PRESETS.general }, phi: -20, theta: 70, unit: 'MPa' };

export const TOOL_PATH: Record<MohrKind, string> = { 'plane': '/tools/mohr-2d', 'space': '/tools/mohr-3d' };

const LIMIT = 1e9;
const num = (v: number) => String(Number(v.toPrecision(10)));

function read(params: URLSearchParams, key: string, fallback: number, min = -LIMIT, max = LIMIT): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function readUnit(params: URLSearchParams): Unit {
  const code = params.get('u');
  return UNITS.find((u) => UNIT_CODES[u] === code) ?? 'MPa';
}

export function wrapAngle(deg: number): number {
  const w = ((((deg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

const VERSION = '2';

/** Links written before `v=2` carry the stresses in the unit they name; from `v=2` on they are in MPa. */
function linkScale(params: URLSearchParams, unit: Unit): number {
  return params.get('v') === VERSION ? 1 : 1 / PER_MPA[unit];
}

export function encode2D(s: Mohr2DState): URLSearchParams {
  const p = new URLSearchParams({ sx: num(s.sx), sy: num(s.sy), txy: num(s.txy), th: num(s.theta), u: UNIT_CODES[s.unit], v: VERSION });
  if (s.tauDown) p.set('tdown', '1');
  return p;
}

export function decode2D(params: URLSearchParams): Mohr2DState {
  const unit = readUnit(params), k = linkScale(params, unit);
  const stress = (key: 'sx' | 'sy' | 'txy') => { const v = read(params, key, NaN); return Number.isFinite(v) ? v * k : DEFAULT_2D[key]; };
  return {
    sx: stress('sx'),
    sy: stress('sy'),
    txy: stress('txy'),
    theta: read(params, 'th', DEFAULT_2D.theta, -180, 180),
    unit,
    tauDown: params.get('tdown') === '1',
  };
}

const ORDER = ['xx', 'yy', 'zz', 'xy', 'yz', 'xz'] as const;

export function encode3D(s: Mohr3DState): URLSearchParams {
  return new URLSearchParams({ s: ORDER.map((k) => num(s.s[k])).join(','), phi: num(s.phi), th: num(s.theta), u: UNIT_CODES[s.unit], v: VERSION });
}

export function decode3D(params: URLSearchParams): Mohr3DState {
  const unit = readUnit(params), k = linkScale(params, unit);
  const parts = (params.get('s') ?? '').split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  const valid = parts.length === 6 && parts.every((v) => Number.isFinite(v) && Math.abs(v) <= LIMIT);
  const s = valid ? (Object.fromEntries(ORDER.map((key, i) => [key, parts[i] * k])) as unknown as Tensor3) : { ...DEFAULT_3D.s };
  return {
    s,
    phi: read(params, 'phi', DEFAULT_3D.phi, -180, 180),
    theta: read(params, 'th', DEFAULT_3D.theta, 0, 180),
    unit,
  };
}

export function encodeState(kind: MohrKind, state: Mohr2DState | Mohr3DState): URLSearchParams {
  return kind === 'plane' ? encode2D(state as Mohr2DState) : encode3D(state as Mohr3DState);
}

/** The application's deep link: `/app/basic?mohr=plane&sx=…`, read back by `readAppLink`. */
export function appHref(kind: MohrKind, state: Mohr2DState | Mohr3DState, e2e = false): string {
  const params = new URLSearchParams({ mohr: kind });
  for (const [k, v] of encodeState(kind, state)) params.set(k, v);
  if (e2e) params.set('e2e', '1');
  return `/app/basic?${params}`;
}

export const APP_LINK_KEYS = ['mohr', 'sx', 'sy', 'txy', 'th', 'u', 'v', 'tdown', 's', 'phi'] as const;

export function readAppLink(params: URLSearchParams): { kind: 'plane'; state: Mohr2DState } | { kind: 'space'; state: Mohr3DState } | null {
  const kind = params.get('mohr');
  if (kind === 'plane') return { kind, state: decode2D(params) };
  if (kind === 'space') return { kind, state: decode3D(params) };
  return null;
}

/** The plane state of a beam fibre as the 3D tensor it stands for: σx along the bar, σy = σz = 0. */
export function fibreTensor(sigma: number, tauXy: number, tauXz: number): Tensor3 {
  return { xx: sigma, yy: 0, zz: 0, xy: tauXy, xz: tauXz, yz: 0 };
}
