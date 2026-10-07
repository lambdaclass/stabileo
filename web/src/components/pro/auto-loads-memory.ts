/**
 * What the load generator dialog starts from each time it opens: the parameters the project saved
 * for each role (`recordRoleConfiguration` in `ProAutoLoadsDialog`), over the bound code's own
 * defaults, over the app's.
 *
 * Two defects of the restore this replaces:
 *
 *  · It assigned the saved objects themselves — the dead rows, the roof, the special loads, the
 *    wind directions and service wind, the seismic method — into the dialog's state. They are
 *    state proxies inside `modelStore.model.regulations`, Svelte keeps a proxy it is given, so the
 *    dialog and the project held the same object: a typed dead row or soil surcharge changed the
 *    project with no Apply and no undo, Cancel kept it, and after a binding change it wrote into
 *    another code's archived settings. Everything here is a copy.
 *  · With nothing saved it reset only the speed, exposure and enclosure, and the zone, site and
 *    group, to the code's defaults; every other section kept what was in memory, from an earlier
 *    opening or from another project opened in the same session. Every value is here, so a role
 *    with nothing saved starts from the defaults whole.
 */
import { DEFAULT_WIND_DYNAMICS, type WindDynamics } from '../../lib/engine/loads/wind-dynamics';
import { WIND_DIRECTIONS, type WindCaseSet, type WindDirection } from '../../lib/engine/loads/wind-cases';
import { defaultSnowConfig, type SnowConfig } from '../../lib/engine/loads/snow-config';
import { loadCodeFor } from '../../lib/codes/families';
import type { ProjectRegulations, RegulationRole } from '../../lib/codes/roles';
import type { ElementKind } from '../../lib/codes/cirsoc101/live-loads';
import type { Enclosure, Exposure, ServiceRecurrence } from '../../lib/codes/cirsoc102/wind';
import type { SeismicZone, SiteClass, DestinationGroup, OccupancyProbability } from '../../lib/codes/cirsoc103/spectrum';
import type { PeriodSystem, PlanRegularity } from '../../lib/codes/cirsoc103/static-method';
import {
  defaultRoofConfig, defaultSeismicMethod, defaultSpecialLoads, defaultWindStructure,
  type ComboSource, type DeadRow, type GravityMode, type RoofConfig, type SeismicMethodConfig,
  type SpecialLoadsConfig, type WindStructureConfig,
} from './auto-loads-sections';

/** Every value of the dialog a reopening sets. */
export interface AutoLoadsMemory {
  genCombos: boolean;
  comboSet: 'ultimate' | 'service' | 'both';
  comboSource: ComboSource;
  bothSenses: boolean;
  patternsInCompanions: boolean;
  selectedOccupancy: string;
  tributaryWidth: number;
  applyLiveReduction: boolean;
  reductionElementKind: ElementKind;
  floorsSupported: number;
  deadRows: DeadRow[];
  gravityMode: GravityMode;
  gravitySlab: 'twoWay' | 'oneWay';
  gravitySpan: 'x' | 'y';
  roofCfg: RoofConfig;
  livePatterns: 'none' | 'checkerboard' | 'all';
  special: SpecialLoadsConfig;
  enableWind: boolean;
  windV: number;
  windExposure: Exposure;
  windEnclosure: Enclosure;
  windAltitude: number;
  windKzt: number;
  windKztSurveyed: boolean;
  windRoofSlope: number;
  windDyn: WindDynamics;
  windDirs: WindDirection[];
  windCaseSet: WindCaseSet;
  windService: { enabled: boolean; v50: number; mri: ServiceRecurrence };
  windStructure: WindStructureConfig;
  snowCfg: SnowConfig;
  enableSeismic: boolean;
  seismicZone: SeismicZone;
  siteClass: SiteClass;
  destinationGroup: DestinationGroup;
  systemKey: string;
  periodSystem: PeriodSystem;
  regularity: PlanRegularity;
  seismicOccupancy: OccupancyProbability;
  elasticDesign: boolean;
  seismicMethod: SeismicMethodConfig;
  seismicDirectionX: boolean;
  seismicDirectionZ: boolean;
}

/*
 * The dead load's default is a real build-up rather than an empty list, because an empty one is a
 * dialog that cannot produce a dead load until the reader has read a table they have not opened
 * yet: 8 cm of cement screed, a ceramic tile, a suspended ceiling, and a plasterboard partition
 * allowance. Every one of those four is a Tabla 3.1 row, and each can be removed.
 */
