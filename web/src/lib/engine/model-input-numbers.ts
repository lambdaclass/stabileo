import { t, tp } from '../i18n';
import { isDrawPlane } from '../geometry/plane-projection';
import type { Element, Load, LoadCombination, Material, Support } from '../store/model.svelte';
import { isSupportType } from '../model/support-types';
import type { Constraint3D, LinearMpcConstraint } from './types-3d';
import type { AnalysisSettings, SelfWeightLoad } from './analysis-settings';
import type { StiffnessModifiers } from './member-behaviour';
import type { ModelData } from './solver-service';

type NumberKeys<T> = { [K in keyof T]-?: Exclude<T[K], undefined> extends number ? K : never }[keyof T] & string;
type Fields<T> = {
  required: readonly NumberKeys<T>[];
  optional: readonly NumberKeys<T>[];
};

type LoadFields<T> = Fields<T> & { basicProjection?: Fields<T> };

const loadFields: { [K in Load['type']]: LoadFields<Extract<Load, { type: K }>['data']> } = {
  nodal: {
    required: ['nodeId'], optional: [],
    basicProjection: { required: ['fx'], optional: ['fz', 'fy'] },
  },
  distributed: { required: ['elementId', 'qI', 'qJ'], optional: ['a', 'b', 'angle'] },
  pointOnElement: { required: ['elementId', 'a', 'p'], optional: ['px', 'angle'] },
  thermal: { required: ['elementId', 'dtUniform', 'dtGradient'], optional: ['dtGradientY', 'strain'] },
  nodal3d: {
    required: ['nodeId'], optional: [],
    basicProjection: { required: ['fx', 'fy', 'fz', 'mx', 'my', 'mz'], optional: ['fromDef', 'carrier'] },
  },
  distributed3d: {
    required: ['elementId'], optional: [],
    basicProjection: { required: ['qYI', 'qYJ', 'qZI', 'qZJ'], optional: ['qXI', 'qXJ', 'a', 'b', 'fromDef'] },
  },
  pointOnElement3d: { required: ['elementId', 'a', 'py', 'pz'], optional: ['px', 'mx', 'my', 'mz'] },
  surface3d: { required: ['quadId', 'q'], optional: ['fromDef'] },
  thermalQuad3d: { required: ['quadId', 'dtUniform', 'dtGradient'], optional: [] },
  prestress3d: { required: ['elementId', 'force', 'eI', 'eM', 'eJ'], optional: [] },
  displacement3d: { required: ['nodeId'], optional: ['dx', 'dy', 'dz', 'drx', 'dry', 'drz'] },
};

const commonLoadFields = { id: 'optional', caseId: 'optional', generatedBy: 'field', seismicGeneration: 'field' } as const;
type InputField = 'required' | 'optional' | 'field';
type LoadData<K extends Load['type']> = Extract<Load, { type: K }>['data'];
type LoadMetadataKeys<K extends Load['type']> = Exclude<
  Extract<keyof LoadData<K>, string>, NumberKeys<LoadData<K>> | keyof typeof commonLoadFields
>;

const loadMetadataFields = {
  nodal: { my: true, mz: true },
  distributed: { isGlobal: true },
  pointOnElement: { my: true, mz: true, mx: true, enteredZeroMoment: true, isGlobal: true },
  thermal: {},
  nodal3d: {},
  distributed3d: { frame: true },
  pointOnElement3d: { frame: true },
  surface3d: { dir: true, qNodes: true, vary: true, region: true, frame: true, on: true },
  thermalQuad3d: { on: true },
  prestress3d: {},
  displacement3d: {},
} satisfies { [K in Load['type']]: Record<
  LoadMetadataKeys<K> | (K extends 'nodal' ? 'my' | 'mz' : never) | (K extends 'pointOnElement' ? 'my' | 'mz' | 'mx' : never), true
> };

const loadRecordFields = { type: true, data: true } satisfies Record<keyof Load, true>;

const supportFields = {
  id: 'required', nodeId: 'required', type: 'field', uplift: 'field', curves: 'field',
  kx: 'optional', ky: 'optional', kz: 'optional', krx: 'optional', kry: 'optional', krz: 'optional',
  dx: 'optional', dy: 'optional', dz: 'optional', drx: 'optional', dry: 'optional', drz: 'optional',
  angle: 'optional', normalX: 'optional', normalY: 'optional', normalZ: 'optional',
  isGlobal: 'field', isInclined: 'field', dofRestraints: 'field', dofFrame: 'field', dofLocalElementId: 'optional',
} satisfies Record<keyof Support, InputField>;

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

