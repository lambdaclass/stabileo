/**
 * A JSON Schema validator for exactly the keywords `rc-cad-handoff.schema.json` uses.
 *
 * ── Why not a library ───────────────────────────────────────────
 *
 * The project ships no schema validator and adding one puts a general-purpose parser into a
 * browser bundle to check one document. The design record's boundary is that the schema is the
 * shared artifact and each side validates it with what it has; this is Stabileo's side of that.
 *
 * ── The dangerous failure mode, and the guard against it ────────
 *
 * A hand-written validator's real risk is not a wrong rejection — a test catches that. It is
 * SILENT UNDER-VALIDATION: someone adds `maxItems` or `oneOf` to the schema, this file does not
 * implement it, and the constraint is quietly never checked while every test still passes.
 *
 * So `assertSupportedSchema` walks the schema first and THROWS on any keyword this file does
 * not implement. A schema that grows past the validator fails loudly at the first call rather
 * than validating less than it claims.
 */

/** Keywords that carry no constraint and are therefore safe to ignore. */
const ANNOTATIONS = new Set([
  '$schema', '$id', 'title', 'description', 'default', 'examples', '$comment', 'deprecated',
]);

/** Keywords this validator enforces. Anything else is a hard error. */
const SUPPORTED = new Set([
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'minLength', 'minimum', 'exclusiveMinimum', 'pattern',
  '$ref', '$defs', 'allOf', 'if', 'then',
]);

export interface SchemaViolation {
  /** JSON Pointer-ish path into the instance, e.g. `/concrete/bodies/1/shape/B`. */
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

/**
 * Refuse a schema this validator would under-enforce.
 *
 * Throws rather than returning: an unsupported keyword is a developer error discovered at
 * build or test time, never a user-facing condition.
 */
export function assertSupportedSchema(schema: Schema, at = '#'): void {
  for (const key of Object.keys(schema)) {
    if (ANNOTATIONS.has(key)) continue;
    if (!SUPPORTED.has(key)) {
      throw new Error(`json-schema-subset: unsupported keyword "${key}" at ${at}`);
    }
  }
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) assertSupportedSchema(v as Schema, path);
  };
  walk(schema.items, `${at}/items`);
  walk(schema.if, `${at}/if`);
  walk(schema.then, `${at}/then`);
  for (const bucket of ['properties', '$defs'] as const) {
    const group = schema[bucket];
    if (group && typeof group === 'object') {
      for (const [k, v] of Object.entries(group as Record<string, unknown>)) {
        walk(v, `${at}/${bucket}/${k}`);
      }
    }
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((v, i) => walk(v, `${at}/allOf/${i}`));
  }
  // `additionalProperties` is supported only as `false`; a sub-schema there would silently
  // permit whatever it describes.
  if ('additionalProperties' in schema && schema.additionalProperties !== false) {
    throw new Error(`json-schema-subset: additionalProperties must be false at ${at}`);
  }
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    // Integer means integral, and a non-finite value is not one. `Number.isInteger` already
    // rejects NaN and both infinities.
    case 'integer': return Number.isInteger(value);
    default: throw new Error(`json-schema-subset: unknown type "${type}"`);
  }
}

/**
 * Validate `instance` against `schema`.
 *
 * Returns every violation rather than the first, because a producer fixing one field wants to
 * see the rest in the same run.
 */
export function validateAgainstSchema(instance: unknown, schema: Schema): SchemaViolation[] {
  assertSupportedSchema(schema);
  const root = schema;

  const resolve = (ref: string): Schema => {
    if (!ref.startsWith('#/')) throw new Error(`json-schema-subset: unsupported $ref "${ref}"`);
    let node: unknown = root;
    for (const part of ref.slice(2).split('/')) {
      node = (node as Record<string, unknown>)?.[part];
      if (node === undefined) throw new Error(`json-schema-subset: unresolvable $ref "${ref}"`);
    }
    return node as Schema;
  };

  const check = (value: unknown, s: Schema, path: string, out: SchemaViolation[]): void => {
    if (typeof s.$ref === 'string') {
      check(value, resolve(s.$ref), path, out);
      return;
    }
    const fail = (message: string) => out.push({ path: path || '/', message });

    if (s.type !== undefined) {
      const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
      if (!types.some((t) => typeMatches(value, t))) {
        fail(`expected type ${types.join(' | ')}, got ${describe(value)}`);
        return;
      }
    }
    if ('const' in s && !deepEqual(value, s.const)) {
      fail(`expected the constant ${JSON.stringify(s.const)}, got ${describe(value)}`);
    }
    if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(value, e))) {
      fail(`expected one of ${JSON.stringify(s.enum)}, got ${describe(value)}`);
    }
    if (typeof value === 'string') {
      if (typeof s.minLength === 'number' && value.length < s.minLength) {
        fail(`shorter than minLength ${s.minLength}`);
      }
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(value)) {
        fail(`does not match pattern ${s.pattern}`);
      }
    }
    if (typeof value === 'number') {
      if (typeof s.minimum === 'number' && value < s.minimum) {
        fail(`below minimum ${s.minimum}`);
      }
      if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) {
        fail(`not greater than exclusiveMinimum ${s.exclusiveMinimum}`);
      }
    }
    if (Array.isArray(value)) {
      if (typeof s.minItems === 'number' && value.length < s.minItems) {
        fail(`fewer than minItems ${s.minItems}`);
      }
      if (s.items && typeof s.items === 'object') {
        value.forEach((v, i) => check(v, s.items as Schema, `${path}/${i}`, out));
      }
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const props = (s.properties ?? {}) as Record<string, Schema>;
      for (const key of (s.required as string[] | undefined) ?? []) {
        if (!(key in obj)) fail(`missing required property "${key}"`);
      }
      if (s.additionalProperties === false) {
        for (const key of Object.keys(obj)) {
          if (!(key in props)) fail(`unexpected property "${key}"`);
        }
      }
      for (const [key, sub] of Object.entries(props)) {
        if (key in obj) check(obj[key], sub, `${path}/${key}`, out);
      }
    }
    if (Array.isArray(s.allOf)) {
      for (const sub of s.allOf as Schema[]) check(value, sub, path, out);
    }
    // `if`/`then` without `else`, which is the only conditional shape the schema uses. The
    // probe collects into a THROWAWAY array: an `if` that does not match is not a violation.
    if (s.if && typeof s.if === 'object') {
      const probe: SchemaViolation[] = [];
      check(value, s.if as Schema, path, probe);
      if (probe.length === 0 && s.then && typeof s.then === 'object') {
        check(value, s.then as Schema, path, out);
      }
    }
  };

  const violations: SchemaViolation[] = [];
  check(instance, root, '', violations);
  return violations;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  if (typeof v === 'number' && !Number.isFinite(v)) return `non-finite number (${String(v)})`;
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(
    (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
