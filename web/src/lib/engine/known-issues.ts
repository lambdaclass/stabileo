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
    const refusals = errors.filter((d: { code?: string }) => d.code === 'plastic_capacity_missing');
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
const frozenDiagnostics = new WeakMap<object, Diagnostic[]>();

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

function assertSealed(value: object): void {
  if (!Object.isFrozen(value) || ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set || !PLAIN_PROTOTYPES.has(Object.getPrototypeOf(value))) throw UNSOUND;
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) if (!Object.prototype.hasOwnProperty.call(value, i)) throw UNSOUND;
  for (const key of Object.getOwnPropertyNames(value)) if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) throw UNSOUND;
}

function ownRead(record: object, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(record, key);
  if (!property && key in record) throw UNSOUND;
  if ((record as Record<string, unknown>)[key] !== property?.value) throw UNSOUND;
  return property?.value;
}

const isOwnKnownIssue = (d: unknown): d is Diagnostic =>
  !!d && typeof d === 'object' && ownRead(d, 'code') === 'known_issue' && typeof ownRead(d, 'message') === 'string';

function frozenDiagnosticsOf(result: object): Diagnostic[] {
  const cached = frozenDiagnostics.get(result);
  if (cached) return cached;
  try {
    const found = diagnosticsIn(result, result, true);
    frozenDiagnostics.set(result, found);
    return found;
  } catch (error) {
    if (error !== UNSOUND) throw error;
    frozenResults.delete(result);
    return diagnosticsIn(result, null, false);
  }
}

export function knownIssueDiagnosticsIn(result: unknown): Diagnostic[] {
  return diagnosticsIn(result, null, false);
}

function diagnosticsIn(result: unknown, root: object | null, sealed: boolean): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<object>();
  const scanned = new Set<object>();
  const check = sealed ? assertSealed : () => {};
  const read = sealed ? ownRead : (record: object, key: string) => (record as Record<string, unknown>)[key];
  const knownIssue = sealed ? isOwnKnownIssue : isKnownIssue;
  function collect(value: unknown): void {
    if (value && typeof value === 'object') check(value);
    if (Array.isArray(value)) value.forEach(collect);
    else if (knownIssue(value)) diagnostics.push(value);
  }
  function scan(value: unknown): void {
    if (!value || typeof value !== 'object' || scanned.has(value)) return;
    scanned.add(value);
    check(value);
    if (knownIssue(value)) diagnostics.push(value);
    (value instanceof Map ? [...value.values()] : Object.values(value)).forEach(scan);
  }
  function values(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    check(value);
    if (Array.isArray(value)) { value.forEach(values); return; }
    (value instanceof Map ? [...value.values()] : Object.values(value)).forEach(visit);
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value !== root && frozenResults.has(value)) {
      const found = frozenDiagnosticsOf(value);
      if (sealed && !frozenResults.has(value)) throw UNSOUND;
      diagnostics.push(...found);
      return;
    }
    check(value);
    if (Array.isArray(value)) { value.forEach(visit); return; }
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