function numberAt(path: string, value: unknown): asserts value is number {
  if (!isFiniteInputNumber(value)) throw new InvalidModelNumber(path, value);
}

type NumericFieldNames = { required: readonly string[]; optional: readonly string[] };

function recordNumbers(path: string, data: object, { required, optional }: NumericFieldNames): void {
  const record = data as Record<string, unknown>;
  for (const field of required) numberAt(`${path}.${field}`, record[field]);
  for (const field of optional) {
    if (record[field] !== undefined) numberAt(`${path}.${field}`, record[field]);
  }
}

function requireNumericFields(path: string, row: Record<string, unknown>, fields: Record<string, InputField>): void {
  for (const [field, rule] of Object.entries(fields)) {
    if (rule === 'required' || (rule === 'optional' && row[field] !== undefined)) {
      numberAt(`${path}.${field}`, row[field]);
    }
  }
}

export function invalidPlanarNodalMomentField(data: Readonly<Record<string, unknown>>): 'my' | 'mz' | undefined {
  return (['my', 'mz'] as const).find(field => data[field] !== undefined && !isFiniteInputNumber(data[field]));
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

function requireInputField(path: string, valid: boolean): asserts valid {
  if (!valid) throw new ModelInputError(tp('svc.engine.invalidInputField', { path }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLoadType(type: unknown): type is Load['type'] {
  return typeof type === 'string' && Object.hasOwn(loadFields, type);
}

function requireLoadSelectors(path: string, type: Load['type'], data: Record<string, unknown>): void {
  const { isGlobal, frame, on } = data;
  const planarMember = type === 'distributed' || type === 'pointOnElement';
  const spatialFrame = type === 'distributed3d' || type === 'pointOnElement3d' || type === 'surface3d';
  const shellTarget = type === 'surface3d' || type === 'thermalQuad3d';
  requireInputField(`${path}.isGlobal`, isGlobal === undefined || (planarMember && typeof isGlobal === 'boolean'));
  requireInputField(`${path}.frame`, frame === undefined || (spatialFrame && (frame === 'local' || frame === 'global'
    || (frame === 'projected' && type !== 'pointOnElement3d'))));
  requireInputField(`${path}.on`, on === undefined || (shellTarget && on === 'plate'));
}

function requireLoadRecord(load: unknown, i: number) {
  const row = `loads[${i}]`;
  requireInputField(`${row}.type`, isRecord(load) && isLoadType(load.type));
  requireKnownFields(row, load, loadRecordFields);
  const path = `${row}.data`;
  const { type, data } = load;
  requireInputField(path, isRecord(data));
  requireLoadSelectors(path, type, data);
  const fields: NumericFieldNames & { basicProjection?: NumericFieldNames } = loadFields[type];
  for (const key of Object.keys(data)) {
    const allowed = Object.hasOwn(commonLoadFields, key) || Object.hasOwn(loadMetadataFields[type], key)
      || fields.required.includes(key) || fields.optional.includes(key)
      || fields.basicProjection?.required.includes(key) || fields.basicProjection?.optional.includes(key);
    requireInputField(`${path}.${key}`, allowed === true);
  }
  return { path, type, data };
}

function requireProjectionNumbers({ path, type, data }: ReturnType<typeof requireLoadRecord>): void {
  const fields = loadFields[type].basicProjection;
  if (fields) recordNumbers(path, data, fields);
  if (type === 'nodal') requirePlanarNodalMoment(path, data);
  if (type === 'nodal') numberAt(`${path}.fz/fy`, data.fz ?? data.fy);
}

function requirePlanarNodalMoment(path: string, data: Record<string, unknown>): void {
  const invalidMoment = invalidPlanarNodalMomentField(data);
  if (invalidMoment !== undefined) throw new InvalidModelNumber(`${path}.${invalidMoment}`, data[invalidMoment]);
}

export function requireLoadCollection(loads: unknown): asserts loads is readonly unknown[] {
  requireInputField('loads', Array.isArray(loads));
}

export function requireLoadInput(loads: unknown): void {
  requireLoadCollection(loads);
  for (const [i, load] of loads.entries()) {
    const row = requireLoadRecord(load, i);
    const { path, type, data } = row;
    requireNumericFields(path, data, commonLoadFields);
    recordNumbers(path, data, loadFields[type]);
    requireProjectionNumbers(row);
    if (type === 'pointOnElement') {
      const { mx } = data;
      if (invalidPlanarPointTorsion(mx)) {
        const field = `${path}.mx`;
        numberAt(field, mx);
        throw new ModelInputError(`${t('svc.engine.unsupportedPointLoadMoment')} ${field}: ${t('svc.engine.applyPointLoadMomentAtNode')}`);
      }
    }
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

function modelInputError(check: () => void): ModelInputError | null {
  try {
    check();
    return null;
  } catch (error) {
    if (error instanceof ModelInputError) return error;
    throw error;
  }
}

export function loadInputRefusal(loads: unknown): string | null {
  return modelInputError(() => requireLoadInput(loads))?.message ?? null;
}

export function hasMalformedAuthoredLoad(loads: unknown, basicProjection: boolean): boolean {
  if (loads === undefined) return false;
  return modelInputError(() => {
    requireLoadCollection(loads);
    for (const [i, load] of loads.entries()) {
      const row = requireLoadRecord(load, i);
      const fields = loadFields[row.type];
      if (basicProjection && fields.basicProjection) recordNumbers(row.path, row.data, fields);
      if (basicProjection) requireProjectionNumbers(row);
      else if (row.type === 'nodal') requirePlanarNodalMoment(row.path, row.data);
    }
  }) !== null;
}

function recordAt(path: string, value: unknown): Record<string, unknown> {
  requireInputField(path, isRecord(value));
  return value;
}

function requireKnownFields(path: string, row: Record<string, unknown>, allowed: object, common?: object): void {
  for (const key of Object.keys(row)) {
    requireInputField(`${path}.${key}`, Object.hasOwn(allowed, key) || (common !== undefined && Object.hasOwn(common, key)));
  }
}

function optionalValue(path: string, value: unknown, allowed: readonly unknown[]): void {
  requireInputField(path, value === undefined || allowed.includes(value));
}

function booleanAt(path: string, value: unknown): void {
  requireInputField(path, typeof value === 'boolean');
}

function validateSupport(path: string, value: unknown): void {
  const row = recordAt(path, value);
  requireKnownFields(path, row, supportFields);
  requireNumericFields(path, row, supportFields);
  requireInputField(`${path}.type (${String(row.type)})`, isSupportType(row.type));
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

const stiffnessFields = {
  a: 'optional', iy: 'optional', iz: 'optional', j: 'optional', preset: 'field',
} satisfies Record<keyof StiffnessModifiers, InputField>;

const elementFields = {
  id: true, name: true, type: true, nodeI: true, nodeJ: true, materialId: true, sectionId: true,
  releaseI: true, releaseJ: true, jointI: true, jointJ: true, hingeStart: true, hingeEnd: true,
  localYx: true, localYy: true, localYz: true, rollAngle: true, offset: true, variableSection: true,
  behaviour: true, cablePretension: true, stiffness: true, semiRigid: true, arc: true, keptOver: true,
  reinforcement: true, unbracedLength: true, kStrong: true, kWeak: true, tensionConnection: true,
  angleCompression: true, bracing: true, steelLoadHeight: true, composite: true,
} satisfies Record<keyof Element | 'hingeStart' | 'hingeEnd', true>;

export function requireAuthoredMemberKeys(path: string, value: unknown): Record<string, unknown> {
  const row = recordAt(path, value);
  requireKnownFields(path, row, elementFields);
  return row;
}

function validateElement(path: string, value: unknown): void {
  const row = requireAuthoredMemberKeys(path, value);
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
    requireKnownFields(at, stiffness, stiffnessFields);
    requireNumericFields(at, stiffness, stiffnessFields);
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

export function requireEccentricReleaseMask(path: string, value: unknown): void {
  if (value === undefined) return;
  requireInputField(path, Array.isArray(value) && value.length <= legacyDofNames.length);
  arrayOf(path, value, booleanAt);
}

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
    requireEccentricReleaseMask(`${path}.releases`, row.releases);
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

const combinationFields = {
  id: true, name: true, factors: true, method: true, origin: true, nameTyped: true,
} satisfies Record<keyof LoadCombination, true>;

const combinationFactorFields = {
  caseId: true, factor: true,
} satisfies Record<keyof LoadCombination['factors'][number], true>;

export function requireCombinationInput(combinations: unknown): void {
  const ids = new Set<number>();
  arrayOf('combinations', combinations, (path, value) => {
    const combo = recordAt(path, value);
    requireKnownFields(path, combo, combinationFields);
    const idPath = `${path}.id`;
    const { id } = combo;
    numberAt(idPath, id);
    requireInputField(idPath, !ids.has(id));
    ids.add(id);
    optionalValue(`${path}.method`, combo.method, ['linear', 'srss', 'abs']);
    arrayOf(`${path}.factors`, combo.factors, (at, factor) => {
      const row = recordAt(at, factor);
      requireKnownFields(at, row, combinationFactorFields);
      recordNumbers(at, row, { required: ['caseId', 'factor'], optional: [] });
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

export function fixtureRows(path: string, value: unknown): ModelRows {
  requireInputField(path, Array.isArray(value));
  return Array.from(value, (entry: unknown, index) => {
    const at = `${path}[${index}]`;
    const row = recordAt(at, entry);
    const { id } = row;
    if (!isFiniteInputNumber(id)) throw new InvalidModelNumber(`${at}.id`, id);
    return [id, row] as const;
  });
}

const storedStructuralTables = [
  'nodes', 'elements', 'supports', 'materials', 'sections', 'connectors', 'plates', 'quads', 'groups', 'footings',
] as const;
type StoredStructuralTable = typeof storedStructuralTables[number];

function requireUniqueStoredKeys(path: StoredStructuralTable, rows: unknown, keyOf: (row: unknown) => unknown): void {
  if (!Array.isArray(rows)) return;
  const keys = new Set<unknown>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === undefined) continue;
    requireInputField(typeof key === 'number' ? `${path}.${key}` : path, !keys.has(key));
    keys.add(key);
  }
}

export function dependsOnXYConstraintAxes(constraint: Constraint3D): boolean {
  const differs = (dof: number) => dof === 1 || dof === 2 || dof === 4 || dof === 5;
  switch (constraint.type) {
    case 'linearMPC': return constraint.terms.some(term => term.coefficient !== 0 && differs(term.dof));
    case 'rigidLink':
    case 'equalDOF': return constraint.dofs?.some(differs) ?? false;
    case 'diaphragm': return constraint.plane !== 'YZ';
    case 'eccentricConnection': {
      const { offsetY, offsetZ, releases } = constraint;
      return (offsetY ?? 0) !== 0 || (offsetZ ?? 0) !== 0
        || (releases?.[1] ?? false) !== (releases?.[2] ?? false)
        || (releases?.[4] ?? false) !== (releases?.[5] ?? false);
    }
  }
}

export function requireStoredProjectInput(
  snapshot: { drawPlane2D?: unknown; analysisMode?: unknown; constraints?: unknown }
    & Partial<Record<StoredStructuralTable, unknown>>,
): void {
  requireInputField('drawPlane2D', snapshot.drawPlane2D === undefined || isDrawPlane(snapshot.drawPlane2D));
  for (const table of storedStructuralTables) {
    requireUniqueStoredKeys(table, snapshot[table], row => Array.isArray(row) ? row[0] : undefined);
  }
  requireUniqueStoredKeys('footings', snapshot.footings, row => {
    const footing: unknown = Array.isArray(row) ? row[1] : row;
    return isRecord(footing) ? footing.id : undefined;
  });
  if (snapshot.drawPlane2D === undefined && (snapshot.analysisMode === '2d' || snapshot.analysisMode === 'edu')) {
    const index = migrateModelConstraints(snapshot.constraints).findIndex(dependsOnXYConstraintAxes);
    requireInputField(`constraints[${index}]`, index === -1);
  }
}

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

function requireModelNumbers(model: ModelData): void {
  requireLoadInput(model.loads);
  requireStructureInput(model);
  if (model.constraints !== undefined) {
    arrayOf('constraints', model.constraints, (path, constraint) => readConstraint(path, constraint, false));
  }
}

function modelNumberRefusal(model: ModelData): string | null {
  return modelInputError(() => requireModelNumbers(model))?.message ?? null;
}

export { requireModelNumbers as requireModelInput, modelNumberRefusal as modelInputRefusal };
