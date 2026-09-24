import type { ModelSnapshot } from '../store/history.svelte';
import { migrateFootings } from '../model/footing';
import { migrateGeotechnical } from '../model/geotechnical';
import { DEFAULT_COVER } from '../engine/design/member-context';

type RecordValue = Record<string, unknown>;
type Entry = [number, RecordValue];

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function records(value: unknown): value is RecordValue[] {
  return Array.isArray(value) && value.every(record);
}

function entries(value: unknown): value is Entry[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<number>();
  return value.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || !id(entry[0]) || !record(entry[1])) return false;
    if (seen.has(entry[0])) return false;
    seen.add(entry[0]);
    return entry[1].id === undefined || entry[1].id === entry[0];
  });
}

/**
 * Check the containers and entries that restore() reads before it mutates any
 * store. This is a wire-shape check, not structural engineering validation.
 * Both legacy and compact links use it after decoding. Optional collections
 * may be absent, but must have the right shape when supplied.
 */
export function prepareSharedSnapshot(value: unknown): ModelSnapshot | null {
  if (!record(value) || !record(value.nextId)) return null;
  const tupleFamilies = ['nodes', 'materials', 'sections', 'elements', 'supports'] as const;
  for (const key of tupleFamilies) {
    if (!entries(value[key])) return null;
  }
  for (const key of ['plates', 'quads', 'connectors'] as const) {
    if (value[key] !== undefined && !entries(value[key])) return null;
  }
  if (!records(value.loads) || !value.loads.every(load => typeof load.type === 'string' && record(load.data))) return null;
  if (value.loadCases !== undefined && (!records(value.loadCases)
    || !value.loadCases.every(c => id(c.id) && typeof c.name === 'string'))) return null;
  if (value.combinations !== undefined && (!records(value.combinations)
    || !value.combinations.every(c => id(c.id) && records(c.factors)))) return null;
  if (value.constraints !== undefined) {
    if (!records(value.constraints)) return null;
    for (const constraint of value.constraints) {
      if ((constraint.type === 'linearMPC' || constraint.type === 'linearMpc')
        && constraint.terms !== undefined && !records(constraint.terms)) return null;
    }
  }
  if (value.provenance !== undefined) {
    if (!record(value.provenance)) return null;
    const { assumptions, layerMappings } = value.provenance;
    if (assumptions !== undefined && (!Array.isArray(assumptions)
      || !assumptions.every(a => typeof a === 'string'))) return null;
    if (layerMappings !== undefined && !records(layerMappings)) return null;
  }

  // Counters are bookkeeping, not model properties. Recover missing, malformed
  // or stale counters without changing any existing entity's ID. Keep larger
  // valid counters so deleted IDs are not reused. Never trust a JSON number to
  // be a safe integer, or a counter to be ahead of the entities it allocates.
  const nextId = { ...value.nextId };
  const ensureCounter = (key: string, used: unknown[]): boolean => {
    let max = 0;
    for (const usedId of used) {
      if (!id(usedId)) return false;
      max = Math.max(max, usedId);
    }
    if (max >= Number.MAX_SAFE_INTEGER - 1) return false;
    const current = nextId[key];
    nextId[key] = id(current) && current > max && current < Number.MAX_SAFE_INTEGER
      ? current : max + 1;
    return true;
  };
  for (const [key, family] of [
    ['node', 'nodes'], ['material', 'materials'], ['section', 'sections'],
    ['element', 'elements'], ['support', 'supports'], ['plate', 'plates'],
    ['quad', 'quads'], ['connector', 'connectors'],
  ]) {
    if (!ensureCounter(key, ((value[family] ?? []) as Entry[]).map(([key]) => key))) return null;
  }
  const loadIds = value.loads.map(load => (load.data as RecordValue).id).filter(v => v !== undefined);
  if (!ensureCounter('load', loadIds)) return null;
  // restore() supplies three default load cases when the field is absent.
  if (!ensureCounter('loadCase', value.loadCases === undefined
    ? [1, 2, 3] : (value.loadCases as RecordValue[]).map(c => c.id))) return null;
  if (!ensureCounter('combination', ((value.combinations ?? []) as RecordValue[]).map(c => c.id))) return null;

  // These families have tolerant migrations; count the IDs restore() will use.
  const footings = migrateFootings(value.footings, { cover: DEFAULT_COVER }).footings;
  const ground = migrateGeotechnical(value.geotechnical).geotechnical;
  if (!ensureCounter('footing', [...footings.keys()])) return null;
  if (!ensureCounter('soilProfile', ground.profiles.map(profile => profile.id))) return null;
  return { ...value, nextId } as unknown as ModelSnapshot;
}
