import type { Tensor3 } from './space';
import { PRESETS } from './space';

export const UNITS = ['MPa', 'kPa', 'kN/cm²', 'kgf/cm²'] as const;
export type Unit = typeof UNITS[number];
const UNIT_CODES: Record<Unit, string> = { MPa: 'mpa', kPa: 'kpa', 'kN/cm²': 'kncm2', 'kgf/cm²': 'kgfcm2' };

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

export function encode2D(s: Mohr2DState): URLSearchParams {
  const p = new URLSearchParams({ sx: num(s.sx), sy: num(s.sy), txy: num(s.txy), th: num(s.theta), u: UNIT_CODES[s.unit] });
  if (s.tauDown) p.set('tdown', '1');
  return p;
}

export function decode2D(params: URLSearchParams): Mohr2DState {
  return {
    sx: read(params, 'sx', DEFAULT_2D.sx),
    sy: read(params, 'sy', DEFAULT_2D.sy),
    txy: read(params, 'txy', DEFAULT_2D.txy),
    theta: read(params, 'th', DEFAULT_2D.theta, -180, 180),
    unit: readUnit(params),
    tauDown: params.get('tdown') === '1',
  };
}

const ORDER = ['xx', 'yy', 'zz', 'xy', 'yz', 'xz'] as const;

export function encode3D(s: Mohr3DState): URLSearchParams {
  return new URLSearchParams({ s: ORDER.map((k) => num(s.s[k])).join(','), phi: num(s.phi), th: num(s.theta), u: UNIT_CODES[s.unit] });
}

export function decode3D(params: URLSearchParams): Mohr3DState {
  const parts = (params.get('s') ?? '').split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  const valid = parts.length === 6 && parts.every((v) => Number.isFinite(v) && Math.abs(v) <= LIMIT);
  const s = valid ? (Object.fromEntries(ORDER.map((k, i) => [k, parts[i]])) as unknown as Tensor3) : { ...DEFAULT_3D.s };
  return {
    s,
    phi: read(params, 'phi', DEFAULT_3D.phi, -180, 180),
    theta: read(params, 'th', DEFAULT_3D.theta, 0, 180),
    unit: readUnit(params),
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

export const APP_LINK_KEYS = ['mohr', 'sx', 'sy', 'txy', 'th', 'u', 'tdown', 's', 'phi'] as const;

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
