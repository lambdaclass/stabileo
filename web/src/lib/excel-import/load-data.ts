import { defaultLoadCases } from '../model/default-loads';
import { parseDecimal } from '../utils/numeric-input';
import type { JSONModel } from '../templates/load-fixture';
import type { AxesFrame } from '../axes/frame';
import { transformSnapshot } from '../model/code/frame';
import { loadFieldUnit } from '../model/load-field-unit';
import type { RowProblem } from './parse';
import { unguardText } from '../export/workbook-cells';

const specs: Record<string, { required: string[]; optional?: string[]; boolean?: string[]; frame?: string[]; target: 'nodeId' | 'elementId' }> = {
  nodal: { required: [], optional: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'], target: 'nodeId' },
  nodal3d: { required: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'], target: 'nodeId' },
  distributed: { required: ['qI', 'qJ'], optional: ['angle', 'a', 'b'], boolean: ['isGlobal'], target: 'elementId' },
  distributed3d: { required: ['qYI', 'qYJ', 'qZI', 'qZJ'], optional: ['qXI', 'qXJ', 'a', 'b'], frame: ['local', 'global', 'projected'], target: 'elementId' },
  pointOnElement: { required: ['a', 'p'], optional: ['px', 'my', 'angle'], boolean: ['isGlobal'], target: 'elementId' },
  thermal: { required: ['dtUniform', 'dtGradient'], target: 'elementId' },
};

export function readLoadData(
  rows: unknown[][], frame: AxesFrame, mode: '2d' | 'pro', model: JSONModel, problems: RowProblem[],
  unitFactor: (wanted: string, given: string) => number | null,
): JSONModel['loads'] {
  if (rows.length < 2) return [];
  const headers = rows[0]!.map(h => String(h).trim().toLowerCase());
  const fail = (row: number, message: string) => problems.push({ sheet: 'LoadData', row, message });
  const columns = ['load', 'case', 'type', 'node', 'member', 'shell', 'field', 'value', 'unit'];
  if (headers.length !== columns.length || columns.some(c => headers.filter(h => h === c).length !== 1)) {
    fail(1, 'LoadData requires one of each exported column.');
    return [];
  }
  const numberCell = (value: unknown): number => typeof value === 'number' ? value : typeof value === 'string' ? parseDecimal(value) ?? NaN : NaN;
  const groups = new Map<string, { row: number; metadata: string; type: string; data: Record<string, unknown>; fields: Set<string>; invalid: boolean }>();
  const nodes = new Set(model.nodes.map(n => n.id)), members = new Set(model.elements.map(e => e.id));
  const cases = new Set((model.loadCases?.length ? model.loadCases : defaultLoadCases()).map(c => c.id));
  for (const [index, row] of rows.entries()) {
    if (index === 0 || row.every(v => v === '' || v === null || v === undefined)) continue;
    const cell = (key: string) => row[headers.indexOf(key)];
    const text = (key: string) => unguardText(String(cell(key) ?? '')).trim();
    const id = numberCell(cell('load')), caseId = numberCell(cell('case')), type = text('type');
    const spec = Object.hasOwn(specs, type) ? specs[type] : undefined;
    const target = numberCell(cell(spec?.target === 'nodeId' ? 'node' : 'member'));
    const metadata = JSON.stringify(['case', 'type', 'node', 'member', 'shell'].map(cell));
    const key = String(id);
    let group = groups.get(key);
    if (!group) {
      group = { row: index + 1, metadata, type, data: { id, ...(text('case') === '' ? {} : { caseId }), ...(spec ? { [spec.target]: target } : {}) }, fields: new Set(), invalid: false };
      groups.set(key, group);
    }
    const reject = (message: string) => { group!.invalid = true; fail(index + 1, message); };
    if (!Number.isSafeInteger(id) || id <= 0 || (text('case') !== '' && (!Number.isSafeInteger(caseId) || caseId <= 0 || !cases.has(caseId)))) { reject('Invalid load or case identifier.'); continue; }
    if (!spec) { reject(`Unsupported LoadData type: ${type}.`); continue; }
    if (group.metadata !== metadata) { reject('Conflicting metadata for one load.'); continue; }
    if (!Number.isSafeInteger(target) || !(spec.target === 'nodeId' ? nodes : members).has(target)
      || text(spec.target === 'nodeId' ? 'member' : 'node') !== '' || text('shell') !== '') { reject('Invalid load target.'); continue; }
    const field = text('field');
    if (group.fields.has(field)) { reject('Duplicate load field.'); continue; }
    group.fields.add(field);
    const unit = text('unit');
    if (field === 'frame' && spec.frame) {
      const value = text('value');
      if (!spec.frame.includes(value) || unit !== '') reject('Invalid load frame.'); else group.data[field] = value;
    } else if (spec.boolean?.includes(field)) {
      if (![0, 1, false, true].includes(cell('value') as never) || unit !== '') reject('Invalid boolean load field.');
      else group.data[field] = cell('value') === 1 || cell('value') === true;
    } else if ([...spec.required, ...(spec.optional ?? [])].includes(field)) {
      const value = numberCell(cell('value')), wanted = loadFieldUnit(type, field);
      const factor = unitFactor(wanted, unit);
      if (text('value') === '' || !Number.isFinite(value) || factor === null || !Number.isFinite(value * factor)) reject('Invalid load value or unit.');
      else group.data[field] = value * factor;
    } else reject(`Unsupported load field: ${field}.`);
  }
  const loads: JSONModel['loads'] = [];
  for (const group of groups.values()) {
    const spec = Object.hasOwn(specs, group.type) ? specs[group.type] : undefined;
    if (!spec || group.invalid) continue;
    if (spec.required.some(k => !group.fields.has(k))) { fail(group.row, 'Missing required load fields.'); continue; }
    loads.push({ type: group.type, data: group.data });
  }
  const canonical = transformSnapshot({ analysisMode: mode, loads }, frame.choice, 'toModel').loads;
  return canonical.filter(load => {
    if (load.type !== 'nodal') return true;
    const d = load.data;
    if (['fx', 'fz', 'my'].some(k => typeof d[k] !== 'number') || ['fy', 'mx', 'mz'].some(k => d[k] !== undefined)) {
      fail(groups.get(String(d.id))!.row, 'Plane nodal load must contain only its three physical components.');
      return false;
    }
    return true;
  });
}
