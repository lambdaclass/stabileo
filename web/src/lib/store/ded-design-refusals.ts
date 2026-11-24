import type { DesignRefusals } from '../engine/detailing/assembly';

export const MAX_EXPANDED_REFUSAL_CHARS = 64 * 1024 * 1024;

type RefusalRecord = Record<string, unknown> & {
  outcome: 'SEARCH_EXHAUSTED' | 'SECTION_INADEQUATE' | 'UNSUPPORTED';
};

interface CompactRefusals {
  fingerprint: string;
  records: RefusalRecord[];
  members: Array<[elementId: number, record: number]>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRefusal(value: unknown): value is RefusalRecord {
  return isObject(value) && (
    value.outcome === 'SEARCH_EXHAUSTED' ||
    value.outcome === 'SECTION_INADEQUATE' ||
    value.outcome === 'UNSUPPORTED'
  );
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function hasCompactRefusals(value: unknown): boolean {
  return isObject(value) && ('records' in value || 'members' in value);
}

export function compactDesignRefusals(source: DesignRefusals): CompactRefusals | null {
  if (source.outcomes.length > MAX_EXPANDED_REFUSAL_CHARS) return null;
  let outcomes: unknown;
  try {
    outcomes = JSON.parse(source.outcomes);
  } catch {
    return null;
  }
  if (!Array.isArray(outcomes)) return null;

  const compact: CompactRefusals = { fingerprint: source.fingerprint, records: [], members: [] };
  const indices = new Map<string, number>();
  const seen = new Set<number>();
  let expandedChars = 1;
  for (const outcome of outcomes as unknown[]) {
    if (!isRefusal(outcome)) return null;
    const { elementId, ...record } = outcome;
    if (!isId(elementId) || seen.has(elementId)) return null;
    seen.add(elementId);
    const key = JSON.stringify(record);
    expandedChars += memberPrefix(elementId).length + key.length;
    let index = indices.get(key);
    if (index === undefined) {
      index = compact.records.length;
      indices.set(key, index);
      compact.records.push(record);
    }
    compact.members.push([elementId, index]);
  }
  if (expandedChars > MAX_EXPANDED_REFUSAL_CHARS || compact.records.length === compact.members.length) return null;
  return JSON.stringify(compact).length < source.outcomes.length ? compact : null;
}

function memberPrefix(id: number): string {
  return `{"elementId":${id},`;
}

export function expandDesignRefusals(source: unknown): DesignRefusals | null {
  if (!isObject(source) || typeof source.fingerprint !== 'string' || 'outcomes' in source) return null;
  const { fingerprint, records, members } = source;
  if (!Array.isArray(records) || !records.length || !Array.isArray(members) || members.length < records.length) return null;

  const bodies: string[] = [];
  for (const record of records as unknown[]) {
    if (!isRefusal(record) || 'elementId' in record) return null;
    bodies.push(JSON.stringify(record).slice(1));
  }

  const ids = new Set<number>();
  const used = new Set<number>();
  const outcomes: string[] = [];
  let expandedChars = 1;
  for (const member of members as unknown[]) {
    if (!Array.isArray(member) || member.length !== 2) return null;
    const [id, index] = member as unknown[];
    if (!isId(id) || ids.has(id) || typeof index !== 'number' || !Number.isSafeInteger(index)) return null;
    const body = bodies[index];
    if (body === undefined) return null;
    const prefix = memberPrefix(id);
    expandedChars += prefix.length + body.length + 1;
    if (expandedChars > MAX_EXPANDED_REFUSAL_CHARS) return null;
    ids.add(id);
    used.add(index);
    outcomes.push(prefix + body);
  }
  if (used.size !== bodies.length) return null;
  return { fingerprint, outcomes: `[${outcomes.join(',')}]` };
}
