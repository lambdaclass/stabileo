/**
 * The load generator's settings as the plan it builds and the regulation settings it saves: the
 * one reading of `AutoLoadsMemory`, used by the generator dialog and by whatever generates loads
 * from a project's saved settings without it (a gallery example).
 *
 * Pure: no store.
 */
import type { LoadPlanInput } from '../../lib/engine/loads/load-plan';
import type { LoadCombinationSpec } from '../../lib/codes/cirsoc101/combinations';
import type { ProjectRegulations, RegulationRole } from '../../lib/codes/roles';
import type { WindDynamics } from '../../lib/engine/loads/wind-dynamics';
import { deadComponentLoad, findDeadEntry } from '../../lib/codes/cirsoc101/dead-loads';
import { snowPg } from '../../lib/engine/loads/snow-config';
import type { AutoLoadsMemory } from './auto-loads-memory';
import type { DeadRow, WindStructureConfig } from './auto-loads-sections';

/** One dead row's component, kN/m². */
export function deadComponent(row: DeadRow): { labelKey: string; q: number } {
  if (row.entryKey === null) return { labelKey: 'loads.dead.custom', q: row.q };
  const entry = findDeadEntry(row.entryKey);
  if (!entry) return { labelKey: 'loads.dead.custom', q: 0 };
  return { labelKey: entry.labelKey, q: deadComponentLoad(entry, { thicknessM: row.thickness, onBattens: row.onBattens }).qKNm2 };
}

/** What the wind acts on, as the plan reads it. */
export function windStructurePlan(w: WindStructureConfig): NonNullable<LoadPlanInput['wind']>['structure'] {
  switch (w.kind) {
    case 'freeRoof': {
      // Af per axis for §2.1.5; an axis left at 0 takes the whole vertical projection.
      const area = { ...((w.areaX ?? 0) > 0 ? { x: w.areaX } : {}), ...((w.areaY ?? 0) > 0 ? { y: w.areaY } : {}) };
      return { kind: 'freeRoof', roof: w.roof, blocked: w.blocked, ...(Object.keys(area).length ? { area } : {}) };
    }
    case 'latticeTower': return { kind: 'latticeTower', section: w.towerSection, round: w.round, solidity: w.solidity, diagonal: w.diagonal, ...(w.width > 0 ? { width: w.width } : {}) };
    case 'openSign': return { kind: 'openSign', members: w.members, solidity: w.solidity, ...(w.width > 0 ? { width: w.width } : {}) };
    case 'solidSign': return { kind: 'solidSign', clearance: w.clearance };
    case 'chimney': return { kind: 'chimney', section: w.chimney, ...(w.diameter > 0 ? { diameter: w.diameter } : {}) };
    default: return { kind: 'building' };
  }
}

/** What the settings alone do not say: the project, the model and what the dialog read off it. */
export interface PlanContext {
  roles: ProjectRegulations;
  codeInputs?: Record<string, unknown>;
  model: LoadPlanInput['model'];
  /** The settings' dynamics with the modal frequencies of a preview in place. Absent: the settings'. */
  windDynamics?: WindDynamics;
  windRegion?: number[];
  windProfile?: Array<[number, number]>;
  /** The slope of the roof the snow reads, degrees, for a roof with no slope of its own. */
  snowRoofSlope?: number;
  snowRoofMembers?: number[];
  projectCombinations?: LoadCombinationSpec[];
}

