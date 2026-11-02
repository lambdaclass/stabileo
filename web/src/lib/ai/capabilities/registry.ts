import { SECTIONS } from './sections';

export type AnalysisMode = '2d' | '3d';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
}

type ParamType = 'f64' | 'u32' | 'string' | '[f64]' | '[u32]';

interface ParamDef {
  name: string;
  type: ParamType;
  required: boolean;
  default?: unknown;
  description: string;
}

export interface GeneratorDef {
  action: string;
  description: string;
  params: ParamDef[];
}

const preq = (name: string, type: ParamType, description: string): ParamDef => ({ name, type, required: true, description });
const popt = (name: string, type: ParamType, description: string): ParamDef => ({ name, type, required: false, description });
const pdef = (name: string, type: ParamType, def: unknown, description: string): ParamDef => ({ name, type, required: false, default: def, description });

const UNITS = { length: 'm', force: 'kN', distributed: 'kN/m', moment: 'kN·m', stress: 'MPa' };

const ELEMENT_TYPES = [
  { name: 'frame', modes: ['2d', '3d'], description: 'Beam-column, transmits moment. 3 DOF/node (2D), 6 DOF/node (3D).' },
  { name: 'truss', modes: ['2d', '3d'], description: 'Axial-only member. 2 DOF/node (2D), 3 DOF/node (3D).' },
];

const SUPPORT_TYPES: Record<AnalysisMode, string[]> = {
  '2d': ['fixed', 'pinned', 'rollerX', 'rollerZ'],
  '3d': ['fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ'],
};

const LOAD_TYPES: Record<AnalysisMode, Array<{ name: string; fields: string[]; description: string }>> = {
  '2d': [
    { name: 'nodal', fields: ['nodeId', 'fx', 'fz', 'my'], description: 'Point forces and moment at a node (kN, kN, kN·m)' },
    { name: 'distributed', fields: ['elementId', 'qI', 'qJ'], description: 'Linearly varying load along element (kN/m), perpendicular to the member in its local axes: negative pushes down on a member drawn left to right (node I left of node J) and up on one drawn right to left, and acts sideways on a column. Draw beams left to right so negative is downward. Frame members only, never a truss member.' },
  ],
  '3d': [
    { name: 'nodal3d', fields: ['nodeId', 'fx', 'fy', 'fz', 'mx', 'my', 'mz'], description: 'Forces and moments at a node in 3D (kN, kN·m)' },
    { name: 'distributed3d', fields: ['elementId', 'qYI', 'qYJ', 'qZI', 'qZJ', 'frame'], description: 'Distributed load along element (kN/m). With frame "global", qZ is along global Z (up), so gravity is negative qZI/qZJ; without it the axes are the member local ones, where local z is up for a horizontal member and local y is horizontal. Frame members only, never a truss member.' },
  ],
};

