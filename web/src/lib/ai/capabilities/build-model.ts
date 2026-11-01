import type { ConversationMessage, ModelContext, SolverDiagnosticMsg } from '../client';
import { type BuildAction, isEdit, isPlainObject, parseAction, parseActionResponse, validateAction } from './actions';
import { applyEdit } from './edit-executor';
import { executeAction } from './generators';
import {
  AiActionError, MAX_LIST_LEN, MAX_MESSAGES, checkListLen, checkText, promptLabel, promptLine, sanitizeLocale,
} from './limits';
import { type AnalysisMode, promptText } from './registry';
import { validateSnapshot } from './validate-snapshot';
import { asU64 } from './snapshot-json';
import { tp } from '../../i18n';

export type ToolOutcome =
  | { kind: 'snapshot'; snapshot: Record<string, unknown>; message: string; changeSummary?: string }
  | { kind: 'refusal'; message: string }
  | { kind: 'text'; message: string };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const VERTICAL_AXIS_3D = 'z';
const DEFAULT_HORIZONTAL_PLANE_3D = 'XY';
const GRAVITY_DIRECTION_3D = [0, 0, -1];

const debugF64 = (v: number): string => (Number.isInteger(v) && Math.abs(v) < 1e16 ? `${v}.0` : String(v));
const debugList = (vs: number[]): string => `[${vs.map(debugF64).join(', ')}]`;

export function validateBuildRequest(
  description: string,
  mode: string,
  history?: ConversationMessage[],
  diagnostics?: SolverDiagnosticMsg[],
  ctx?: ModelContext,
): void {
  checkText('description', description);
  if (!(['2d', '3d'] as const).includes(mode as AnalysisMode)) {
    throw new AiActionError(`analysisMode must be "2d" or "3d", got ${JSON.stringify(promptLabel(mode))}`);
  }
  if (history) {
    checkListLen('messages', history.length, MAX_MESSAGES);
    for (const m of history) checkText('messages[].content', m.content);
  }
  if (diagnostics) {
    checkListLen('solverDiagnostics', diagnostics.length, MAX_MESSAGES);
    for (const d of diagnostics) checkText('solverDiagnostics[].message', d.message);
  }
  if (ctx) {
    checkListLen('modelContext.sections', ctx.sections.length, MAX_LIST_LEN);
    checkListLen('modelContext.materials', ctx.materials.length, MAX_LIST_LEN);
    checkListLen('modelContext.supportTypes', ctx.supportTypes.length, MAX_LIST_LEN);
    checkListLen('modelContext.elementTypes', ctx.elementTypes.length, MAX_LIST_LEN);
    checkListLen('modelContext.floorHeights', ctx.floorHeights.length, MAX_LIST_LEN);
    checkListLen('modelContext.bayWidths', ctx.bayWidths.length, MAX_LIST_LEN);
  }
}

export function buildConversation(
  description: string,
  history?: ConversationMessage[],
  diagnostics?: SolverDiagnosticMsg[],
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const msg of history ?? []) {
    turns.push({ role: msg.role === 'assistant' || (msg.role as string) === 'ai' ? 'assistant' : 'user', content: msg.content });
  }
  if (diagnostics && diagnostics.length > 0) {
    const lines = diagnostics.map((d) => `- [${promptLabel(d.severity)}] ${promptLabel(d.code)}: ${promptLine(d.message)}`);
    turns.push({
      role: 'user',
      content: `The solver found these issues with your model:\n${lines.join('\n')}\n\nPlease fix them by calling create_model again with corrected data.`,
    });
  }
  turns.push({ role: 'user', content: description });
  return turns;
}

function contextSection(c: ModelContext): string {
  const sections = c.sections.map((s) => promptLabel(s.name));
  const supportTypes = c.supportTypes.map((s) => promptLabel(s));
  const b = c.bounds;
  const yBounds = b.yMin !== undefined && b.yMax !== undefined ? `, Y (depth) [${b.yMin}, ${b.yMax}]` : '';
  const verticalAxis = (c.verticalAxis as string) === 'y' ? 'y' : VERTICAL_AXIS_3D;
  return `

The user has an existing model on canvas:
- ${c.nodeCount} nodes, ${c.elementCount} elements, ${c.supportCount} supports, ${c.loadCount} loads
- Bounds: X [${b.xMin}, ${b.xMax}]${yBounds}, Z (vertical) [${b.zMin}, ${b.zMax}]
- 3D contract: vertical axis = ${verticalAxis}, horizontal plane = ${DEFAULT_HORIZONTAL_PLANE_3D}, gravity = ${debugList(GRAVITY_DIRECTION_3D)}
- Sections: ${sections.join(', ')}
- Support types: ${supportTypes.join(', ')}
- Floor heights: ${debugList(c.floorHeights)}
- Bay widths: ${debugList(c.bayWidths)}

You can EDIT the existing model (add_bay, add_story, change_section, etc.) or CREATE a completely new one.
Prefer edit tools when the user says "add", "change", "make it taller", "more bays", etc.
Use create tools when the user wants something entirely different.`;
}