const defaultDeadRows = (): DeadRow[] => [
  { entryKey: 'contrapiso_cemento', thickness: 0.08, onBattens: false, q: 0, isPartition: false },
  { entryKey: 'piso_baldosa_ceramica', thickness: 0, onBattens: false, q: 0, isPartition: false },
  { entryKey: 'cielo_acustico', thickness: 0, onBattens: false, q: 0, isPartition: false },
  { entryKey: 'tab_yeso_doble', thickness: 0, onBattens: false, q: 0, isPartition: true },
];

/**
 * The dialog with nothing saved: the app's defaults, and the bound wind and seismic codes' own
 * starting values (`codes/families`) in place of the app's where the code has them. Wind and
 * seismic start off: they need a bound regulation, and a dialog that started with them on would
 * block every fresh project's preview.
 */
export function autoLoadsDefaults(roles?: Partial<ProjectRegulations>): AutoLoadsMemory {
  const windCode = loadCodeFor(roles?.wind?.adapterId);
  const seismicCode = loadCodeFor(roles?.seismic?.adapterId);
  const wind = windCode?.role === 'wind' ? windCode.defaults : null;
  const seismic = seismicCode?.role === 'seismic' ? seismicCode.defaults : null;
  return {
    genCombos: true, comboSet: 'ultimate', comboSource: 'regulation', bothSenses: true, patternsInCompanions: false,
    selectedOccupancy: 'vivienda', tributaryWidth: 3.0, applyLiveReduction: true, reductionElementKind: 'interiorBeam', floorsSupported: 1,
    deadRows: defaultDeadRows(), gravityMode: 'panels', gravitySlab: 'twoWay', gravitySpan: 'x',
    roofCfg: defaultRoofConfig(), livePatterns: 'all', special: defaultSpecialLoads(),
    enableWind: false,
    windV: wind?.basicSpeed ?? 45, windExposure: (wind?.exposure ?? 'B') as Exposure, windEnclosure: (wind?.enclosure ?? 'enclosed') as Enclosure,
    windAltitude: 0, windKzt: 1, windKztSurveyed: false, windRoofSlope: 0,
    windDyn: { ...DEFAULT_WIND_DYNAMICS },
    windDirs: [...WIND_DIRECTIONS], windCaseSet: 'all', windService: { enabled: false, v50: 0, mri: 10 },
    windStructure: defaultWindStructure(),
    snowCfg: defaultSnowConfig(),
    enableSeismic: false,
    seismicZone: (seismic?.zone ?? 4) as SeismicZone, siteClass: (seismic?.site ?? 'SD') as SiteClass,
    destinationGroup: (seismic?.group ?? 'B') as DestinationGroup,
    systemKey: 'rc_frame_full_ductility', periodSystem: 'concreteMomentFrame', regularity: 'regular',
    seismicOccupancy: 'reduced', elasticDesign: false,
    seismicMethod: defaultSeismicMethod(), seismicDirectionX: true, seismicDirectionZ: true,
  };
}

/**
 * A deep copy of saved settings, which are plain data. Not `structuredClone`, which refuses the
 * state proxies the model holds; and plain code, so the copy is the same wherever this runs.
 */
function copyOf<T>(v: T): T {
  if (Array.isArray(v)) return v.map(copyOf) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = copyOf(x);
    return out as T;
  }
  return v;
}

/**
 * The dialog as the project left it. A role never configured keeps the defaults; each saved value
 * is taken only when it is there, so an older project restores what it has. `available`: whether
 * wind and seismic are bound, which a saved role needs to come back on.
 */
