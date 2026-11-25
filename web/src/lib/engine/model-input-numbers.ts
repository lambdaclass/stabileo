import { t, tp } from '../i18n';
import type { Load, Material, Support } from '../store/model.svelte';
import type { ModelData } from './solver-service';

type NumberKeys<T> = { [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never }[keyof T] & string;
type Fields<T> = {
  required: readonly NumberKeys<T>[];
  optional: readonly NumberKeys<T>[];
};

type LoadFields<T> = Fields<T> & { basicProjection?: Fields<T> };

const loadFields: { [K in Load['type']]: LoadFields<Extract<Load, { type: K }>['data']> } = {
  nodal: {
    required: ['nodeId'], optional: [],
    basicProjection: { required: ['fx'], optional: ['fz', 'fy'] },
  },
  distributed: { required: ['elementId', 'qI', 'qJ'], optional: ['a', 'b', 'angle'] },
  pointOnElement: { required: ['elementId', 'a', 'p'], optional: ['px', 'angle'] },
  thermal: { required: ['elementId', 'dtUniform', 'dtGradient'], optional: ['dtGradientY', 'strain'] },
  nodal3d: {
    required: ['nodeId'], optional: [],
    basicProjection: { required: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'], optional: ['fromDef', 'carrier'] },
  },
  distributed3d: {
    required: ['elementId'], optional: [],
    basicProjection: { required: ['qYI', 'qYJ', 'qZI', 'qZJ'], optional: ['qXI', 'qXJ', 'a', 'b', 'fromDef'] },
  },
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
  required: ['id', 'e', 'nu'],
  optional: ['rho', 'alpha', 'fy', 'fu', 'fc'],
};

export class ModelInputError extends Error {}

export class InvalidModelNumber extends ModelInputError {
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

export function invalidPlanarPointTorsion(mx: unknown): boolean {
  return mx !== undefined && mx !== 0;
}

function requireInputField(path: string, valid: boolean): asserts valid {
  if (!valid) throw new ModelInputError(tp('svc.engine.invalidInputField', { path }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoadType(type: unknown): type is Load['type'] {
  return typeof type === 'string' && Object.hasOwn(loadFields, type);
}

function requireLoadSelectors(path: string, type: Load['type'], data: Record<string, unknown>): void {
  if (type === 'distributed' || type === 'pointOnElement') {
    const { isGlobal } = data;
    requireInputField(`${path}.isGlobal`, isGlobal === undefined || typeof isGlobal === 'boolean');
  }
  if (type === 'distributed3d' || type === 'pointOnElement3d' || type === 'surface3d') {
    const { frame } = data;
    requireInputField(`${path}.frame`, frame === undefined || frame === 'local' || frame === 'global'
      || (frame === 'projected' && type !== 'pointOnElement3d'));
  }
  if (type === 'surface3d' || type === 'thermalQuad3d') {
    requireInputField(`${path}.on`, data.on === undefined || data.on === 'plate');
  }
}

function requireLoadRecord(load: unknown, i: number) {
  const row = `loads[${i}]`;
  requireInputField(`${row}.type`, isRecord(load) && isLoadType(load.type));
  const path = `${row}.data`;
  const { type, data } = load;
  requireInputField(path, isRecord(data));
  requireLoadSelectors(path, type, data);
  return { path, type, data };
}

export function requireLoadInput(loads: readonly unknown[]): void {
  for (const [i, load] of loads.entries()) {
    const { path, type, data } = requireLoadRecord(load, i);
    const fields = loadFields[type];
    recordNumbers(path, data, fields);
    if (fields.basicProjection) recordNumbers(path, data, fields.basicProjection);
    recordNumbers(path, data, { required: [], optional: ['id', 'caseId'] });
    if (type === 'pointOnElement') {
      const { mx } = data;
      if (invalidPlanarPointTorsion(mx)) {
        const field = `${path}.mx`;
        numberAt(field, mx);
        throw new ModelInputError(`${t('svc.engine.unsupportedPointLoadMoment')} ${field}: ${t('svc.engine.applyPointLoadMomentAtNode')}`);
      }
    }
    if (type === 'nodal') numberAt(`${path}.fz/fy`, data.fz ?? data.fy);
    if (type === 'surface3d') {
      const { dir, qNodes, vary, region } = data as Partial<Extract<Load, { type: 'surface3d' }>['data']>;
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

function modelInputError(check: () => void): ModelInputError | null {
  try {
    check();
    return null;
  } catch (error) {
    if (error instanceof ModelInputError) return error;
    throw error;
  }
}

export function loadInputRefusal(loads: readonly unknown[]): string | null {
  return modelInputError(() => requireLoadInput(loads))?.message ?? null;
}

export function hasMalformedAuthoredLoad(loads: readonly unknown[], basicProjection: boolean): boolean {
  for (const [i, load] of loads.entries()) {
    const error = modelInputError(() => {
      const { path, type, data } = requireLoadRecord(load, i);
      const projected = loadFields[type].basicProjection;
      if (basicProjection && projected) recordNumbers(path, data, projected);
    });
    if (error) return true;
  }
  return false;
}

export function requireModelNumbers(model: ModelData): void {
  requireLoadInput(model.loads);
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
  return modelInputError(() => requireModelNumbers(model))?.message ?? null;
}