export const MAX_SNAPSHOT_PROMPT_BYTES = 120 * 1024;

function snapshotSection(snapshot: Record<string, unknown>): string {
  const { nodes, elements, materials, sections, supports, loads } = snapshot;
  const json = JSON.stringify({ nodes, elements, materials, sections, supports, loads });
  if (new TextEncoder().encode(json).length > MAX_SNAPSHOT_PROMPT_BYTES) {
    return '\n\n## Current model\nThe model is too large to include. Ask the user for the node, element or load IDs an edit needs; never guess them.';
  }
  return `\n\n## Current model (JSON, entries are [id, data])\nUse these IDs for edits; never invent one.\n${json}`;
}

export function buildSystemPrompt(locale: string, mode: string, ctx?: ModelContext, snapshot?: Record<string, unknown>): string {
  const safeLocale = sanitizeLocale(locale);
  const capabilities = promptText(mode);
  const context = (ctx ? contextSection(ctx) : '') + (snapshot ? snapshotSection(snapshot) : '');
  return `You are a helpful assistant embedded in Stabileo, a structural analysis app.

Respond in locale: ${safeLocale}

When the user describes a structure they want (beam, frame, truss, building, cantilever, etc.), even vaguely, call the appropriate tool with reasonable defaults. Do NOT ask clarifying questions — just build it.

When no predefined generator matches the user's request, use the create_model tool to build the structure directly. You can create ANY structure: bridges, towers, arches, domes, irregular frames, trusses, etc.

Rules for create_model:
- Use unique sequential IDs starting from 1 for each entity type
- Every element must reference valid node, section, and material IDs
- At least one support is required for stability
- Default material: Steel A36 (E=200000, nu=0.3, rho=78.5, fy=250)
- Section properties: pick from the available sections list, or use reasonable custom values (a in m², iz in m⁴; in 3D also iy and j in m⁴, all positive)
- For 2D: nodes have x, y where y = vertical (up). Nodal loads use fx/fz/my (Z-up convention). Gravity = negative fz. Downward loads use negative fz.
- For 3D: nodes have x, y, z where z = elevation (up). Gravity = negative z. Downward loads use negative fz.
- Generate DETAILED structures with realistic geometry: use 20-60 nodes for complex structures like stadiums, bridges, towers. Don't oversimplify — a stadium needs columns, tiers, roof trusses with diagonals. A bridge needs deck, piers, cables or trusses.
- Use realistic dimensions in meters (e.g. stadium ~60-100m wide, bridge ~30-80m span, tower ~20-50m tall)

For everything else (greetings, questions, explanations, advice, any topic), reply in plain text.

${capabilities}${context}`;
}

function toTuples(entries: unknown[]): unknown[] {
  return entries.map((entry) => {
    if (Array.isArray(entry) && entry.length >= 2 && isPlainObject(entry[1])) return entry;
    if (isPlainObject(entry)) {
      const id = typeof entry.id === 'number' && Number.isInteger(entry.id) && entry.id >= 0 ? entry.id : 0;
      return [id, entry];
    }
    return entry;
  });
}

function maxId(tuples: unknown[]): number {
  let max = 0;
  for (const t of tuples) {
    const id = Array.isArray(t) ? t[0] : undefined;
    if (typeof id === 'number' && Number.isInteger(id) && id >= 0 && id > max) max = id;
  }
  return max;
}

function assembleCreateModel(p: Extract<BuildAction, { action: 'create_model' }>['params']): Record<string, unknown> {
  const nodes = toTuples(p.nodes);
  const elements = toTuples(p.elements);
  const materials = toTuples(p.materials);
  const sections = toTuples(p.sections);
  const supports = toTuples(p.supports);
  const loads = p.loads ? [...p.loads] : [];
  const snapshot = {
    analysisMode: p.analysis_mode,
    nodes, elements, materials, sections, supports, loads,
    nextId: {
      node: maxId(nodes) + 1,
      element: maxId(elements) + 1,
      material: maxId(materials) + 1,
      section: maxId(sections) + 1,
      support: maxId(supports) + 1,
      load: loads.reduce<number>((m, l) => Math.max(m, asU64(isPlainObject(l) && isPlainObject(l.data) ? l.data.id : undefined) ?? 0), 0) + 1,
    },
  };
  validateSnapshot(snapshot);
  return snapshot;
}

function runAction(action: BuildAction, current?: Record<string, unknown>): Record<string, unknown> {
  if (action.action === 'create_model') return assembleCreateModel(action.params);
  if (isEdit(action)) {
    if (!current) throw new AiActionError('Edit actions require an existing model (send currentSnapshot)');
    const edited = applyEdit(action, current);
    validateSnapshot(edited, { existingModel: true });
    return edited;
  }
  const snapshot = executeAction(action);
  validateSnapshot(snapshot);
  return snapshot;
}

const capitalize = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));
const withLoad = (text: string, q?: number): string => (q !== undefined ? `${text}, q = ${q} kN/m` : text);

