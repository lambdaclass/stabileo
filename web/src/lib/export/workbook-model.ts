/**
 * The model sheets of the project workbook.
 *
 * Where the importer has a sheet (`excel-import/schema.ts`), this writes it under the importer's
 * name and column keys, units in brackets, so the model part of an exported workbook opens in the
 * importer. What the importer does not read is added as further columns it skips: the releases
 * about each axis, member offsets, local axes, shear areas, restraints as solved. Loads have
 * more fields than the importer's fixed columns carry, so they go to a long sheet of their own,
 * one row per field, under a name the importer does not read.
 *
 * Section properties are the ones the engine was given (`buildSolverInput3D`), which for a
 * section with a drawn or catalogue geometry are its polygons' rather than the declared values:
 * the workbook records what was solved.
 */
import type { ModelData } from '../engine/solver-service';
import type { SolverInput3D } from '../engine/types-3d';
import type { LoadCase, LoadCombination } from '../store/model.svelte';
import { safeText, type WorkbookSheet } from './workbook-cells';

export interface WorkbookModel extends ModelData {
  loadCases: readonly LoadCase[];
  combinations: readonly LoadCombination[];
  /** Full groups, with names and kinds; `ModelData.groups` carries only the members. */
  namedGroups?: ReadonlyArray<{ id: number; name: string; kind: string; members: { nodes?: number[]; elements?: number[]; plates?: number[]; quads?: number[] } }>;
}

const b = (v: boolean | undefined) => (v ? 1 : 0);
const opt = (v: number | undefined | null) => (typeof v === 'number' && Number.isFinite(v) ? v : '');

function nodesSheet(m: WorkbookModel): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['id', 'x [m]', 'y [m]', 'z [m]']];
  for (const n of [...m.nodes.values()].sort((a, c) => a.id - c.id)) rows.push([n.id, n.x, n.y, n.z ?? 0]);
  return { name: 'Nodes', rows };
}

function membersSheet(m: WorkbookModel): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[
    'id', 'type', 'nodeI', 'nodeJ', 'material', 'section', 'hingeStart', 'hingeEnd', 'rollAngle [°]',
    'length [m]', 'releaseStartMy', 'releaseStartMz', 'releaseStartT', 'releaseEndMy', 'releaseEndMz', 'releaseEndT',
    'localYx', 'localYy', 'localYz', 'offsetFrame', 'offsetIx [m]', 'offsetIy [m]', 'offsetIz [m]', 'offsetJx [m]', 'offsetJy [m]', 'offsetJz [m]', 'behaviour',
  ]];
  for (const e of [...m.elements.values()].sort((a, c) => a.id - c.id)) {
    const ni = m.nodes.get(e.nodeI), nj = m.nodes.get(e.nodeJ);
    const length = ni && nj ? Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0)) : '';
    const o = e.offset;
    rows.push([
      e.id, e.type, e.nodeI, e.nodeJ, e.materialId, e.sectionId,
      // The importer reads a hinge as the release about local z, as the model's own migration does.
      b(e.releaseI?.mz), b(e.releaseJ?.mz), e.rollAngle ?? 0,
      length, b(e.releaseI?.my), b(e.releaseI?.mz), b(e.releaseI?.t), b(e.releaseJ?.my), b(e.releaseJ?.mz), b(e.releaseJ?.t),
      opt(e.localYx), opt(e.localYy), opt(e.localYz),
      o ? o.frame : '', opt(o?.i?.x), opt(o?.i?.y), opt(o?.i?.z), opt(o?.j?.x), opt(o?.j?.y), opt(o?.j?.z),
      typeof e.behaviour === 'string' ? e.behaviour : e.behaviour ? safeText(JSON.stringify(e.behaviour)) : '',
    ]);
  }
  return { name: 'Members', rows };
}

