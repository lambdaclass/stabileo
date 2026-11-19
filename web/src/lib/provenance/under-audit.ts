import type { AutoLoadFocus } from '../../components/pro/auto-loads-sections';
import type { PlannedCase } from '../engine/loads/load-plan';
import type { MemberFamily } from '../report/memoria/types';
import type { DeskTab } from '../store/design-desk-ui.svelte';
import { fromLoadPlan } from './model-features';

export const UNDER_AUDIT_URL = 'https://github.com/lambdaclass/stabileo/blob/main/docs/under-audit.md';

export const AUDIT_FEATURES = {
  wind: true,
  snow: true,
  gravity: true,
  live: true,
  seismic: true,
  'floor-regions': true,
  'rc-design': true,
  'rc-detailing': true,
  'rc-seismic': true,
  'rc-sheets': true,
  thermal: false,
  soil: false,
  fluid: false,
  steel: false,
  'linear-analysis': false,
} as const;
export type AuditFeature = keyof typeof AUDIT_FEATURES;

export const LOAD_AUDIT_FEATURES = {
  D: 'gravity', L: 'live', Lr: 'live', S: 'snow', W: 'wind', Wa: 'wind', E: 'seismic',
  T: 'thermal', H: 'soil', F: 'fluid',
} as const satisfies Record<PlannedCase['type'], AuditFeature>;

export const AUTO_LOAD_AUDIT_FEATURES = {
  dead: 'gravity', live: 'live', roof: 'gravity', wind: 'wind', snow: 'snow', seismic: 'seismic',
  special: null, combos: null,
} as const satisfies Record<AutoLoadFocus, AuditFeature | null>;

export const DESIGN_AUDIT_FEATURES = {
  prepare: null, designData: null, plan: 'rc-design', frame: 'rc-design', column: 'rc-design',
  wall: 'rc-design', slab: 'rc-design', joist: 'rc-design', footing: 'rc-design', seismic: 'rc-seismic',
  joint: 'rc-design', levels: 'rc-design', list: 'rc-design', steel: null, connections: null,
  report: 'rc-design', geometry: null, materials: null, special: 'rc-design', stairs: 'rc-design',
  pt: 'rc-design', elements: 'rc-design', fire: 'rc-design', codes: null, detailing: 'rc-detailing',
  budget: null, collab: null, arch: null, site: null, sheets: 'rc-sheets', listings: 'rc-detailing', documents: 'rc-detailing',
} as const satisfies Record<DeskTab, AuditFeature | null>;

export const MEMBER_AUDIT_FEATURES = {
  beam: 'rc-design', column: 'rc-design', wall: 'rc-design', slab: 'rc-design', footing: 'rc-design',
  joint: 'rc-design', seismic: 'rc-seismic', steel: null, connection: null, timber: null,
  aluminium: null, coldFormed: null, composite: null, masonry: null, fire: 'rc-design',
} as const satisfies Record<MemberFamily, AuditFeature | null>;

export function underAudit(features: readonly (AuditFeature | null)[]): boolean {
  return features.some((feature) => feature !== null && AUDIT_FEATURES[feature]);
}

interface AuditModel {
  loads?: readonly { data: { generatedBy?: string; caseId?: number; fromDef?: number } }[];
  loadCases?: readonly { id: number; type?: string }[];
  groups?: Map<number, { kind?: string }> | readonly [number, { kind?: string }][];
  designData?: { loadBasis?: unknown };
}

export function modelAuditFeatures(model: AuditModel): AuditFeature[] {
  const features = new Set<AuditFeature>();
  const cases = new Map(model.loadCases?.map((c) => [c.id, c.type]));
  if (model.designData?.loadBasis) {
    for (const type of cases.values()) {
      if (type && Object.hasOwn(LOAD_AUDIT_FEATURES, type)) features.add(LOAD_AUDIT_FEATURES[type as PlannedCase['type']]);
    }
  }
  for (const load of model.loads ?? []) {
    if (!fromLoadPlan(load.data.generatedBy)) continue;
    const type = cases.get(load.data.caseId ?? 1);
    if (type && Object.hasOwn(LOAD_AUDIT_FEATURES, type)) features.add(LOAD_AUDIT_FEATURES[type as PlannedCase['type']]);
    else for (const feature of Object.values(AUTO_LOAD_AUDIT_FEATURES)) if (feature) features.add(feature);
  }
  const groups = model.groups instanceof Map ? model.groups.values() : model.groups?.map(([, group]) => group) ?? [];
  if ([...groups].some((g) => g.kind === 'floorLoad')) features.add('floor-regions');
  return [...features];
}