function sectionSummary(p: Extract<BuildAction, { action: 'change_section' }>['params']): string {
  const section = p.section;
  if (p.element_ids !== undefined) return tp('ai.sum.sectionIds', { ids: p.element_ids.join(', '), section });
  if (p.element_filter === 'beam' || p.element_filter === 'beams') return tp('ai.sum.sectionBeams', { section });
  if (p.element_filter === 'column' || p.element_filter === 'columns') return tp('ai.sum.sectionColumns', { section });
  return tp('ai.sum.sectionAll', { section });
}

export function actionSummary(a: BuildAction): string {
  switch (a.action) {
    case 'create_beam': return withLoad(tp('ai.sum.beam', { span: a.params.span }), a.params.q);
    case 'create_cantilever': {
      const { p_tip, q } = a.params;
      const base = tp('ai.sum.cantilever', { length: a.params.length });
      return p_tip !== undefined ? `${base}, P = ${p_tip} kN` : withLoad(base, q);
    }
    case 'create_continuous_beam': return withLoad(tp('ai.sum.continuousBeam', { spans: a.params.spans.join(' + ') }), a.params.q);
    case 'create_portal_frame': return tp('ai.sum.portal', { width: a.params.width, height: a.params.height });
    case 'create_truss': return tp('ai.sum.truss', { pattern: capitalize(a.params.pattern ?? 'pratt'), span: a.params.span, height: a.params.height });
    case 'create_multi_story_frame': {
      const p = a.params;
      return tp('ai.sum.multiStory', { floors: p.n_floors, bays: p.n_bays, width: p.bay_width, height: p.floor_height });
    }
    case 'create_multi_story_frame_3d': {
      const p = a.params;
      return tp('ai.sum.multiStory3d', { floors: p.n_floors, bx: p.n_bays_x, by: p.n_bays_z, width: p.bay_width, height: p.floor_height });
    }
    case 'create_portal_frame_3d': return tp('ai.sum.portal3d', { width: a.params.width, depth: a.params.depth, height: a.params.height });
    case 'add_bay': return tp(a.params.side?.trim().toLowerCase() === 'left' ? 'ai.sum.addBayLeft' : 'ai.sum.addBayRight', { width: a.params.width });
    case 'add_story': return tp('ai.sum.addStory', { height: a.params.height });
    case 'change_section': return sectionSummary(a.params);
    case 'set_all_supports': return tp('ai.sum.supports', { type: a.params.support_type });
    case 'set_all_beam_loads': return tp('ai.sum.beamLoads', { q: a.params.q });
    case 'add_lateral_loads': return tp('ai.sum.lateral', { h: a.params.h });
    case 'add_distributed_load': return tp('ai.sum.distLoad', { q: a.params.q, id: a.params.element_id });
    case 'add_nodal_load': return tp('ai.sum.nodalLoad', { id: a.params.node_id });
    case 'delete_element': return tp('ai.sum.deleteElement', { id: a.params.element_id });
    case 'delete_load': return tp('ai.sum.deleteLoad', { id: a.params.load_id });
    case 'create_model': return tp('ai.sum.custom', { nodes: a.params.nodes.length, elements: a.params.elements.length });
    case 'unsupported': return '';
  }
}

function outcomeFromAction(action: BuildAction, interpretation: string, current: Record<string, unknown> | undefined, preferSummary: boolean): ToolOutcome {
  if (action.action === 'unsupported') return { kind: 'refusal', message: interpretation };
  validateAction(action);
  const snapshot = runAction(action, current);
  const summary = actionSummary(action);
  return {
    kind: 'snapshot',
    snapshot,
    message: preferSummary && interpretation === '' ? summary : interpretation,
    changeSummary: summary,
  };
}

export function outcomeFromToolCall(name: string, input: unknown, currentSnapshot?: Record<string, unknown>): ToolOutcome | null {
  let interpretation = '';
  let params: unknown = input;
  if (isPlainObject(input)) {
    const { interpretation: interp, ...rest } = input;
    if (typeof interp === 'string') interpretation = interp;
    params = rest;
  }
  const action = parseAction(name, params);
  if (!action) return null;
  return outcomeFromAction(action, interpretation, currentSnapshot, true);
}

function stripFences(content: string): string {
  if (!content.startsWith('```')) return content;
  let s = content;
  while (s.startsWith('```json')) s = s.slice(7);
  while (s.startsWith('```')) s = s.slice(3);
  while (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export function outcomeFromText(text: string, currentSnapshot?: Record<string, unknown>): ToolOutcome {
  const raw = text.trim();
  const parsed = tryJson(stripFences(raw));

  const actionResp = parseActionResponse(parsed);
  if (actionResp) return outcomeFromAction(actionResp.action, actionResp.interpretation, currentSnapshot, false);

  if (isPlainObject(parsed) && 'snapshot' in parsed && typeof parsed.interpretation === 'string') {
    const snapshot = parsed.snapshot;
    if (isPlainObject(snapshot) && 'nodes' in snapshot && 'elements' in snapshot) {
      validateSnapshot(snapshot);
      return { kind: 'snapshot', snapshot, message: parsed.interpretation };
    }
  }

  return { kind: 'text', message: raw };
}
