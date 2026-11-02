import type * as Engine from '../../lib/engine/wasm-solver';

export type EngineApi = typeof Engine;

export type Param = {
  key: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  options?: readonly string[];
};

export type Values = Record<string, number>;

export type Readout = {
  key: string;
  value: number;
  unit: string;
  reference?: { value: number; source: string };
};

export type Certificate =
  | { status: 'certified'; kind: string; bound: number | null; boundUnit: string }
  | { status: 'uncertified' | 'failed' | 'unavailable'; kind: string; reason: string };

export type View = {
  xy: number[];
  cells: number[];
  cellSize: 2 | 4;
  values: number[];
  perCell: boolean;
  range: { min: number; max: number };
  field: string;
  unit: string;
  geometryOnly: boolean;
  lineWidth?: number;
  bounds: [number, number, number, number];
};

export type Chart = { key: string; xUnit: string; yUnit: string; points: [number, number][]; marker?: number };

export type Outcome =
  | { status: 'ok'; readouts: Readout[]; certificate: Certificate; views: Record<string, View>; charts: Chart[]; notes: string[] }
  | { status: 'refused'; reason: string };

export type EditorModel = { mode: '2d'; model: import('../../lib/engine/types').SolverInput } | { mode: 'pro'; model: import('../../lib/engine/types-3d').SolverInput3D };

export type Example<M> = {
  id: string;
  params: readonly Param[];
  build: (values: Values) => M;
  analyses: (model: M, values: Values, engine: EngineApi) => Outcome;
  editor: (model: M, name: string) => EditorModel;
  benchmark: { path: string; title: string };
  dimension: '2d' | '3d';
};

export function defineExample<M>(example: Example<M>): Example<M> {
  return example;
}

export function defaults(params: readonly Param[]): Values {
  return Object.fromEntries(params.map(p => [p.key, p.value]));
}

export function clampValue(param: Param, raw: number): number {
  if (!Number.isFinite(raw)) return param.value;
  const stepped = param.min + Math.round((raw - param.min) / param.step) * param.step;
  return Number(Math.min(param.max, Math.max(param.min, stepped)).toPrecision(12));
}

export function readValues(params: readonly Param[], search: string): Values {
  const query = new URLSearchParams(search);
  return Object.fromEntries(params.map(p => {
    const raw = query.get(p.key);
    return [p.key, raw === null || raw.trim() === '' ? p.value : clampValue(p, Number(raw))];
  }));
}

export function writeValues(params: readonly Param[], values: Values): string {
  const query = new URLSearchParams();
  for (const p of params) if (values[p.key] !== p.value) query.set(p.key, String(values[p.key]));
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function linearCertificate(certificate: Engine.LinearCertificate, endToEnd: Engine.EndToEnd | undefined): Certificate {
  if (endToEnd && endToEnd.status === 'failed') return { status: 'failed', kind: 'linear', reason: endToEnd.reason };
  if (certificate.status === 'certified') return { status: 'certified', kind: 'linear', bound: certificate.relBound, boundUnit: 'relative' };
  return { status: 'uncertified', kind: 'linear', reason: certificate.reason };
}

export function peak(points: [number, number][]): [number, number] {
  return points.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a, [0, 0]);
}
