import { t, tp } from '../i18n';
import type { Load, Material, Support } from '../store/model.svelte';
import { isSupportType } from '../model/support-types';
import type { Constraint3D, LinearMpcConstraint } from './types-3d';
import type { AnalysisSettings, SelfWeightLoad } from './analysis-settings';
import type { ModelData } from './solver-service';

type NumberKeys<T> = { [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never }[keyof T] & string;
type Fields<T> = {
  required: readonly NumberKeys<T>[];
  optional: readonly NumberKeys<T>[];
};

const loadFields: { [K in Load['type']]: Fields<Extract<Load, { type: K }>['data']> } = {
  nodal: { required: ['nodeId', 'fx'], optional: ['fz', 'fy'] },
  distributed: { required: ['elementId', 'qI', 'qJ'], optional: ['a', 'b', 'angle'] },
  pointOnElement: { required: ['elementId', 'a', 'p'], optional: ['px', 'angle'] },
  thermal: { required: ['elementId', 'dtUniform', 'dtGradient'], optional: ['dtGradientY', 'strain'] },
  nodal3d: { required: ['nodeId', 'fx', 'fy', 'fz', 'mx', 'my', 'mz'], optional: ['fromDef', 'carrier'] },
  distributed3d: { required: ['elementId', 'qYI', 'qYJ', 'qZI', 'qZJ'], optional: ['qXI', 'qXJ', 'a', 'b', 'fromDef'] },
  pointOnElement3d: { required: ['elementId', 'a', 'py', 'pz'], optional: ['px', 'mx', 'my', 'mz'] },
  surface3d: { required: ['quadId', 'q'], optional: ['fromDef'] },
  thermalQuad3d: { required: ['quadId', 'dtUniform', 'dtGradient'], optional: [] },
  prestress3d: { required: ['elementId', 'force', 'eI', 'eM', 'eJ'], optional: [] },
  displacement3d: { required: ['nodeId'], optional: ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] },
};

const supportFields: Fields<Support> = {
  required: ['id', 'nodeId'],
  optional: ['kx', 'ky', 'kz', 'krx', 'kry', 'krz', 'dx', 'dy', 'dz', 'drx', 'dry', 'drz', 'angle', 'normalX', 'normalY', 'normalZ', 'dofLocalElementId'],
};

const materialFields: Fields<Material> = {
  required: ['id', 'e', 'nu'],
  optional: ['rho', 'alpha', 'fy', 'fu', 'fc'],
};

export class ModelInputError extends Error {}

export class InvalidModelNumber extends ModelInputError {
  constructor(path: string, value: unknown) {
    super(tp('svc.engine.nonFiniteNumber', { path, value: String(value) }));
  }
}

export function isFiniteInputNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberAt(path: string, value: unknown): void {
  if (!isFiniteInputNumber(value)) throw new InvalidModelNumber(path, value);
}

function recordNumbers(
  path: string, data: object, { required, optional }: { required: readonly string[]; optional: readonly string[] },
): void {
  const record = data as Record<string, unknown>;
  for (const field of required) numberAt(`${path}.${field}`, record[field]);
  for (const field of optional) {
    if (record[field] !== undefined) numberAt(`${path}.${field}`, record[field]);
  }
}

function arrayOf<T>(path: string, value: unknown, check: (path: string, value: T) => void, size?: number): void {
  if (!Array.isArray(value) || (size !== undefined && value.length !== size)) throw new InvalidModelNumber(path, value);
  for (let i = 0; i < value.length; i++) check(`${path}[${i}]`, value[i]!);
}

const vector = (path: string, value: readonly number[]) => arrayOf(path, value, numberAt, 3);
const polygon = (path: string, value: readonly (readonly number[])[]) => arrayOf(path, value, vector);

export function invalidPlanarPointTorsion(mx: unknown): boolean {
  return mx !== undefined && mx !== 0;
}

class InvalidModelInputField extends ModelInputError {
  constructor(path: string) {
    super(tp('svc.engine.invalidInputField', { path }));
  }
}