export function planInputOf(m: AutoLoadsMemory, ctx: PlanContext): LoadPlanInput {
  const dead = m.deadRows.map(deadComponent);
  const totalDead = dead.reduce((s, c) => s + c.q, 0);
  const { special, roofCfg, snowCfg, windDirs } = m;
  return {
    regulations: ctx.roles,
    codeInputs: ctx.codeInputs ?? {},
    model: ctx.model,
    dead,
    occupancyKey: m.selectedOccupancy,
    partitionLive: m.partitionLive.on ? m.partitionLive.q : 0,
    tributaryWidth: m.tributaryWidth,
    gravity: { mode: m.gravityMode, slab: m.gravitySlab, spanAxis: m.gravitySpan, loadEveryPanel: m.gravityLoadEveryPanel },
    patterns: m.livePatterns,
    thermal: special.thermal.on ? { dtUniform: special.thermal.dt, dtGradient: special.thermal.grad } : undefined,
    soil: special.soil.on ? { gradeZ: special.soil.gradeZ, gamma: special.soil.gamma, k: special.soil.k, surcharge: special.soil.surcharge, permanent: special.soil.permanent,
      ...(special.soil.sideOn ? { side: { x: special.soil.sideX, y: special.soil.sideY } } : {}) } : undefined,
    fluid: special.fluid.on ? { levelZ: special.fluid.levelZ, gamma: special.fluid.gamma,
      ...(special.fluid.insideOn ? { inside: { x: special.fluid.insideX, y: special.fluid.insideY } } : {}) } : undefined,
    roof: roofCfg.enabled ? {
      use: roofCfg.use, dead: roofCfg.dead ?? totalDead, deadFromFloors: roofCfg.dead === null,
      // Absent unless chosen: the plan weighs the roof's structure with its cladding (§4.8.1,
      // `roofWeightOf`); the dead load alone took a concrete roof with light finishes for light.
      ...(roofCfg.weight ? { weight: roofCfg.weight } : {}),
      occupancyKey: roofCfg.occupancyKey, slopeDeg: roofCfg.slopeDeg ?? (ctx.snowRoofSlope ?? m.windRoofSlope),
    } : undefined,
    reductionElementKind: m.reductionElementKind,
    floorsSupported: m.floorsSupported,
    applyLiveReduction: m.applyLiveReduction,
    wind: m.enableWind ? {
      enabled: true, basicSpeed: m.windV, exposure: m.windExposure,
      enclosure: m.windEnclosure, siteAltitudeM: m.windAltitude,
      kzt: m.windKzt, kztSurveyed: m.windKztSurveyed,
      roofSlopeDeg: m.windRoofSlope, rigid: m.windDyn.n1Source === 'declaredRigid', dynamics: ctx.windDynamics ?? { ...m.windDyn },
      directions: { x: windDirs.some((d) => d.endsWith('x')), y: windDirs.some((d) => d.endsWith('y')) },
      caseSet: m.windCaseSet, senses: [...windDirs],
      service: m.windService.enabled ? { ...m.windService } : undefined,
      structure: windStructurePlan(m.windStructure),
      ...(ctx.windRegion ? { region: ctx.windRegion } : {}),
      ...(ctx.windProfile ? { profile: ctx.windProfile } : {}),
    } : undefined,
    snow: snowCfg.enabled ? {
      enabled: true, ...snowPg(snowCfg),
      terrain: snowCfg.terrain, exposure: snowCfg.exposure, thermal: snowCfg.thermal,
      category: snowCfg.category, roofKind: snowCfg.roofKind, slippery: snowCfg.slippery,
      ...(snowCfg.roofKind === 'curved' && snowCfg.abutting ? { abutting: true } : {}),
      partial: snowCfg.partial,
      ...(ctx.snowRoofMembers ? { roof: ctx.snowRoofMembers } : {}),
      ...(snowCfg.parapet > 0 ? { parapet: { height: snowCfg.parapet } } : {}),
      ...(snowCfg.adjacent.length ? { adjacent: snowCfg.adjacent.map((a) => ({ ...a })) } : {}),
    } : undefined,
    seismic: m.enableSeismic ? {
      /* `coefficient` is the fallback the plan uses only when `code` is absent or
         blocked; the 103 path below is what normally produces C. */
      enabled: true, coefficient: 0, method: m.seismicMethod.method,
      code: {
        zone: m.seismicZone, site: m.siteClass, group: m.destinationGroup,
        systemKey: m.systemKey, periodSystem: m.periodSystem, regularity: m.regularity, occupancy: m.seismicOccupancy,
        elastic: m.elasticDesign,
      },
      liveParticipation: null,
      directions: { x: m.seismicDirectionX, y: m.seismicDirectionZ },
      // Read by INPRES-CIRSOC 103 alone: the other codes decide the vertical component themselves (`verticalByCode`).
      vertical: m.seismicMethod.vertical, torsion: m.seismicMethod.torsion, diagonal: m.seismicMethod.diagonal,
    } : undefined,
    generateCombinations: m.genCombos,
    combinationSet: m.comboSet,
    projectCombinations: m.comboSource === 'project' ? ctx.projectCombinations : undefined,
  };
}

/**
 * The settings the generator saves on each load role it configured, for it to open on them
 * (`autoLoadsMemory`): the basis and the loads always, wind, snow and seismic when generated.
 */
export function roleSettingsOf(m: AutoLoadsMemory): Array<[RegulationRole, Record<string, unknown>]> {
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return [
    ['basis', {
      generateCombinations: m.genCombos,
      dialog: copy({ comboSet: m.comboSet, comboSource: m.comboSource, bothSenses: m.bothSenses, patternsInCompanions: m.patternsInCompanions }),
    }],
    ['loads', {
      occupancyKey: m.selectedOccupancy,
      dead: m.deadRows.map(deadComponent),
      tributaryWidth: m.tributaryWidth, applyLiveReduction: m.applyLiveReduction, reductionElementKind: m.reductionElementKind, floorsSupported: m.floorsSupported,
      dialog: copy({ deadRows: m.deadRows, partitionLive: m.partitionLive, gravityMode: m.gravityMode, gravitySlab: m.gravitySlab, gravitySpan: m.gravitySpan, gravityLoadEveryPanel: m.gravityLoadEveryPanel, roofCfg: m.roofCfg, livePatterns: m.livePatterns, special: m.special }),
    }],
    ...(m.enableWind ? [['wind', {
      basicSpeed: m.windV, exposure: m.windExposure, enclosure: m.windEnclosure,
      siteAltitudeM: m.windAltitude, kzt: m.windKzt, kztSurveyed: m.windKztSurveyed,
      roofSlopeDeg: m.windRoofSlope, dynamics: copy(m.windDyn),
      dialog: copy({ windDirs: m.windDirs, windCaseSet: m.windCaseSet, windService: m.windService, windStructure: m.windStructure }),
    }] as [RegulationRole, Record<string, unknown>]] : []),
    ...(m.snowCfg.enabled ? [['snow', copy(m.snowCfg) as unknown as Record<string, unknown>] as [RegulationRole, Record<string, unknown>]] : []),
    ...(m.enableSeismic ? [['seismic', {
      zone: m.seismicZone, site: m.siteClass, destinationGroup: m.destinationGroup, systemKey: m.systemKey,
      periodSystem: m.periodSystem, regularity: m.regularity, occupancy: m.seismicOccupancy, elastic: m.elasticDesign,
      dialog: copy({ seismicMethod: m.seismicMethod, seismicDirectionX: m.seismicDirectionX, seismicDirectionZ: m.seismicDirectionZ }),
    }] as [RegulationRole, Record<string, unknown>]] : []),
  ];
}
