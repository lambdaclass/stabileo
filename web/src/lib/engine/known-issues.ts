import { knownIssueMessage } from './known-issue-message';
import { diagnosticKeys, mapKeys, opaqueKeys, recordKeys } from './generated/result-sites';
import { tsDiagnosticKeys, tsMapKeys, tsRecordKeys } from './generated/result-sites-ts';

export { knownIssueMessage };

export function knownIssueDisposition(diagnostics: ReadonlyArray<{ code: string; severity: string; phase?: string; value?: number; message: string }> = []) {
  const issues = diagnostics.filter(d => d.code === 'known_issue');
  return {
    refused: issues.some(d => d.severity === 'error'),
    messages: [...new Set(issues.map(knownIssueMessage))],
  };
}

export function knownIssueRefusal(error: unknown): string | null {
  if (error instanceof Error) error = error.message;
  if (typeof error !== 'string') return null;
  try {
    const data = JSON.parse(error.slice(error.indexOf('{')));
    if (!Array.isArray(data?.structuredDiagnostics)) return null;
    const errors = data.structuredDiagnostics.filter((d: { severity?: string }) => d.severity === 'error');
    const disposition = knownIssueDisposition(errors);
    if (disposition.refused) return disposition.messages.join('\n');
    const refusals = errors.filter((d: { code?: string }) => d.code === 'plastic_capacity_missing' || d.code === 'cable_analysis_required' || d.code === 'contact_state_invalid' || d.code === 'contact_tolerance_invalid');
    return refusals.length > 0 ? [...new Set(refusals.map(knownIssueMessage))].join('\n') : null;
  } catch { return null; }
}

export function refusedKnownIssues(error: unknown): Array<{ phase: string; value?: number }> {
  if (error instanceof Error) error = error.message;
  if (typeof error !== 'string') return [];
  try {
    const data = JSON.parse(error.slice(error.indexOf('{')));
    if (!Array.isArray(data?.structuredDiagnostics)) return [];
    return data.structuredDiagnostics.filter((d: { code?: string; severity?: string; phase?: unknown } | null) =>
      d?.code === 'known_issue' && d.severity === 'error' && typeof d.phase === 'string');
  } catch { return []; }
}

type Diagnostic = { code: string; severity: string; phase?: string; value?: number; message: string };

const DIAGNOSTIC_KEYS = [...new Set<string>([...diagnosticKeys, ...tsDiagnosticKeys])];
const RECORD_KEYS = [...new Set<string>([...recordKeys, ...tsRecordKeys])];
const MAP_KEYS = [...new Set<string>([...mapKeys, ...tsMapKeys])];
const OPAQUE_KEYS: readonly string[] = opaqueKeys;

const isKnownIssue = (d: unknown): d is Diagnostic =>
  !!d && typeof d === 'object' && (d as Diagnostic).code === 'known_issue' && typeof (d as Diagnostic).message === 'string';

const frozenResults = new WeakSet<object>();
type Absent = Array<[object, string]>;
const frozenDiagnostics = new WeakMap<object, { diagnostics: Diagnostic[]; absent: Absent }>();

function refuseEdit(): never {
  throw new TypeError('A published result cannot be edited in place');
}

const locked = { value: refuseEdit, enumerable: false, writable: false, configurable: false };

function lockCollection(value: Map<unknown, unknown> | Set<unknown>): void {
  Object.defineProperties(value, value instanceof Map ? { set: locked, delete: locked, clear: locked } : { add: locked, delete: locked, clear: locked });
}

const PLAIN_PROTOTYPES = new Set<unknown>([Object.prototype, Array.prototype, null]);
const UNSOUND = Symbol('unsound');

