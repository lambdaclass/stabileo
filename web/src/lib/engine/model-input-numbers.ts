import { tp } from '../i18n';
import type { Load, Material, Support } from '../store/model.svelte';
import type { ModelData } from './solver-service';

type NumberKeys<T> = { [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never }[keyof T] & string;
type Fields<T> = {
  required: readonly NumberKeys<T>[];
  optional: readonly NumberKeys<T>[];
};

const loadFields: { [K in Load['type']]: Fields<Extract<Load, { type: K }>['data']> } = {
  nodal: { required: ['nodeId', 'fx'], optional: ['fz', 'fy'] },
  distributed: { required: ['elementId', 'qI', 'qJ'], optional: ['a', 'b', 'angle'] },
  pointOnElement: { required: ['elementId', 'a', 'p'], optional: ['px', 'angle'] },
  thermal: { required: ['elementId', 'dtUniform', 'dtGradient'], optional: ['dtGradientY', 'strain'] },
  nodal3d: { required: ['nodeId', 'fx', 'fy', 'fz', 'mx', 'my', 'mz'], optional: ['fromDef', 'carrier'] },
  distributed3d: { required: ['elementId', 'qYI', 'qYJ', 'qZI', 'qZJ'], optional: ['qXI', 'qXJ', 'a', 'b', 'fromDef'] },
  pointOnElement3d: { required: ['elementId', 'a', 'py', 'pz'], optional: ['px', 'mx', 'my', 'mz'] },
  surface3d: { required: ['quadId', 'q'], optional: ['fromDef'] },
  thermalQuad3d: { required: ['quadId', 'dtUniform', 'dtGradient'], optional: [] },
  prestress3d: { required: ['elementId', 'force', 'eI', 'eM', 'eJ'], optional: [] },
  displacement3d: { required: ['nodeId'], optional: ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] },
};

const supportFields: Fields<Support> = {
  required: ['id', 'nodeId'],
  optional: ['kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'dx', 'dy', 'dz', 'drx', 'dry', 'drz', 'angle', 'normalX', 'normalY', 'normalZ', 'dofLocalElementId'],
};

const materialFields: Fields<Material> = {
  required: ['id', 'e', 'nu', 'rho'],
  optional: ['alpha', 'fy', 'fu', 'fc'],
};

export class InvalidModelNumber extends Error {
  constructor(path: string, value: unknown) {
    super(tp('svc.engine.nonFiniteNumber', { path, value: String(value) }));
  }
}

export function isFiniteInputNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberAt(path: string, value: unknown): void {
  if (!isFiniteInputNumber(value)) throw new InvalidModelNumber(path, value);
}

function recordNumbers(
  path: string, data: object, { required, optional }: { required: readonly string[]; optional: readonly string[] },
): void {
  const record = data as Record<string, unknown>;
  for (const field of required) numberAt(`${path}.${field}`, record[field]);
  for (const field of optional) {
    if (record[field] !== undefined) numberAt(`${path}.${field}`, record[field]);
  }
}

function arrayOf<T>(path: string, value: readonly T[], check: (path: string, value: T) => void, size?: number): void {
  if (!Array.isArray(value) || (size !== undefined && value.length !== size)) throw new InvalidModelNumber(path, value);
  for (let i = 0; i < value.length; i++) check(`${path}[${i}]`, value[i]!);
}

const vector = (path: string, value: readonly number[]) => arrayOf(path, value, numberAt, 3);
const polygon = (path: string, value: readonly (readonly number[])[]) => arrayOf(path, value, vector);

export function requireLoadNumbers(loads: readonly Load[]): void {
  for (const [i, load] of loads.entries()) {
    const path = `loads[${i}].data`;
    const { data } = load;
    recordNumbers(path, data, loadFields[load.type]);
    recordNumbers(path, data, { required: [], optional: ['id', 'caseId'] });
    if (load.type === 'nodal') numberAt(`${path}.fz/fy`, load.data.fz ?? load.data.fy);
    if (load.type === 'surface3d') {
      const { dir, qNodes, vary, region } = load.data;
      if (dir !== undefined) vector(`${path}.dir`, dir);
      if (qNodes !== undefined) arrayOf(`${path}.qNodes`, qNodes, numberAt);
      if (vary !== undefined) {
        if (!vary) throw new InvalidModelNumber(`${path}.vary`, vary);
        recordNumbers(`${path}.vary`, vary, { required: ['c1', 'q1', 'c2', 'q2'], optional: [] });
        vector(`${path}.vary.dir`, vary.dir);
      }
      if (region !== undefined) {
        if (!region) throw new InvalidModelNumber(`${path}.region`, region);
        vector(`${path}.region.normal`, region.normal);
        polygon(`${path}.region.points`, region.points);
        if (region.holes !== undefined) arrayOf(`${path}.region.holes`, region.holes, polygon);
      }
    }
  }
}

export function requireModelNumbers(model: ModelData): void {
  requireLoadNumbers(model.loads);
  for (const [id, support] of model.supports) {
    const path = `supports.${id}`;
    recordNumbers(path, support, supportFields);
    if (support.curves === undefined) continue;
    if (!support.curves) throw new InvalidModelNumber(`${path}.curves`, support.curves);
    for (const axis of ['x', 'y', 'z'] as const) {
      const curve = support.curves[axis];
      if (curve !== undefined) arrayOf(`${path}.curves.${axis}`, curve, (at, pair) => arrayOf(at, pair, numberAt, 2));
    }
  }
  for (const [id, material] of model.materials) recordNumbers(`materials.${id}`, material, materialFields);
  for (const [i, weight] of (model.analysis?.selfWeight ?? []).entries()) {
    const path = `analysis.selfWeight[${i}]`;
    recordNumbers(path, weight, { required: ['caseId', 'factor'], optional: ['groupId'] });
    if (weight.elements !== undefined) arrayOf(`${path}.elements`, weight.elements, numberAt);
  }
}

export function modelNumberRefusal(model: ModelData): string | null {
  try {
    requireModelNumbers(model);
    return null;
  } catch (error) {
    if (error instanceof InvalidModelNumber) return error.message;
    throw error;
  }
}
