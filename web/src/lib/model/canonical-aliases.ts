import { shouldProjectModelToXZ, type CoordinateNode, type TypedSupportLike } from '../geometry/coordinate-system';
import { tp } from '../i18n';
import type { Release } from '../store/model.svelte';
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
  constructor(
    readonly family: 'member' | 'support' | 'load',
    readonly id: unknown,
    field: string,
    alias: string,
  ) {
    super(tp('file.modelAliasConflict', { field, alias, id: String(id ?? '?') }));
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
  return normalizeRecord(record, 'member', (copy, conflict) => {
    for (const [field, alias] of [['releaseI', 'hingeStart'], ['releaseJ', 'hingeEnd']]) {
      const release = { ...copy[field] as Fields | undefined };
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
    reconcile(copy, 'my', copy.mz, 'mz', conflict);
    delete copy.mz;
    if (copy.enteredZeroMoment === true) reconcile(copy, 'my', 0, 'enteredZeroMoment', conflict);
    delete copy.enteredZeroMoment;
    if (copy.my === null || (typeof copy.my === 'number' && !Number.isFinite(copy.my))) copy.my = 'NaN';
    if (type === 'nodal') {
      reconcile(copy, 'fz', copy.fy, 'fy', conflict);
      delete copy.fy;
      if (copy.my === undefined) copy.my = 0;
      if (copy.fz === undefined) copy.fz = 0;
    }
  }) };
}

export function canonicalizeModelAliases<T extends Input>(model: T, analysisMode = model.analysisMode): T {
  const plane = analysisMode === '2d' || shouldProjectModelToXZ({
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

export function hasConflictingModelAliases(model: Input, analysisMode?: string): boolean {
  try {
    canonicalizeModelAliases(model, analysisMode);
    return false;
  } catch (error) {
    if (error instanceof ModelAliasConflict) return true;
    throw error;
  }
}