/** Typed arrays inside stay writable. A result keeps its refusal verdict only if everything the scan reads is frozen plain data. */
export function freezeResult<T>(result: T): T {
  const walked = new Set<object>();
  function walk(value: unknown): void {
    if (!value || typeof value !== 'object' || walked.has(value) || frozenResults.has(value) || ArrayBuffer.isView(value)) return;
    walked.add(value);
    if (value instanceof Map || value instanceof Set) {
      value.forEach((v, k) => { walk(k); walk(v); });
      lockCollection(value);
    }
    if (Array.isArray(value)) for (let i = 0; i < value.length; i++) walk(value[i]);
    else for (const key in value) walk((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  walk(result);
  if (result && typeof result === 'object') frozenResults.add(result);
  return result;
}

const { isFrozen, getPrototypeOf, getOwnPropertyNames, getOwnPropertyDescriptor, keys: ownKeys } = Object;
const isArray = Array.isArray;
const isView = ArrayBuffer.isView;
const objectValues = Object.values;
const each = (list: readonly unknown[], f: (v: unknown) => void) => { for (let i = 0; i < list.length; i++) if (i in list) f(list[i]); };
const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty) as (o: object, k: PropertyKey) => boolean;

function assertSealed(value: object): void {
  if (!isFrozen(value) || isView(value) || value instanceof Map || value instanceof Set || !PLAIN_PROTOTYPES.has(getPrototypeOf(value))) throw UNSOUND;
  if (isArray(value)) for (let i = 0; i < value.length; i++) if (!hasOwn(value, i)) throw UNSOUND;
  const names = getOwnPropertyNames(value);
  for (let i = 0; i < names.length; i++) {
    const property = getOwnPropertyDescriptor(value, names[i]!)!;
    if (!('value' in property) || typeof property.value === 'function') throw UNSOUND;
  }
}

function ownReader(absent: Absent) {
  return (record: object, key: string): unknown => {
    const property = getOwnPropertyDescriptor(record, key);
    if (!property && key in record) throw UNSOUND;
    if ((record as Record<string, unknown>)[key] !== property?.value) throw UNSOUND;
    if (!property) absent.push([record, key]);
    return property?.value;
  };
}

function stillAbsent(absent: Absent): boolean {
  for (let i = 0; i < absent.length; i++) {
    const [record, key] = absent[i]!;
    if (key in record || (record as Record<string, unknown>)[key] !== undefined) return false;
  }
  return true;
}

function frozenDiagnosticsOf(result: object, absentOut: Absent | null): Diagnostic[] {
  const cached = frozenDiagnostics.get(result);
  if (cached && stillAbsent(cached.absent)) {
    absentOut?.push(...cached.absent);
    return cached.diagnostics;
  }
  try {
    if (cached) throw UNSOUND;
    const absent: Absent = [];
    const diagnostics = diagnosticsIn(result, result, absent);
    frozenDiagnostics.set(result, { diagnostics: Object.freeze(diagnostics) as Diagnostic[], absent });
    absentOut?.push(...absent);
    return diagnostics;
  } catch (error) {
    if (error !== UNSOUND) throw error;
    frozenResults.delete(result);
    frozenDiagnostics.delete(result);
    return diagnosticsIn(result, null, null);
  }
}

export function knownIssueDiagnosticsIn(result: unknown): Diagnostic[] {
  return diagnosticsIn(result, null, null);
}

function diagnosticsIn(result: unknown, root: object | null, absent: Absent | null): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<object>();
  const scanned = new Set<object>();
  const sealed = absent !== null;
  const check = sealed ? assertSealed : () => {};
  const read = sealed ? ownReader(absent) : (record: object, key: string) => (record as Record<string, unknown>)[key];
  const valuesOf = sealed
    ? (value: object) => { const keys = ownKeys(value), out: unknown[] = []; for (let i = 0; i < keys.length; i++) out.push(read(value, keys[i]!)); return out; }
    : (value: object) => (value instanceof Map ? [...value.values()] : objectValues(value));
  const knownIssue = sealed
    ? (d: unknown): d is Diagnostic => !!d && typeof d === 'object' && read(d, 'code') === 'known_issue' && typeof read(d, 'message') === 'string'
    : isKnownIssue;
  function collect(value: unknown): void {
    if (value && typeof value === 'object') check(value);
    if (Array.isArray(value)) each(value, collect);
    else if (knownIssue(value)) diagnostics.push(value);
  }
  function scan(value: unknown): void {
    if (!value || typeof value !== 'object' || scanned.has(value)) return;
    scanned.add(value);
    check(value);
    if (knownIssue(value)) diagnostics.push(value);
    each(valuesOf(value), scan);
  }
  function values(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    check(value);
    if (Array.isArray(value)) { each(value, values); return; }
    each(valuesOf(value), visit);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value !== root && frozenResults.has(value)) {
      const found = frozenDiagnosticsOf(value, absent);
      if (sealed && !frozenResults.has(value)) throw UNSOUND;
      diagnostics.push(...found);
      return;
    }
    check(value);
    if (Array.isArray(value)) { each(value, visit); return; }
    if (value instanceof Map) { value.forEach(visit); return; }
    for (const key of DIAGNOSTIC_KEYS) collect(read(value, key));
    for (const key of OPAQUE_KEYS) scan(read(value, key));
    for (const key of MAP_KEYS) values(read(value, key));
    for (const key of RECORD_KEYS) visit(read(value, key));
  }
  visit(result);
  return diagnostics;
}

export function knownIssueResultDisposition(result: unknown): ReturnType<typeof knownIssueDisposition> {
  return knownIssueDisposition(knownIssueDiagnosticsIn(result));
}