export function generatorCatalog(): GeneratorDef[] {
  return [
    { action: 'create_beam', description: 'Simply supported beam', params: [
      preq('span', 'f64', 'Beam length (m)'),
      popt('q', 'f64', 'Distributed load (kN/m, negative = down)'),
      pdef('support_left', 'string', 'pinned', 'Left support type'),
      pdef('support_right', 'string', 'rollerX', 'Right support type'),
      popt('section', 'string', "Section name (e.g. 'IPE 300')"),
      popt('p_tip', 'f64', 'Point load at right end (kN)'),
    ] },
    { action: 'create_cantilever', description: 'Cantilever beam (fixed at left, free at right)', params: [
      preq('length', 'f64', 'Cantilever length (m)'),
      popt('p_tip', 'f64', 'Point load at tip (kN, negative = down)'),
      popt('q', 'f64', 'Distributed load (kN/m)'),
      popt('section', 'string', 'Section name'),
    ] },
    { action: 'create_continuous_beam', description: 'Multi-span continuous beam', params: [
      preq('spans', '[f64]', 'Array of span lengths (m)'),
      popt('q', 'f64', 'Uniform distributed load on all spans (kN/m)'),
      popt('section', 'string', 'Section name'),
    ] },
    { action: 'create_portal_frame', description: 'Single-bay portal frame (2 columns + 1 beam)', params: [
      preq('width', 'f64', 'Beam span (m)'),
      preq('height', 'f64', 'Column height (m)'),
      popt('q_beam', 'f64', 'Distributed load on beam (kN/m)'),
      popt('h_lateral', 'f64', 'Horizontal load at top-left (kN)'),
      pdef('base_support', 'string', 'fixed', 'Column base support'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
    { action: 'create_truss', description: 'Planar truss (Pratt, Warren, or Howe pattern)', params: [
      preq('span', 'f64', 'Total span (m)'),
      preq('height', 'f64', 'Truss height (m)'),
      pdef('n_panels', 'u32', 4, 'Number of panels (>= 2)'),
      pdef('pattern', 'string', 'pratt', 'pratt | warren | howe'),
      pdef('top_load', 'f64', -10, 'Point load at each top node (kN, negative = down; 0 for none)'),
    ] },
    { action: 'create_multi_story_frame', description: 'Multi-bay, multi-story 2D frame', params: [
      preq('n_bays', 'u32', 'Number of bays'),
      preq('n_floors', 'u32', 'Number of floors'),
      preq('bay_width', 'f64', 'Width of each bay (m)'),
      preq('floor_height', 'f64', 'Height of each floor (m)'),
      popt('q_beam', 'f64', 'Distributed load on beams (kN/m)'),
      popt('h_lateral', 'f64', 'Lateral load per floor at left column (kN)'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
    { action: 'create_multi_story_frame_3d', description: 'Multi-story 3D space frame with X-bracing on perimeter', params: [
      preq('n_bays_x', 'u32', 'Bays in X direction'),
      preq('n_bays_z', 'u32', 'Bays in Y (plan depth); floors stack along Z'),
      preq('n_floors', 'u32', 'Number of floors'),
      preq('bay_width', 'f64', 'Bay width (m)'),
      preq('floor_height', 'f64', 'Floor height (m)'),
      popt('q_beam', 'f64', 'Distributed load on beams (kN/m)'),
      popt('h_lateral', 'f64', 'Total lateral load per floor, shared equally by the nodes of the x=0 face (kN)'),
      pdef('base_support', 'string', 'fixed3d', 'Base support type'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
    { action: 'create_portal_frame_3d', description: 'Simple 3D portal frame (4 columns + 4 beams)', params: [
      preq('width', 'f64', 'X span (m)'),
      preq('depth', 'f64', 'Y plan depth (m)'),
      preq('height', 'f64', 'Column height (m)'),
      popt('q_beam', 'f64', 'Distributed load on each of the four beams (kN/m)'),
      pdef('base_support', 'string', 'fixed3d', 'Base support type'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
  ];
}

export function editToolCatalog(): GeneratorDef[] {
  return [
    { action: 'add_bay', description: 'Add a bay to the right or left of an existing frame. The new members carry no loads: add them with separate load actions if the user wants them loaded', params: [
      preq('width', 'f64', 'Bay width (m)'),
      pdef('side', 'string', 'right', 'left or right'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
    { action: 'add_story', description: 'Add a story on top of an existing frame. The new members carry no loads: add them with separate load actions if the user wants them loaded', params: [
      preq('height', 'f64', 'Story height (m)'),
      popt('beam_section', 'string', 'Beam section name'),
      popt('column_section', 'string', 'Column section name'),
    ] },
    { action: 'change_section', description: 'Change section on elements (all, specific IDs, or by type: beam/column)', params: [
      preq('section', 'string', "New section name (e.g. 'HEB 400')"),
      popt('element_ids', '[u32]', 'Specific element IDs to change'),
      popt('element_filter', 'string', "Filter: 'beam' or 'column'"),
    ] },
    { action: 'set_all_supports', description: 'Change all support types (e.g. fixed to pinned)', params: [
      preq('support_type', 'string', 'New support type (fixed, pinned, rollerX, etc.)'),
    ] },
    { action: 'set_all_beam_loads', description: 'Set uniform distributed load on all beams (horizontal frame elements), replacing their distributed loads; columns and truss members keep theirs', params: [
      preq('q', 'f64', 'Distributed load (kN/m, negative = downward)'),
    ] },
    { action: 'add_lateral_loads', description: 'Add horizontal force at each floor level (left column)', params: [
      preq('h', 'f64', 'Horizontal force per floor (kN)'),
    ] },
    { action: 'add_distributed_load', description: 'Add distributed load on a specific element', params: [
      preq('element_id', 'u32', 'Target element ID'),
      preq('q', 'f64', 'Load intensity (kN/m). 2D: perpendicular to the member, negative pushing down on any member that is not vertical (sideways on a column), whichever way the member was drawn. 3D: along global Z on any member, negative is downward'),
    ] },
    { action: 'add_nodal_load', description: 'Add point load at a specific node', params: [
      preq('node_id', 'u32', 'Target node ID'),
      popt('fx', 'f64', 'Force along X (kN)'),
      popt('fy', 'f64', '3D: force along Y, plan depth (kN). 2D: a legacy name for fz'),
      popt('fz', 'f64', 'Vertical force along Z (kN, negative = downward)'),
      popt('mx', 'f64', 'Moment about X (kN·m), 3D only'),
      popt('my', 'f64', 'Moment about Y (kN·m)'),
      popt('mz', 'f64', '3D: moment about Z (kN·m). 2D: a legacy name for my'),
    ] },
    { action: 'delete_element', description: 'Delete an element by ID', params: [
      preq('element_id', 'u32', 'Element ID to delete'),
    ] },
    { action: 'delete_load', description: 'Delete a load by ID', params: [
      preq('load_id', 'u32', 'Load ID to delete'),
    ] },
  ];
}

export const isSpaceProtocol = (mode: unknown): boolean => mode === '3d';
export const supportTypesFor = (space: boolean): readonly string[] => SUPPORT_TYPES[space ? '3d' : '2d'];
const PLANAR_GENERATORS = new Set(['create_beam', 'create_cantilever', 'create_continuous_beam', 'create_portal_frame', 'create_truss', 'create_multi_story_frame']);

const offeredIn = (action: string, mode: string): boolean =>
  (isSpaceProtocol(mode) ? !PLANAR_GENERATORS.has(action) : !action.endsWith('_3d'));

const modeOf = (mode: string): AnalysisMode => (isSpaceProtocol(mode) ? '3d' : '2d');

export function promptText(analysisMode: string): string {
  const mode = modeOf(analysisMode);
  let out = `Units: ${UNITS.length} (length), ${UNITS.force} (force), ${UNITS.distributed} (distributed), ${UNITS.moment} (moment), ${UNITS.stress} (stress)\n\n`;
  out += `Available sections (a in m², iz, iy and j in m⁴; copy these values with the name): ${SECTIONS.map((s) => `${s.name} (a=${s.a.toPrecision(4)}, iz=${s.iz.toPrecision(4)}, iy=${s.iy.toPrecision(4)}, j=${s.j.toPrecision(4)})`).join(', ')}\n`;
  out += 'Material: Steel A36 (E=200000 MPa, fy=250 MPa). Always used.\n\n';
  out += 'Element types: ';
  out += ELEMENT_TYPES.filter((e) => e.modes.includes(analysisMode))
    .map((e) => `${e.name} (${e.description})`)
    .join('; ');
  out += '\n';
  out += `Support types: ${SUPPORT_TYPES[mode].join(', ')}\n`;
  for (const lt of LOAD_TYPES[mode]) {
    out += `  ${lt.name} — ${lt.description} [${lt.fields.join(', ')}]\n`;
  }
  out += '\n';
  out += 'Available generators (output as JSON action):\n';
  for (const gen of generatorCatalog()) {
    if (!offeredIn(gen.action, analysisMode)) continue;
    const params = gen.params.map((p) => {
      if (p.required) return `${p.name}: ${p.type} (required)`;
      if (p.default !== undefined) return `${p.name}: ${p.type} (default: ${JSON.stringify(p.default)})`;
      return `${p.name}: ${p.type} (optional)`;
    });
    out += `\n  ${gen.action} — ${gen.description}\n    ${params.join(', ')}\n`;
  }
  return out;
}

const INTERPRETATION = {
  type: 'string',
  description: "Brief description of what you're building, in the user's locale",
};

function paramSchema(p: ParamDef): Record<string, unknown> {
  const prop: Record<string, unknown> =
    p.type === '[f64]' ? { type: 'array', items: { type: 'number' } }
    : p.type === '[u32]' ? { type: 'array', items: { type: 'integer' } }
    : { type: p.type === 'f64' ? 'number' : p.type === 'u32' ? 'integer' : 'string' };
  prop.description = p.description;
  if (p.default !== undefined) prop.default = p.default;
  return prop;
}

const CREATE_MODEL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    analysisMode: { type: 'string', enum: ['2d', '3d'], description: 'Analysis mode' },
    nodes: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer' },
      x: { type: 'number' },
      y: { type: 'number', description: 'Vertical coordinate in 2D, plan depth (Y-axis) in 3D' },
      z: { type: 'number', description: 'Elevation (Z-up) in 3D models only' },
    }, required: ['id', 'x', 'y'] } },
    elements: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer' },
      type: { type: 'string', enum: ['frame', 'truss'] },
      nodeI: { type: 'integer' },
      nodeJ: { type: 'integer' },
      sectionId: { type: 'integer' },
      materialId: { type: 'integer' },
    }, required: ['id', 'type', 'nodeI', 'nodeJ', 'sectionId', 'materialId'] } },
    materials: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      e: { type: 'number', description: 'Elastic modulus (MPa)' },
      nu: { type: 'number' },
      rho: { type: 'number' },
      fy: { type: 'number' },
    }, required: ['id', 'name', 'e'] } },
    sections: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      a: { type: 'number', description: 'Cross-section area (m²)' },
      iz: { type: 'number', description: 'Moment of inertia about Z (m⁴)' },
      iy: { type: 'number', description: 'Moment of inertia about Y (m⁴), required in 3D' },
      j: { type: 'number', description: 'Torsional constant (m⁴), required in 3D' },
    }, required: ['id', 'name', 'a', 'iz'] } },
    supports: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'integer' },
      nodeId: { type: 'integer' },
      type: { type: 'string' },
    }, required: ['id', 'nodeId', 'type'] } },
    loads: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string' },
      data: { type: 'object' },
    }, required: ['type', 'data'] } },
    interpretation: INTERPRETATION,
  },
  required: ['analysisMode', 'nodes', 'elements', 'materials', 'sections', 'supports', 'interpretation'],
};

export function toolDefinitions(analysisMode: string, hasModel: boolean): ToolDef[] {
  const gens = hasModel ? [...generatorCatalog(), ...editToolCatalog()] : generatorCatalog();
  const tools: ToolDef[] = [];
  for (const gen of gens) {
    if (!offeredIn(gen.action, analysisMode)) continue;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of gen.params) {
      properties[p.name] = paramSchema(p);
      if (p.required) required.push(p.name);
    }
    properties.interpretation = { ...INTERPRETATION };
    required.push('interpretation');
    tools.push({
      name: gen.action,
      description: gen.description,
      input_schema: { type: 'object', properties, required },
    });
  }
  tools.push({
    name: 'create_model',
    description: "Create an arbitrary structural model by specifying nodes, elements, supports, and loads directly. Use this when no predefined generator matches the user's request.",
    input_schema: structuredClone(CREATE_MODEL_SCHEMA),
  });
  return tools;
}
