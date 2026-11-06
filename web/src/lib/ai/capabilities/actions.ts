import { AiActionError } from './limits';

export interface ActionParams {
  create_beam: { span: number; q?: number; support_left?: string; support_right?: string; section?: string; p_tip?: number };
  create_cantilever: { length: number; p_tip?: number; q?: number; section?: string };
  create_continuous_beam: { spans: number[]; q?: number; section?: string };
  create_portal_frame: {
    width: number; height: number; q_beam?: number; h_lateral?: number;
    base_support?: string; beam_section?: string; column_section?: string;
  };
  create_truss: { span: number; height: number; n_panels?: number; pattern?: string; top_load?: number };
  create_multi_story_frame: {
    n_bays: number; n_floors: number; bay_width: number; floor_height: number;
    q_beam?: number; h_lateral?: number; beam_section?: string; column_section?: string;
  };
  create_multi_story_frame_3d: {
    n_bays_x: number; n_bays_z: number; n_floors: number; bay_width: number; floor_height: number;
    q_beam?: number; h_lateral?: number; base_support?: string; beam_section?: string; column_section?: string;
  };
  create_portal_frame_3d: {
    width: number; depth: number; height: number; q_beam?: number;
    base_support?: string; beam_section?: string; column_section?: string;
  };
  add_bay: { width: number; side?: string; beam_section?: string; column_section?: string };
  add_story: { height: number; beam_section?: string; column_section?: string };
  change_section: { section: string; element_ids?: number[]; element_filter?: string };
  set_all_supports: { support_type: string };
  set_all_beam_loads: { q: number };
  add_lateral_loads: { h: number };
  add_distributed_load: { element_id: number; q: number };
  add_nodal_load: { node_id: number; fx?: number; fy?: number; fz?: number; mx?: number; my?: number; mz?: number };
  delete_element: { element_id: number };
  delete_load: { load_id: number };
  create_model: {
    analysis_mode: string; nodes: unknown[]; elements: unknown[]; materials: unknown[];
    sections: unknown[]; supports: unknown[]; loads?: unknown[];
  };
  unsupported: Record<string, never>;
}

export type ActionName = keyof ActionParams;
export type BuildAction = { [K in ActionName]: { action: K; params: ActionParams[K] } }[ActionName];
export type ActionOf<K extends ActionName> = Extract<BuildAction, { action: K }>;

type Kind = 'f64' | 'u32' | 'string' | 'f64[]' | 'u32[]' | 'value[]';
type Field = [name: string, kind: Kind, required: boolean, aliases?: string[]];

const req = (name: string, kind: Kind): Field => [name, kind, true];
const opt = (name: string, kind: Kind, aliases?: string[]): Field => [name, kind, false, aliases];

const SPECS: Record<ActionName, Field[]> = {
  create_beam: [req('span', 'f64'), opt('q', 'f64'), opt('support_left', 'string'), opt('support_right', 'string'), opt('section', 'string'), opt('p_tip', 'f64')],
  create_cantilever: [req('length', 'f64'), opt('p_tip', 'f64'), opt('q', 'f64'), opt('section', 'string')],
  create_continuous_beam: [req('spans', 'f64[]'), opt('q', 'f64'), opt('section', 'string')],
  create_portal_frame: [req('width', 'f64'), req('height', 'f64'), opt('q_beam', 'f64'), opt('h_lateral', 'f64'), opt('base_support', 'string'), opt('beam_section', 'string'), opt('column_section', 'string')],
  create_truss: [req('span', 'f64'), req('height', 'f64'), opt('n_panels', 'u32'), opt('pattern', 'string'), opt('top_load', 'f64')],
  create_multi_story_frame: [req('n_bays', 'u32'), req('n_floors', 'u32'), req('bay_width', 'f64'), req('floor_height', 'f64'), opt('q_beam', 'f64'), opt('h_lateral', 'f64'), opt('beam_section', 'string'), opt('column_section', 'string')],
  create_multi_story_frame_3d: [req('n_bays_x', 'u32'), req('n_bays_z', 'u32'), req('n_floors', 'u32'), req('bay_width', 'f64'), req('floor_height', 'f64'), opt('q_beam', 'f64'), opt('h_lateral', 'f64'), opt('base_support', 'string'), opt('beam_section', 'string'), opt('column_section', 'string')],
  create_portal_frame_3d: [req('width', 'f64'), req('depth', 'f64'), req('height', 'f64'), opt('q_beam', 'f64'), opt('base_support', 'string'), opt('beam_section', 'string'), opt('column_section', 'string')],
  add_bay: [req('width', 'f64'), opt('side', 'string'), opt('beam_section', 'string'), opt('column_section', 'string')],
  add_story: [req('height', 'f64'), opt('beam_section', 'string'), opt('column_section', 'string')],
  change_section: [req('section', 'string'), opt('element_ids', 'u32[]'), opt('element_filter', 'string')],
  set_all_supports: [req('support_type', 'string')],
  set_all_beam_loads: [req('q', 'f64')],
  add_lateral_loads: [req('h', 'f64')],
  add_distributed_load: [req('element_id', 'u32'), req('q', 'f64')],
  add_nodal_load: [req('node_id', 'u32'), opt('fx', 'f64'), opt('fy', 'f64'), opt('fz', 'f64'), opt('mx', 'f64'), opt('my', 'f64'), opt('mz', 'f64')],
  delete_element: [req('element_id', 'u32')],
  delete_load: [req('load_id', 'u32')],
  create_model: [
    [ 'analysis_mode', 'string', true, ['analysisMode'] ],
    req('nodes', 'value[]'), req('elements', 'value[]'), req('materials', 'value[]'),
    req('sections', 'value[]'), req('supports', 'value[]'), opt('loads', 'value[]'),
  ],
  unsupported: [],
};