function requireInputField(path: string, valid: boolean): asserts valid {
  if (!valid) throw new InvalidModelInputField(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoadType(type: unknown): type is Load['type'] {
  return typeof type === 'string' && Object.hasOwn(loadFields, type);
}

function requireLoadSelectors(path: string, type: Load['type'], data: Record<string, unknown>): void {
  if (type === 'distributed' || type === 'pointOnElement') {
    const { isGlobal } = data;
    requireInputField(`${path}.isGlobal`, isGlobal === undefined || typeof isGlobal === 'boolean');
  }
  if (type === 'distributed3d' || type === 'pointOnElement3d' || type === 'surface3d') {
    const { frame } = data;
    requireInputField(`${path}.frame`, frame === undefined || frame === 'local' || frame === 'global'
      || (frame === 'projected' && type !== 'pointOnElement3d'));
  }
  if (type === 'surface3d' || type === 'thermalQuad3d') {
    requireInputField(`${path}.on`, data.on === undefined || data.on === 'plate');
  }
}

export function requireLoadInput(loads: readonly unknown[]): void {
  for (const [i, load] of loads.entries()) {
    const row = `loads[${i}]`;
    requireInputField(`${row}.type`, isRecord(load) && isLoadType(load.type));
    const path = `${row}.data`;
    const { type, data } = load;
    requireInputField(path, isRecord(data));
    requireLoadSelectors(path, type, data);
    recordNumbers(path, data, loadFields[type]);
    recordNumbers(path, data, { required: [], optional: ['id', 'caseId'] });
    if (type === 'pointOnElement') {
      const { mx } = data;
      if (invalidPlanarPointTorsion(mx)) {
        const field = `${path}.mx`;
        numberAt(field, mx);
        throw new ModelInputError(`${t('svc.engine.unsupportedPointLoadMoment')} ${field}: ${t('svc.engine.applyPointLoadMomentAtNode')}`);
      }
    }
    if (type === 'nodal') numberAt(`${path}.fz/fy`, data.fz ?? data.fy);
    if (type === 'surface3d') {
      const { dir, qNodes, vary, region } = data as Partial<Extract<Load, { type: 'surface3d' }>['data']>;
      if (dir !== undefined) vector(`${path}.dir`, dir);
      if (qNodes !== undefined) arrayOf(`${path}.qNodes`, qNodes, numberAt);
      if (vary !== undefined) {
        if (!vary) throw new InvalidModelNumber(`${path}.vary`, vary);
        recordNumbers(`${path}.vary`, vary, { required: ['c1', 'q1', 'c2', 'q2'], optional: [] });
        vector(`${path}.vary.dir`, vary.dir);
      }
      if (region !== undefined) {
        if (!region) throw new InvalidModelNumber(`${path}.region`, region);
        vector(`${path}.region.normal`, region.normal);
        polygon(`${path}.region.points`, region.points);
        if (region.holes !== undefined) arrayOf(`${path}.region.holes`, region.holes, polygon);
      }
    }
  }
}

function loadInputError(loads: readonly unknown[]): ModelInputError | null {
  try {
    requireLoadInput(loads);
    return null;
  } catch (error) {
    if (error instanceof ModelInputError) return error;
    throw error;
  }
}

export function loadInputRefusal(loads: readonly unknown[]): string | null {
  return loadInputError(loads)?.message ?? null;
}

export function hasMalformedAuthoredLoad(loads: readonly unknown[]): boolean {
  const error = loadInputError(loads);
  return error instanceof InvalidModelInputField || error instanceof InvalidModelNumber;
}

function recordAt(path: string, value: unknown): Record<string, unknown> {
  requireInputField(path, isRecord(value));
  return value;
}

function requireKnownFields(path: string, row: Record<string, unknown>, allowed: object): void {
  for (const key of Object.keys(row)) requireInputField(`${path}.${key}`, Object.hasOwn(allowed, key));
}

function optionalValue(path: string, value: unknown, allowed: readonly unknown[]): void {
  requireInputField(path, value === undefined || allowed.includes(value));
}

function booleanAt(path: string, value: unknown): void {
  requireInputField(path, typeof value === 'boolean');
}

function validateSupport(path: string, value: unknown): void {
  const row = recordAt(path, value);
  recordNumbers(path, row, supportFields);
  if (!isSupportType(row.type)) throw new InvalidModelInputField(`${path}.type (${String(row.type)})`);
  optionalValue(`${path}.dofFrame`, row.dofFrame, ['global', 'local']);
  for (const field of ['isGlobal', 'isInclined', 'uplift']) {
    optionalValue(`${path}.${field}`, row[field], [true, false]);
  }
  if (row.dofRestraints !== undefined) {
    const mask = recordAt(`${path}.dofRestraints`, row.dofRestraints);
    for (const field of ['tx', 'ty', 'tz', 'rx', 'ry', 'rz']) {
      booleanAt(`${path}.dofRestraints.${field}`, mask[field]);
    }
  }
  if (row.curves !== undefined) {
    const curves = recordAt(`${path}.curves`, row.curves);
    for (const [axis, curve] of Object.entries(curves)) {
      const field = `${path}.curves.${axis}`;
      requireInputField(field, axis === 'x' || axis === 'y' || axis === 'z');
      if (curve !== undefined) arrayOf(field, curve, (at, pair) => arrayOf(at, pair, numberAt, 2));
    }
  }
}

function validateElement(path: string, value: unknown): void {
  const row = recordAt(path, value);
  recordNumbers(path, row, {
    required: ['id', 'nodeI', 'nodeJ', 'materialId', 'sectionId'],
    optional: ['rollAngle', 'cablePretension'],
  });
  requireInputField(`${path}.type`, row.type === 'frame' || row.type === 'truss');
  optionalValue(`${path}.behaviour`, row.behaviour, ['tensionOnly', 'compressionOnly', 'inactive', 'cable']);
  for (const field of ['hingeStart', 'hingeEnd']) optionalValue(`${path}.${field}`, row[field], [true, false]);
  for (const end of ['I', 'J']) {
    const field = `${path}.release${end}`;
    const release = row[`release${end}`];
    if (release !== undefined) {
      for (const [key, flag] of Object.entries(recordAt(field, release))) {
        const at = `${field}.${key}`;
        if (key === 'slide') optionalValue(at, flag, ['x', 'z']);
        else if (key === 'slideAxis') optionalValue(at, flag, ['global', 'local']);
        else {
          requireInputField(at, key === 'my' || key === 'mz' || key === 't');
          optionalValue(at, flag, [true, false]);
        }
      }
    }
    const joint = row[`joint${end}`];
    if (joint !== undefined) {
      const at = `${path}.joint${end}`;
      arrayOf(`${at}.dof`, recordAt(at, joint).dof, booleanAt, 6);
    }
  }
  const axes = ['localYx', 'localYy', 'localYz'];
  if (axes.some(axis => row[axis] !== undefined)) {
    recordNumbers(path, row, { required: axes, optional: [] });
  }
  if (row.variableSection !== undefined) {
    const at = `${path}.variableSection`;
    recordNumbers(at, recordAt(at, row.variableSection), { required: ['sectionJ'], optional: ['segments'] });
  }
  if (row.stiffness !== undefined) {
    const at = `${path}.stiffness`;
    const stiffness = recordAt(at, row.stiffness);
    recordNumbers(at, stiffness, { required: [], optional: ['a', 'iy', 'iz', 'j'] });
    optionalValue(`${at}.preset`, stiffness.preset, ['column', 'wallUncracked', 'wallCracked', 'beam', 'slab']);
  }
}

function validateSection(path: string, value: unknown): void {
  const row = recordAt(path, value);
  recordNumbers(path, row, {
    required: ['id', 'a', 'iz'],
    optional: ['iy', 'j', 'rotation', 'b', 'h', 'tw', 'tf', 't', 'tl'],
  });
  if (row.shearAreas === undefined) return;
  const at = `${path}.shearAreas`;
  const spec = recordAt(at, row.shearAreas);
  requireInputField(`${at}.basis`, spec.basis === 'geometry' || spec.basis === 'declared');
  if (spec.basis === 'declared') {
    for (const field of ['asY', 'asZ']) {
      const area = spec[field];
      requireInputField(`${at}.${field}`, isFiniteInputNumber(area) && area > 0);
    }
  }
}

const constraintFields = {
  rigidLink: { type: true, masterNode: true, slaveNode: true, dofs: true },
  equalDOF: { type: true, masterNode: true, slaveNode: true, dofs: true },
  diaphragm: { type: true, masterNode: true, slaveNodes: true, plane: true },
  eccentricConnection: {
    type: true, masterNode: true, slaveNode: true, offsetX: true, offsetY: true, offsetZ: true, releases: true,
  },
  linearMPC: { type: true, terms: true },
} satisfies { [K in Constraint3D['type']]: Record<keyof Extract<Constraint3D, { type: K }>, true> };

const mpcTermFields = {
  nodeId: true, dof: true, coefficient: true,
} satisfies Record<keyof LinearMpcConstraint['terms'][number], true>;

const legacyDofNames = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

function constraintDof(path: string, value: unknown, migrate: boolean): number {
  const index = migrate && typeof value === 'string' ? legacyDofNames.indexOf(value) : value;
  requireInputField(path, typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < legacyDofNames.length);
  return index;
}

function readConstraint(path: string, input: unknown, migrate: boolean): Constraint3D {
  const row = recordAt(path, input);
  const type = migrate && row.type === 'equalDof' ? 'equalDOF'
    : migrate && row.type === 'linearMpc' ? 'linearMPC' : row.type;
  requireInputField(`${path}.type`, type === 'rigidLink' || type === 'equalDOF'
    || type === 'diaphragm' || type === 'eccentricConnection' || type === 'linearMPC');
  requireKnownFields(path, row, constraintFields[type]);
  if (type === 'linearMPC') {
    requireInputField(`${path}.terms`, Array.isArray(row.terms) && row.terms.length > 0);
    const terms = row.terms.map((value: unknown, index: number) => {
      const at = `${path}.terms[${index}]`;
      const term = recordAt(at, value);
      requireKnownFields(at, term, mpcTermFields);
      recordNumbers(at, term, { required: ['nodeId', 'coefficient'], optional: [] });
      const dof = constraintDof(`${at}.dof`, term.dof, migrate);
      return { ...term, dof };
    });
    return { ...row, type, terms } as Constraint3D;
  }
  numberAt(`${path}.masterNode`, row.masterNode);
  if (type === 'diaphragm') {
    arrayOf(`${path}.slaveNodes`, row.slaveNodes, numberAt);
    const plane = typeof row.plane === 'string' ? row.plane.toUpperCase() : row.plane;
    optionalValue(`${path}.plane`, plane, ['XY', 'XZ', 'YZ']);
  } else {
    numberAt(`${path}.slaveNode`, row.slaveNode);
  }
  if (type === 'eccentricConnection') {
    recordNumbers(path, row, { required: [], optional: ['offsetX', 'offsetY', 'offsetZ'] });
    if (row.releases !== undefined) arrayOf(`${path}.releases`, row.releases, booleanAt);
  }
  if (type === 'equalDOF' || (type === 'rigidLink' && row.dofs !== undefined)) {
    requireInputField(`${path}.dofs`, Array.isArray(row.dofs));
    const dofs = row.dofs.map((value: unknown, index: number) => constraintDof(`${path}.dofs[${index}]`, value, migrate));
    return { ...row, type, dofs } as Constraint3D;
  }
  if (migrate && type === 'rigidLink' && row.dofs === undefined) {
    const { dofs: _omitted, ...constraint } = row;
    return constraint as unknown as Constraint3D;
  }
  return row as unknown as Constraint3D;
}

export function migrateModelConstraints(constraints: unknown): Constraint3D[] {
  if (constraints === undefined) return [];
  requireInputField('constraints', Array.isArray(constraints));
  return constraints.map((constraint, index) => readConstraint(`constraints[${index}]`, constraint, true));
}

export function requireCombinationInput(combinations: unknown): void {
  arrayOf('combinations', combinations, (path, value) => {
    const combo = recordAt(path, value);
    numberAt(`${path}.id`, combo.id);
    optionalValue(`${path}.method`, combo.method, ['linear', 'srss', 'abs']);
    arrayOf(`${path}.factors`, combo.factors, (at, factor) => {
      recordNumbers(at, recordAt(at, factor), { required: ['caseId', 'factor'], optional: [] });
    });
  });
}

const analysisFields = {
  selfWeight: true, standaloneSelfWeight: true, combinationMethod: true, perCombination: true,
  shearDeformation: true, beamTorsion: true,
} satisfies Record<keyof AnalysisSettings, true>;

const selfWeightFields = {
  caseId: true, direction: true, factor: true, elements: true, groupId: true,
} satisfies Record<keyof SelfWeightLoad, true>;

function requireAnalysisInput(value: unknown): void {
  if (value === undefined) return;
  const analysis = recordAt('analysis', value);
  requireKnownFields('analysis', analysis, analysisFields);
  optionalValue('analysis.combinationMethod', analysis.combinationMethod, ['solveEach', 'superpose']);
  optionalValue('analysis.perCombination', analysis.perCombination, ['linear', 'pdelta']);
  optionalValue('analysis.shearDeformation', analysis.shearDeformation, ['none']);
  optionalValue('analysis.standaloneSelfWeight', analysis.standaloneSelfWeight, ['gravity']);
  recordNumbers('analysis', analysis, { required: [], optional: ['beamTorsion'] });
  if (analysis.selfWeight === undefined) return;
  arrayOf('analysis.selfWeight', analysis.selfWeight, (path, value) => {
    const weight = recordAt(path, value);
    requireKnownFields(path, weight, selfWeightFields);
    recordNumbers(path, weight, { required: ['caseId', 'factor'], optional: ['groupId'] });
    requireInputField(`${path}.direction`, weight.direction === 'X' || weight.direction === 'Y' || weight.direction === 'Z');
    if (weight.elements !== undefined) arrayOf(`${path}.elements`, weight.elements, numberAt);
  });
}

type ModelRows = Iterable<readonly [number, unknown]>;

export function requireStructureInput(model: {
  nodes: ModelRows;
  elements: ModelRows;
  supports: ModelRows;
  materials: ModelRows;
  sections: ModelRows;
  connectors?: ModelRows;
  analysis?: unknown;
}): void {
  for (const [id, node] of model.nodes) {
    const path = `nodes.${id}`;
    recordNumbers(path, recordAt(path, node), { required: ['id', 'x', 'y'], optional: ['z'] });
  }
  for (const [id, element] of model.elements) validateElement(`elements.${id}`, element);
  for (const [id, support] of model.supports) validateSupport(`supports.${id}`, support);
  for (const [id, section] of model.sections) validateSection(`sections.${id}`, section);
  for (const [id, material] of model.materials) {
    const path = `materials.${id}`;
    recordNumbers(path, recordAt(path, material), materialFields);
  }
  for (const [id, connector] of model.connectors ?? []) {
    const path = `connectors.${id}`;
    recordNumbers(path, recordAt(path, connector), {
      required: ['id', 'nodeI', 'nodeJ'], optional: ['kAxial', 'kShear', 'kMoment', 'kShearZ', 'kBendY', 'kBendZ'],
    });
  }
  requireAnalysisInput(model.analysis);
}

export function requireModelInput(model: ModelData): void {
  requireLoadInput(model.loads);
  requireStructureInput(model);
  if (model.constraints !== undefined) {
    arrayOf('constraints', model.constraints, (path, constraint) => readConstraint(path, constraint, false));
  }
}

export function modelInputRefusal(model: ModelData): string | null {
  try {
    requireModelInput(model);
    return null;
  } catch (error) {
    if (error instanceof ModelInputError) return error.message;
    throw error;
  }
}