export function autoLoadsMemory(roles: ProjectRegulations, available: { wind: boolean; seismic: boolean }): AutoLoadsMemory {
  // A copy, never the project's own objects: the dialog edits what it is given in place.
  const regs = copyOf(roles);
  const m = autoLoadsDefaults(regs);
  type Rec = Record<string, any>;
  const set = (role: RegulationRole): Rec | null => {
    const b = regs[role];
    return b?.adapterId && b.settings && Object.keys(b.settings).length ? (b.settings as Rec) : null;
  };
  const basis = set('basis');
  if (basis) {
    if (typeof basis.generateCombinations === 'boolean') m.genCombos = basis.generateCombinations;
    const d = basis.dialog as Rec | undefined;
    if (d?.comboSet) m.comboSet = d.comboSet;
    if (d?.comboSource) m.comboSource = d.comboSource;
    if (typeof d?.bothSenses === 'boolean') m.bothSenses = d.bothSenses;
    if (typeof d?.patternsInCompanions === 'boolean') m.patternsInCompanions = d.patternsInCompanions;
  }
  const loads = set('loads');
  if (loads) {
    if (typeof loads.occupancyKey === 'string') m.selectedOccupancy = loads.occupancyKey;
    if (typeof loads.tributaryWidth === 'number') m.tributaryWidth = loads.tributaryWidth;
    if (typeof loads.applyLiveReduction === 'boolean') m.applyLiveReduction = loads.applyLiveReduction;
    if (typeof loads.reductionElementKind === 'string') m.reductionElementKind = loads.reductionElementKind as ElementKind;
    if (typeof loads.floorsSupported === 'number') m.floorsSupported = loads.floorsSupported;
    const d = loads.dialog as Rec | undefined;
    if (d?.deadRows) m.deadRows = d.deadRows;
    if (d?.gravityMode) m.gravityMode = d.gravityMode;
    if (d?.gravitySlab) m.gravitySlab = d.gravitySlab;
    if (d?.gravitySpan) m.gravitySpan = d.gravitySpan;
    if (d?.roofCfg) m.roofCfg = d.roofCfg;
    if (d?.livePatterns) m.livePatterns = d.livePatterns;
    if (d?.special) m.special = d.special;
  }
  const wind = set('wind');
  if (wind && typeof wind.basicSpeed === 'number') {
    m.windV = wind.basicSpeed;
    if (wind.exposure) m.windExposure = wind.exposure;
    if (wind.enclosure) m.windEnclosure = wind.enclosure;
    if (typeof wind.siteAltitudeM === 'number') m.windAltitude = wind.siteAltitudeM;
    if (typeof wind.kzt === 'number') m.windKzt = wind.kzt;
    if (typeof wind.kztSurveyed === 'boolean') m.windKztSurveyed = wind.kztSurveyed;
    if (typeof wind.roofSlopeDeg === 'number') m.windRoofSlope = wind.roofSlopeDeg;
    // An older project said "rigid" with a checkbox: that is a declared-rigid frequency source.
    if (wind.dynamics) m.windDyn = { ...DEFAULT_WIND_DYNAMICS, ...wind.dynamics };
    else if (typeof wind.rigid === 'boolean') m.windDyn = { ...DEFAULT_WIND_DYNAMICS, n1Source: wind.rigid ? 'declaredRigid' : 'typed' };
    const d = wind.dialog as Rec | undefined;
    if (d?.windDirs) m.windDirs = d.windDirs;
    if (d?.windCaseSet) m.windCaseSet = d.windCaseSet;
    if (d?.windService) m.windService = d.windService;
    if (d?.windStructure) m.windStructure = d.windStructure;
    m.enableWind = available.wind;
  }
  const snow = set('snow');
  if (snow && typeof snow.enabled === 'boolean') m.snowCfg = { ...defaultSnowConfig(), ...snow } as SnowConfig;
  const seismic = set('seismic');
  if (seismic && seismic.zone !== undefined) {
    m.seismicZone = seismic.zone;
    if (seismic.site) m.siteClass = seismic.site;
    if (seismic.destinationGroup) m.destinationGroup = seismic.destinationGroup;
    if (seismic.systemKey) m.systemKey = seismic.systemKey;
    if (seismic.periodSystem) m.periodSystem = seismic.periodSystem;
    if (seismic.regularity) m.regularity = seismic.regularity;
    if (seismic.occupancy) m.seismicOccupancy = seismic.occupancy;
    if (typeof seismic.elastic === 'boolean') m.elasticDesign = seismic.elastic;
    const d = seismic.dialog as Rec | undefined;
    if (d?.seismicMethod) m.seismicMethod = d.seismicMethod;
    if (typeof d?.seismicDirectionX === 'boolean') m.seismicDirectionX = d.seismicDirectionX;
    if (typeof d?.seismicDirectionZ === 'boolean') m.seismicDirectionZ = d.seismicDirectionZ;
    m.enableSeismic = available.seismic;
  }
  return m;
}