const EDIT_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>([
  'add_bay', 'add_story', 'change_section', 'set_all_supports', 'set_all_beam_loads',
  'add_lateral_loads', 'add_distributed_load', 'add_nodal_load', 'delete_element', 'delete_load',
]);

export function isEdit(action: BuildAction): boolean {
  return EDIT_ACTIONS.has(action.action);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const U32_MAX = 4_294_967_295;
const isU32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= U32_MAX;
const isF64 = (v: unknown): v is number => typeof v === 'number';

function convert(kind: Kind, v: unknown): { ok: true; value: unknown } | { ok: false } {
  switch (kind) {
    case 'f64': return isF64(v) ? { ok: true, value: v } : { ok: false };
    case 'u32': return isU32(v) ? { ok: true, value: v } : { ok: false };
    case 'string': return typeof v === 'string' ? { ok: true, value: v } : { ok: false };
    case 'f64[]': return Array.isArray(v) && v.every(isF64) ? { ok: true, value: [...v] } : { ok: false };
    case 'u32[]': return Array.isArray(v) && v.every(isU32) ? { ok: true, value: [...v] } : { ok: false };
    case 'value[]': return Array.isArray(v) ? { ok: true, value: [...v] } : { ok: false };
  }
}

export function parseAction(name: unknown, params: unknown): BuildAction | null {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SPECS, name)) return null;
  if (!isPlainObject(params)) return null;
  const known = new Set(SPECS[name as ActionName].flatMap(([field, , , aliases]) => [field, ...(aliases ?? [])]));
  const unknown = Object.keys(params).filter((k) => !known.has(k));
  if (unknown.length > 0) throw new AiActionError(`${name} has no parameter ${unknown.map((k) => JSON.stringify(k)).join(', ')}; nothing was built`);
  const out: Record<string, unknown> = {};
  for (const [field, kind, required, aliases] of SPECS[name as ActionName]) {
    const keys = [field, ...(aliases ?? [])].filter((k) => Object.prototype.hasOwnProperty.call(params, k));
    if (keys.length > 1) return null;
    const raw = keys.length === 1 ? params[keys[0]] : undefined;
    if (raw === undefined || (raw === null && !required)) {
      if (required) return null;
      continue;
    }
    const converted = convert(kind, raw);
    if (!converted.ok) return null;
    out[field] = converted.value;
  }
  return { action: name, params: out } as BuildAction;
}

export interface ActionResponse {
  action: BuildAction;
  interpretation: string;
}

export function parseActionResponse(value: unknown): ActionResponse | null {
  if (!isPlainObject(value) || typeof value.interpretation !== 'string') return null;
  const action = parseAction(value.action, value.params);
  return action ? { action, interpretation: value.interpretation } : null;
}

export const MAX_PANELS = 200;
export const MAX_SPANS = 100;
export const MAX_BAYS = 100;
export const MAX_FLOORS = 200;
export const MAX_GENERATED_NODES = 50_000;
export const MAX_CREATE_MODEL_ENTRIES = 20_000;
export const MAX_ELEMENT_IDS = 20_000;

const fmt = (v: number): string => (Number.isNaN(v) ? 'NaN' : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : String(v));

function requirePositive(val: number, name: string): void {
  if (val <= 0 || !Number.isFinite(val)) {
    throw new AiActionError(`${name} must be a positive number, got ${fmt(val)}`);
  }
}

function requireAtMost(val: number, max: number, name: string): void {
  if (val > max) throw new AiActionError(`${name} must be <= ${max}, got ${val}`);
}

function requireAtLeastOne(val: number, name: string): void {
  if (val < 1) throw new AiActionError(`${name} must be >= 1`);
}