function materialsSheet(m: WorkbookModel): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['id', 'name', 'E [MPa]', 'nu', 'rho [kN/m³]', 'fy [MPa]', 'alpha [1/°C]']];
  for (const x of [...m.materials.values()].sort((a, c) => a.id - c.id)) rows.push([x.id, safeText(x.name), x.e, x.nu, x.rho, opt(x.fy), opt(x.alpha)]);
  return { name: 'Materials', rows };
}

function sectionsSheet(m: WorkbookModel, solved: SolverInput3D | null): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['id', 'name', 'shape', 'b [m]', 'h [m]', 'A [m²]', 'Iy [m⁴]', 'Iz [m⁴]', 'J [m⁴]', 'Ay [m²]', 'Az [m²]']];
  for (const s of [...m.sections.values()].sort((a, c) => a.id - c.id)) {
    const p = solved?.sections.get(s.id);
    rows.push([s.id, safeText(s.name), s.shape ?? '', opt(s.b), opt(s.h), p?.a ?? s.a, p?.iy ?? opt(s.iy), p?.iz ?? s.iz, p?.j ?? opt(s.j), opt(p?.asY), opt(p?.asZ)]);
  }
  return { name: 'Sections', rows };
}

function supportsSheet(m: WorkbookModel, solved: SolverInput3D | null): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [[
    'node', 'type', 'angle [°]', 'kx [kN/m]', 'ky [kN/m]', 'kz [kN/m]', 'krx [kN·m/rad]', 'kry [kN·m/rad]', 'krz [kN·m/rad]', 'dx [m]', 'dy [m]', 'dz [m]',
    'restrainedUx', 'restrainedUy', 'restrainedUz', 'restrainedRx', 'restrainedRy', 'restrainedRz', 'uplift',
  ]];
  const byNode = new Map([...(solved?.supports.values() ?? [])].map((s) => [s.nodeId, s]));
  for (const s of [...m.supports.values()].sort((a, c) => a.nodeId - c.nodeId || a.id - c.id)) {
    const r = byNode.get(s.nodeId);
    rows.push([
      s.nodeId, s.type, opt(s.angle), opt(s.kx), opt(s.ky), opt(s.kz), opt(s.krx), opt(s.kry), opt(s.krz), opt(s.dx), opt(s.dy), opt(s.dz),
      r ? b(r.rx) : '', r ? b(r.ry) : '', r ? b(r.rz) : '', r ? b(r.rrx) : '', r ? b(r.rry) : '', r ? b(r.rrz) : '', b(s.uplift),
    ]);
  }
  return { name: 'Supports', rows };
}

function casesSheet(m: WorkbookModel): WorkbookSheet {
  return { name: 'LoadCases', rows: [['id', 'name', 'type'], ...m.loadCases.map((c) => [c.id, safeText(c.name), c.type])] };
}

/** Long form, as the importer reads it: one row per combination and case. */
function combinationsSheet(m: WorkbookModel): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['combination', 'case', 'factor', 'id']];
  for (const c of m.combinations) for (const f of c.factors) rows.push([safeText(c.name), f.caseId, f.factor, c.id]);
  return { name: 'Combinations', rows };
}

function shellSheets(m: WorkbookModel): WorkbookSheet[] {
  const out: WorkbookSheet[] = [];
  for (const [name, map] of [['Quads', m.quads], ['Plates', m.plates]] as const) {
    if (!map || map.size === 0) continue;
    const rows: WorkbookSheet['rows'] = [['id', 'nodes', 'material', 'thickness [m]']];
    for (const s of [...map.values()].sort((a, c) => a.id - c.id)) rows.push([s.id, s.nodes.join(' '), s.materialId, s.thickness]);
    out.push({ name, rows });
  }
  return out;
}

