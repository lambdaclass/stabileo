import { invalidPlanarNodalMomentField, ModelInputError, requireAuthoredMemberKeys, requireLoadCollection } from '../engine/model-input-numbers';
import { shouldProjectModelToXZ, type CoordinateNode, type TypedSupportLike } from '../geometry/coordinate-system';
import { t, tp } from '../i18n';
import type { Release } from '../store/model.svelte';
import { isAnalysisMode, is3DWorkspace } from '../utils/workspace';
import { isPlaneSupportType } from './support-types';

type Fields = Record<string, unknown>;
type LoadRecord = { type: string; data?: object };
type Collection<T> = ReadonlyArray<T | readonly [number, T]>;
type Input = {
  analysisMode?: string;
  nodes?: Collection<CoordinateNode>;
  elements?: Collection<object>;
  supports?: Collection<object>;
  loads?: readonly LoadRecord[];
  plates?: readonly unknown[];
  quads?: readonly unknown[];
};

export class ModelAliasConflict extends Error {
  readonly feature: 'conflictingModelAliases' | 'outOfPlaneNodalComponents';

  constructor(
    readonly family: 'member' | 'support' | 'load',
    readonly id: unknown,
    field: string,
    alias?: string,
  ) {
    const recordId = String(id ?? '?');
    super(alias === undefined
      ? `${t('xls.err.nodalOutOfPlane')} (#${recordId}, ${field})`
      : tp('file.modelAliasConflict', { field, alias, id: recordId }));
    this.feature = alias === undefined ? 'outOfPlaneNodalComponents' : 'conflictingModelAliases';
  }
}

function reconcile(
  record: Fields, field: string, other: unknown, alias: string,
  conflict: (field: string, alias: string) => never,
): void {
  if (other === undefined) return;
  if (record[field] === undefined) record[field] = other;
  else if (record[field] !== other) conflict(field, alias);
}

function normalizeRecord(
  record: object, family: ModelAliasConflict['family'],
  normalize: (copy: Fields, conflict: (field: string, alias: string) => never) => void,
): Fields {
  const copy = { ...record } as Fields;
  normalize(copy, (field, alias) => { throw new ModelAliasConflict(family, copy.id, field, alias); });
  return copy;
}

function values<T>(items: Collection<T> = []): T[] {
  return items.map(item => Array.isArray(item) ? item[1] as T : item as T);
}

function mapRecords<T>(
  items: Collection<T> | undefined, normalize: (item: T) => object,
): Collection<object> | undefined {
  return items?.map(item => Array.isArray(item) ? [item[0], normalize(item[1])] : normalize(item as T));
}

export const NO_RELEASE: Readonly<Release> = Object.freeze({ my: false, mz: false, t: false });

function member(record: object): Fields {
  const id = (record as Fields | null)?.id;
  requireAuthoredMemberKeys(`elements.${String(id ?? '?')}`, record);
  return normalizeRecord(record, 'member', (copy, conflict) => {
    for (const [field, alias] of [['releaseI', 'hingeStart'], ['releaseJ', 'hingeEnd']]) {
      const value = copy[field];
      if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) continue;
      const release = { ...value as Fields | undefined };
      reconcile(release, 'mz', copy[alias], alias, () => conflict(field + '.mz', alias));
      copy[field] = { ...NO_RELEASE, ...release };
      delete copy[alias];
    }
  });
}

function support(record: object, plane: boolean): object {
  const raw = record as Fields;
  if (!plane || raw.dofRestraints || !isPlaneSupportType(raw.type)) return record;
  return normalizeRecord(record, 'support', (copy, conflict) => {
    for (const [field, alias] of [['dz', 'dy'], ['dry', 'drz']]) {
      reconcile(copy, field, copy[alias], alias, conflict);
      delete copy[alias];
    }
  });
}

function removePlanarNodalPadding(copy: Fields): void {
  const complete = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'].every(field => copy[field] !== undefined);
  for (const field of complete ? ['fy', 'mx', 'mz'] : ['mx']) {
    if (copy[field] === undefined) continue;
    if (copy[field] !== 0) throw new ModelAliasConflict('load', copy.id, field);
    delete copy[field];
  }
}

export function canonicalizeLoadAliases<T extends LoadRecord>(record: T): T {
  const { type, data } = record;
  if (type !== 'nodal' && type !== 'pointOnElement' && type !== 'distributed') return record;
  return { ...record, data: normalizeRecord(data ?? {}, 'load', (copy, conflict) => {
    if (type === 'distributed') {
      reconcile(copy, 'qI', copy.q, 'q', conflict);
      reconcile(copy, 'qJ', copy.q, 'q', conflict);
      delete copy.q;
      return;
    }
    if (type === 'nodal') removePlanarNodalPadding(copy);
    const invalidMoment = type === 'nodal' && invalidPlanarNodalMomentField(copy);
    if (invalidMoment) {
      if (copy.my !== undefined && copy.mz !== undefined && copy.my !== copy.mz) conflict('my', 'mz');
      if (copy.enteredZeroMoment === true) conflict('my', 'enteredZeroMoment');
    } else {
      reconcile(copy, 'my', copy.mz, 'mz', conflict);
      delete copy.mz;
      if (copy.enteredZeroMoment === true) reconcile(copy, 'my', 0, 'enteredZeroMoment', conflict);
      if (copy.my === null || (typeof copy.my === 'number' && !Number.isFinite(copy.my))) copy.my = 'NaN';
    }
    delete copy.enteredZeroMoment;
    if (type === 'nodal') {
      reconcile(copy, 'fz', copy.fy, 'fy', conflict);
      delete copy.fy;
      if (!invalidMoment && copy.my === undefined) copy.my = 0;
      if (copy.fz === undefined) copy.fz = 0;
    }
  }) };
}

export function canonicalizeModelAliases<T extends Input>(model: T, analysisMode = model.analysisMode): T {
  if (model.loads !== undefined) requireLoadCollection(model.loads);
  const explicitlyPlanar = isAnalysisMode(analysisMode) && analysisMode !== 'edu' && !is3DWorkspace(analysisMode);
  const plane = explicitlyPlanar || shouldProjectModelToXZ({
    nodes: values(model.nodes),
    supports: values(model.supports) as TypedSupportLike[],
    loads: model.loads,
    plateCount: model.plates?.length,
    quadCount: model.quads?.length,
  });
  return {
    ...model,
    ...(model.elements && { elements: mapRecords(model.elements, member) }),
    ...(model.supports && { supports: mapRecords(model.supports, record => support(record, plane)) }),
    ...(model.loads && { loads: model.loads.map(canonicalizeLoadAliases) }),
  };
}

export function modelAliasRefusalFeature(
  model: Input, analysisMode?: string,
): ModelAliasConflict['feature'] | undefined {
  try {
    canonicalizeModelAliases(model, analysisMode);
    return undefined;
  } catch (error) {
    if (error instanceof ModelAliasConflict) return error.feature;
    if (error instanceof ModelInputError) return undefined;
    throw error;
  }
}
