import type * as Engine from '../../lib/engine/wasm-solver';
import { refusedWithCode } from '../../lib/engine/containment-error';

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
  | { status: 'certified'; kind: 'linear' | 'timeHistory'; bound: number | null; measure: 'errorBound' | 'residual' }
  | { status: 'uncertified' | 'failed' | 'unavailable'; kind: 'linear' | 'timeHistory'; code: 'engine' | 'noExport' | 'notStable' | 'noResidual'; reason?: string };

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
  | { status: 'refused'; code: 'engine' | 'noLoad' | 'nonFinite'; reason?: string };

export function refusedOutcome(error: unknown): Extract<Outcome, { status: 'refused' }> {
  const text = error instanceof Error ? error.message : String(error);
  return { status: 'refused', code: refusedWithCode(error, 'non_finite_result') ? 'nonFinite' : 'engine', reason: engineMessage(text) };
}

function engineMessage(text: string): string {
  try {
    const message = JSON.parse(text.slice(Math.max(0, text.indexOf('{')))).message;
    return typeof message === 'string' ? message : text;
  } catch {
    return text;
  }
}

export type EditorModel = { app: 'basic'; model: import('../../lib/engine/types').SolverInput } | { app: 'pro'; model: import('../../lib/engine/types-3d').SolverInput3D };

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

export function mergeQuery(params: readonly Param[], values: Values, search: string): string {
  const query = new URLSearchParams(search);
  for (const p of params) query.delete(p.key);
  for (const [key, value] of new URLSearchParams(writeValues(params, values))) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : '';
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
  if (endToEnd && endToEnd.status === 'failed') return { status: 'failed', kind: 'linear', code: 'engine', reason: endToEnd.reason };
  if (certificate.status === 'certified') return { status: 'certified', kind: 'linear', bound: certificate.relBound, measure: 'errorBound' };
  return { status: 'uncertified', kind: 'linear', code: 'engine', reason: certificate.reason };
}

export function peak(points: [number, number][]): [number, number] {
  return points.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a, [0, 0]);
}

export function referenceGap(value: number, reference: number): { value: number; relative: boolean } {
  if (reference === 0) return { value: Math.abs(value), relative: false };
  return { value: Math.abs(value / reference - 1) * 100, relative: true };
}