function constraintsSheet(m: WorkbookModel): WorkbookSheet | null {
  if (!m.constraints?.length) return null;
  const rows: WorkbookSheet['rows'] = [['type', 'master', 'slaves', 'nodeI', 'nodeJ', 'data']];
  for (const c of m.constraints) {
    const x = c as unknown as Record<string, unknown>;
    const master = x.masterNode ?? x.master;
    const slaves = Array.isArray(x.slaveNodes) ? (x.slaveNodes as number[]).join(' ') : x.slaveNode ?? '';
    const { type, masterNode: _m, slaveNodes: _s, ...rest } = x;
    rows.push([String(type), typeof master === 'number' ? master : '', slaves as string | number, opt(x.nodeI as number), opt(x.nodeJ as number), safeText(JSON.stringify(rest))]);
  }
  return { name: 'Constraints', rows };
}

/** The unit of a load field, by the model's naming. Empty where the field has none. */
function loadFieldUnit(type: string, field: string): string {
  const f = field.toLowerCase();
  if (/^(fx|fy|fz|p|px|py|pz)$/.test(f)) return 'kN';
  if (/^(mx|my|mz)$/.test(f)) return 'kN·m';
  if (/^q/.test(f)) return type === 'surface3d' ? 'kN/m²' : 'kN/m';
  if (f === 'pressure') return 'kN/m²';
  if (/^(a|b|x|position|start|end|length)$/.test(f)) return 'm';
  if (/^(dt|dtg|dtuniform|dtgradient|dty|dtz)$/.test(f)) return '°C';
  if (f === 'angle') return '°';
  return '';
}

/**
 * Every load, one row per field: its case, its type, what it acts on, the field and its value.
 * Long rather than wide because the nine load types share few fields, and a wide sheet of them
 * is mostly blank cells nobody can tell from zeros.
 */
function loadsSheet(m: WorkbookModel): WorkbookSheet {
  const rows: WorkbookSheet['rows'] = [['load', 'case', 'type', 'node', 'member', 'shell', 'field', 'value', 'unit']];
  m.loads.forEach((l, i) => {
    const d = l.data as unknown as Record<string, unknown>;
    const node = typeof d.nodeId === 'number' ? d.nodeId : '';
    const member = typeof d.elementId === 'number' ? d.elementId : '';
    const shell = typeof d.quadId === 'number' ? d.quadId : typeof d.plateId === 'number' ? d.plateId : '';
    const id = typeof d.id === 'number' ? d.id : i + 1;
    for (const [field, value] of Object.entries(d)) {
      if (['id', 'caseId', 'nodeId', 'elementId', 'quadId', 'plateId'].includes(field) || value === undefined || value === null) continue;
      const cell = typeof value === 'number' ? value : typeof value === 'boolean' ? b(value) : safeText(typeof value === 'string' ? value : JSON.stringify(value));
      rows.push([id, typeof d.caseId === 'number' ? d.caseId : 1, l.type, node, member, shell, field, cell, loadFieldUnit(l.type, field)]);
    }
  });
  return { name: 'LoadData', rows };
}

function groupsSheet(m: WorkbookModel): WorkbookSheet | null {
  if (!m.namedGroups?.length) return null;
  const rows: WorkbookSheet['rows'] = [['group', 'name', 'kind', 'entity', 'id']];
  for (const g of m.namedGroups) {
    for (const [entity, ids] of Object.entries(g.members)) for (const id of ids ?? []) rows.push([g.id, safeText(g.name), g.kind, entity, id]);
  }
  return { name: 'Groups', rows };
}

/** The model's sheets, in the order a reader looks for them. */
export function modelSheets(m: WorkbookModel, solved: SolverInput3D | null): WorkbookSheet[] {
  return [
    nodesSheet(m), membersSheet(m), materialsSheet(m), sectionsSheet(m, solved), supportsSheet(m, solved),
    ...shellSheets(m), casesSheet(m), loadsSheet(m), combinationsSheet(m),
    ...[constraintsSheet(m), groupsSheet(m)].filter((s): s is WorkbookSheet => !!s),
  ];
}
