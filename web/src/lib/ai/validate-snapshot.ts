/**
 * Lightweight shape validator for AI-generated model snapshots.
 *
 * Enforces the structural contract of `ModelSnapshot` at the import boundary
 * before calling `modelStore.restore()`. This is NOT full semantic validation
 * (e.g. element references valid nodes) — it only checks that the top-level
 * collections exist with the expected types and that entries have required
 * scalar fields.
 *
 * See AI_ROADMAP.md §Safety Rule 3: "AI-generated model data must be validated
 * both in the backend and in the frontend before import or execution."
 */

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateBuildSnapshot(snapshot: unknown): ValidationResult {
  const errors: string[] = [];

  if (snapshot == null || typeof snapshot !== 'object') {
    return { valid: false, errors: ['Snapshot is not an object'] };
  }

  const s = snapshot as Record<string, unknown>;

  // ─── Required arrays ──────────────────────────────────────────

  checkArray(s, 'nodes', errors);
  checkArray(s, 'materials', errors);
  checkArray(s, 'sections', errors);
  checkArray(s, 'elements', errors);
  checkArray(s, 'supports', errors);
  checkArray(s, 'loads', errors);

  // ─── nextId object ────────────────────────────────────────────

  if (s.nextId == null || typeof s.nextId !== 'object') {
    errors.push('Missing or invalid "nextId" object');
  } else {
    const nid = s.nextId as Record<string, unknown>;
    for (const key of ['node', 'material', 'section', 'element', 'support', 'load']) {
      if (typeof nid[key] !== 'number') {
        errors.push(`nextId.${key} must be a number`);
      }
    }
  }

  // Stop early if top-level structure is broken
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // ─── Entry-level shape checks ─────────────────────────────────
  // Each collection is Array<[id, object]> (Map serialization format)

  const nodes = s.nodes as unknown[];
  const materials = s.materials as unknown[];
  const sections = s.sections as unknown[];
  const elements = s.elements as unknown[];
  const supports = s.supports as unknown[];
  const loads = s.loads as unknown[];

  // Must have at least 1 node and 1 element to be a valid structure
  if (nodes.length === 0) errors.push('nodes array is empty');
  if (elements.length === 0) errors.push('elements array is empty');

  // Spot-check first entry of each Map-style collection
  checkMapEntry(nodes, 'nodes', ['id', 'x', 'y'], errors);
  checkMapEntry(materials, 'materials', ['id', 'e'], errors);
  checkMapEntry(sections, 'sections', ['id', 'a', 'iz'], errors);
  checkMapEntry(elements, 'elements', ['id', 'nodeI', 'nodeJ', 'materialId', 'sectionId'], errors);
  checkMapEntry(supports, 'supports', ['id', 'nodeId', 'type'], errors);

  // Loads are Array<{type, data}> not Map entries
  if (loads.length > 0) {
    const first = loads[0];
    if (first == null || typeof first !== 'object') {
      errors.push('loads[0] is not an object');
    } else {
      const l = first as Record<string, unknown>;
      if (typeof l.type !== 'string') errors.push('loads[0].type must be a string');
      if (l.data == null || typeof l.data !== 'object') errors.push('loads[0].data must be an object');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────

function checkArray(obj: Record<string, unknown>, key: string, errors: string[]): void {
  if (!Array.isArray(obj[key])) {
    errors.push(`Missing or invalid "${key}" array`);
  }
}

/**
 * Checks that a Map-serialized array ([id, value] tuples) has valid first entry.
 * Verifies the entry is a [number, object] tuple and that the object has
 * the required keys as numbers or strings.
 */
function checkMapEntry(
  arr: unknown[],
  name: string,
  requiredKeys: string[],
  errors: string[],
): void {
  if (arr.length === 0) return; // emptiness checked separately where needed

  const entry = arr[0];
  if (!Array.isArray(entry) || entry.length < 2) {
    errors.push(`${name}[0] must be a [key, value] tuple`);
    return;
  }

  if (typeof entry[0] !== 'number') {
    errors.push(`${name}[0] key must be a number`);
  }

  const val = entry[1];
  if (val == null || typeof val !== 'object') {
    errors.push(`${name}[0] value must be an object`);
    return;
  }

  const obj = val as Record<string, unknown>;
  for (const k of requiredKeys) {
    if (obj[k] === undefined) {
      errors.push(`${name}[0] is missing required field "${k}"`);
    }
  }
}