function loadValues(a: BuildAction): Array<[string, number | undefined]> {
  switch (a.action) {
    case 'create_beam':
    case 'create_cantilever':
      return [['q', a.params.q], ['p_tip', a.params.p_tip]];
    case 'create_continuous_beam':
      return [['q', a.params.q]];
    case 'create_portal_frame':
    case 'create_multi_story_frame':
    case 'create_multi_story_frame_3d':
      return [['q_beam', a.params.q_beam], ['h_lateral', a.params.h_lateral]];
    case 'create_portal_frame_3d':
      return [['q_beam', a.params.q_beam]];
    case 'create_truss':
      return [['top_load', a.params.top_load]];
    case 'set_all_beam_loads':
    case 'add_distributed_load':
      return [['q', a.params.q]];
    case 'add_nodal_load':
      return (['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const).map((k) => [k, a.params[k]]);
    default:
      return [];
  }
}

export function validateAction(a: BuildAction): void {
  for (const [name, v] of loadValues(a)) {
    if (v !== undefined && !Number.isFinite(v)) throw new AiActionError(`${name} must be a finite number`);
  }
  switch (a.action) {
    case 'create_beam': requirePositive(a.params.span, 'span'); break;
    case 'create_cantilever': requirePositive(a.params.length, 'length'); break;
    case 'create_continuous_beam': {
      const { spans } = a.params;
      if (spans.length === 0) throw new AiActionError('spans must not be empty');
      if (spans.length > MAX_SPANS) throw new AiActionError(`at most ${MAX_SPANS} spans`);
      spans.forEach((s, i) => requirePositive(s, `spans[${i}]`));
      break;
    }
    case 'create_portal_frame':
      requirePositive(a.params.width, 'width');
      requirePositive(a.params.height, 'height');
      break;
    case 'create_truss': {
      requirePositive(a.params.span, 'span');
      requirePositive(a.params.height, 'height');
      const n = a.params.n_panels;
      if (n !== undefined) {
        if (n < 2) throw new AiActionError('n_panels must be >= 2');
        requireAtMost(n, MAX_PANELS, 'n_panels');
      }
      break;
    }
    case 'create_multi_story_frame': {
      const p = a.params;
      requireAtLeastOne(p.n_bays, 'n_bays');
      requireAtLeastOne(p.n_floors, 'n_floors');
      requireAtMost(p.n_bays, MAX_BAYS, 'n_bays');
      requireAtMost(p.n_floors, MAX_FLOORS, 'n_floors');
      requirePositive(p.bay_width, 'bay_width');
      requirePositive(p.floor_height, 'floor_height');
      break;
    }
    case 'create_multi_story_frame_3d': {
      const p = a.params;
      requireAtLeastOne(p.n_bays_x, 'n_bays_x');
      requireAtLeastOne(p.n_bays_z, 'n_bays_z');
      requireAtLeastOne(p.n_floors, 'n_floors');
      requireAtMost(p.n_bays_x, MAX_BAYS, 'n_bays_x');
      requireAtMost(p.n_bays_z, MAX_BAYS, 'n_bays_z');
      requireAtMost(p.n_floors, MAX_FLOORS, 'n_floors');
      const nodes = (p.n_bays_x + 1) * (p.n_bays_z + 1) * (p.n_floors + 1);
      if (nodes > MAX_GENERATED_NODES) {
        throw new AiActionError(`frame would have ${nodes} nodes (max ${MAX_GENERATED_NODES})`);
      }
      requirePositive(p.bay_width, 'bay_width');
      requirePositive(p.floor_height, 'floor_height');
      break;
    }
    case 'create_portal_frame_3d':
      requirePositive(a.params.width, 'width');
      requirePositive(a.params.depth, 'depth');
      requirePositive(a.params.height, 'height');
      break;
    case 'add_bay': requirePositive(a.params.width, 'width'); break;
    case 'add_story': requirePositive(a.params.height, 'height'); break;
    case 'change_section':
      if (a.params.section.length === 0) throw new AiActionError('section must not be empty');
      if ((a.params.element_ids?.length ?? 0) > MAX_ELEMENT_IDS) {
        throw new AiActionError(`at most ${MAX_ELEMENT_IDS} element_ids`);
      }
      break;
    case 'add_lateral_loads':
      if (!Number.isFinite(a.params.h)) throw new AiActionError('h must be a finite number');
      break;
    case 'create_model': {
      const p = a.params;
      for (const key of ['nodes', 'elements', 'materials', 'sections', 'supports'] as const) {
        if (p[key].length === 0) {
          throw new AiActionError(`create_model: at least 1 ${key.slice(0, -1)} required`);
        }
      }
      const lens: Array<[string, number]> = [
        ['nodes', p.nodes.length], ['elements', p.elements.length], ['materials', p.materials.length],
        ['sections', p.sections.length], ['supports', p.supports.length], ['loads', p.loads?.length ?? 0],
      ];
      for (const [name, len] of lens) {
        if (len > MAX_CREATE_MODEL_ENTRIES) {
          throw new AiActionError(`create_model: at most ${MAX_CREATE_MODEL_ENTRIES} ${name}`);
        }
      }
      break;
    }
    default:
      break;
  }
}
