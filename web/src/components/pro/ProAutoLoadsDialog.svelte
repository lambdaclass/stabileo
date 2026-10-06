<script lang="ts">
  import { untrack } from 'svelte';
  import { proNav } from '../../lib/store/pro-nav.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { identifyMessages } from '../../lib/codes/message';
  import { te } from '../../lib/i18n/engine-text';
  // The ONE authoritative generator. The legacy auto-loads / wind-loads production path
  // is gone: it implemented the 2005 editions, had no wind pressure coefficients, and
  // built the seismic weight on a literal "* 50 // rough 50m2 per floor".
  import {
    buildLoadPlan, describePlanDelta, levelsWithPlanArea, type LoadPlan, type LoadPlanInput, type PlanDelta,
  } from '../../lib/engine/loads/load-plan';
  import { OCCUPANCY_TABLE_2025 } from '../../lib/codes/cirsoc101/live-loads';
  import { findDeadEntry, deadComponentLoad } from '../../lib/codes/cirsoc101/dead-loads';
  import ProDeadLoadBuilder, { type DeadRow } from './ProDeadLoadBuilder.svelte';
  import type { ElementKind } from '../../lib/codes/cirsoc101/live-loads';
  import type { Enclosure, Exposure, ServiceRecurrence } from '../../lib/codes/cirsoc102/wind';
  import { WIND_DIRECTIONS, type WindCaseSet, type WindDirection } from '../../lib/engine/loads/wind-cases';
  import ProWindCasesPanel from './ProWindCasesPanel.svelte';
  import ProSnowSection from './ProSnowSection.svelte';
  import ProWindCladding from './ProWindCladding.svelte';
  import ProAutoLoadsCombos, { type ComboSource } from './ProAutoLoadsCombos.svelte';
  import ProAutoLoadsApplying, { type GravityMode } from './ProAutoLoadsApplying.svelte';
  import ProRoofLoadSection, { defaultRoofConfig, roofLrRange } from './ProRoofLoadSection.svelte';
  import ProSeismicMethod, { defaultSeismicMethod } from './ProSeismicMethod.svelte';
  import ProWindStructure, { defaultWindStructure } from './ProWindStructure.svelte';
  import ProSpecialLoadsSection, { defaultSpecialLoads } from './ProSpecialLoadsSection.svelte';
  import { modesForPlan, windFrequenciesForPlan } from '../../lib/store/seismic-modes';
  import ProWindDynamics from './ProWindDynamics.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';
  import ProActionRegion from './loads/ProActionRegion.svelte';
  import ProfileChart from './loads/ProfileChart.svelte';
  import { parseDecimal } from '../../lib/utils/numeric-input';
  import { regionNodes, regionMembers, type ActionRegion } from '../../lib/model/loads/region-nodes';
  import { toQ, unitQ } from '../../lib/store/display-units.svelte';
  import { loadCodeFor } from '../../lib/codes/families';
  import { DEFAULT_WIND_DYNAMICS, isLowRise, type WindDynamics, type fundamentalFrequencies } from '../../lib/engine/loads/wind-dynamics';
  import { applyLoadPlan } from '../../lib/store/apply-load-plan';
  import { ruleToSpec } from '../../lib/engine/loads/combination-rules';
  import { defaultSnowConfig, snowPg, snowPreview, type SnowConfig } from '../../lib/engine/loads/snow-config';
  import { roofGeometry } from '../../lib/engine/loads/snow-loads';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { allOptionsForRole, bindingLabel, optionIsAvailable, optionLabel } from '../../lib/codes/roles';
  import { messageIdentity } from '../../lib/codes/message';
  /*
   * Seismic comes from INPRES-CIRSOC 103 Parte I (2018) now.
   *
   * It used to come from `engine/auto-loads.ts`, which carries the 2005-era model: Ca
   * and Cv by zone and SOIL rather than by spectral type, T3 fixed at 3 s for every
   * zone where the 2018 table gives 3, 5, 8 and 13, and R built up from a ductility μ
   * through a ramp instead of read off Tabla 5.1. It produced a number with no clause
   * behind it, inside a dialog that cites a clause for everything else.
   */
  import {
    designSpectrum, isBlocked, RISK_FACTOR, SIMULTANEITY_F1,
    type SeismicZone, type SiteClass, type DestinationGroup, type OccupancyProbability,
  } from '../../lib/codes/cirsoc103/spectrum';
  import { BEHAVIOUR_TABLE_2018, findBehaviour, R_ELASTIC } from '../../lib/codes/cirsoc103/behaviour';
  import type { PeriodSystem, PlanRegularity } from '../../lib/codes/cirsoc103/static-method';

  /** Which load the reader came in to define. */
  export type AutoLoadFocus = 'dead' | 'live' | 'roof' | 'wind' | 'snow' | 'seismic' | 'special' | 'combos';

  interface Props {
    open: boolean;
    onclose: () => void;
    /**
     * Open with one load's parameters in front of the reader.
     *
     * The dialog does all four at once, which is right when you are setting a project
     * up and wrong when you are adding wind to one that already has its gravity loads.
     * A case row in the loads table asks for ITS regulation, and the section it asks
     * for is turned on and scrolled to rather than hunted for.
     */
    focus?: AutoLoadFocus | null;
  }

  let { open, onclose, focus = null }: Props = $props();

  // ─── Design code definitions ─────────

  /*
   * ── Dead load, from Tabla 3.1 ──────────────────────────────────
   *
   * It opened with five fixed rows carrying five fixed numbers — screed 1,0, finish
   * 0,8, ceiling 0,3, services 0,3, partitions 1,0 — none of which came from anywhere.
   * The build-up is assembled from the table now; see `ProDeadLoadBuilder`.
   *
   * The default is a real build-up rather than an empty list, because an empty one is a
   * dialog that cannot produce a dead load until the reader has read a table they have
   * not opened yet: 8 cm of cement screed, a ceramic tile, a suspended ceiling, and a
   * plasterboard partition allowance. Every one of those four is a Tabla 3.1 row, and
   * each can be removed.
   */
  let deadRows = $state<DeadRow[]>([
    { entryKey: 'contrapiso_cemento', thickness: 0.08, onBattens: false, q: 0, isPartition: false },
    { entryKey: 'piso_baldosa_ceramica', thickness: 0, onBattens: false, q: 0, isPartition: false },
    { entryKey: 'cielo_acustico', thickness: 0, onBattens: false, q: 0, isPartition: false },
    { entryKey: 'tab_yeso_doble', thickness: 0, onBattens: false, q: 0, isPartition: true },
  ]);

  /** One row's contribution, resolved the same way the builder resolves it. */
  function rowLoad(row: DeadRow): { labelKey: string; q: number } {
    if (row.entryKey === null) return { labelKey: 'loads.dead.custom', q: row.q };
    const entry = findDeadEntry(row.entryKey);
    if (!entry) return { labelKey: 'loads.dead.custom', q: 0 };
    const r = deadComponentLoad(entry, { thicknessM: row.thickness, onBattens: row.onBattens });
    return { labelKey: entry.labelKey, q: r.qKNm2 };
  }
  const deadComponents = $derived(deadRows.map(rowLoad));
  const totalDead = $derived(deadComponents.reduce((s, c) => s + c.q, 0));

  // ─── Live load config ──────────────────
  let selectedOccupancy = $state('vivienda');
  const occupancyEntry = $derived(OCCUPANCY_TABLE_2025.find(o => o.key === selectedOccupancy));
  const occupancyQ = $derived(occupancyEntry?.uniformKNm2 ?? 0);
  // §4.7.2 reduction inputs — a real code feature the legacy path did not have at all.
  let applyLiveReduction = $state(true);
  let reductionElementKind = $state<ElementKind>('interiorBeam');
  let floorsSupported = $state(1);
  let tributaryWidth = $state(3.0);
  let gravityMode = $state<GravityMode>('panels');
  let roofCfg = $state(defaultRoofConfig());
  /** Partial live loading (§4.3.3): none, the checkerboards, or those and the spans each side of a line. */
  let livePatterns = $state<'none' | 'checkerboard' | 'all'>('all');
  let seismicMethod = $state(defaultSeismicMethod());
  let windStructure = $state(defaultWindStructure());
  let special = $state(defaultSpecialLoads());
  /** The model's extent, for the cladding table. */
  const modelExtent = $derived.by(() => {
    const ns = [...modelStore.nodes.values()];
    if (!ns.length) return { h: 0, least: 0 };
    const span = (k: 'x' | 'y') => Math.max(...ns.map((n) => n[k])) - Math.min(...ns.map((n) => n[k]));
    return { h: Math.max(...ns.map((n) => n.z ?? 0)), least: Math.min(span('x'), span('y')) || Math.max(span('x'), span('y')) };
  });
  let gravitySlab = $state<'twoWay' | 'oneWay'>('twoWay');
  let gravitySpan = $state<'x' | 'y'>('x');

  // ─── Seismic config ────────────────────
  // Off by default: seismic loads require a bound seismic regulation, and a dialog that
  // starts with them on would block every fresh project's preview.
  let enableSeismic = $state(false);
  // `bound`, not `usable`: this dialog supplies the settings, so gating on
  // configComplete would be circular.
  const seismicAvailable = $derived(regulationsStore.bound('seismic'));
  const windAvailable = $derived(regulationsStore.bound('wind'));
  const snowAvailable = $derived(regulationsStore.bound('snow'));
  /** CIRSOC 102's editions in the catalogue, the ones without their text included. */
  const windEditions = allOptionsForRole('wind').filter((o) => o.regulation === 'cirsoc-102');
  let snowCfg = $state<SnowConfig>(defaultSnowConfig());
  const snowRoof = $derived.by(() => {
    const g = roofGeometry({ nodes: modelStore.nodes, elements: modelStore.elements } as never);
    return g ? { slopeDeg: g.slopeDeg, W: g.W } : null;
  });
  let seismicZone = $state<SeismicZone>(4);
  let siteClass = $state<SiteClass>('SD');
  let destinationGroup = $state<DestinationGroup>('B');
  /** Tabla 5.1 row — the system that carries the shear. R divides the whole spectrum. */
  let systemKey = $state('rc_frame_full_ductility');
  /** Tabla 6.2 row — a different classification, for the period only. */
  let periodSystem = $state<PeriodSystem>('concreteMomentFrame');
  let regularity = $state<PlanRegularity>('regular');
  /** Tabla 3.3 — how much imposed load is present when the earthquake arrives. */
  let seismicOccupancy = $state<OccupancyProbability>('reduced');
  let elasticDesign = $state(false);
  let seismicDirectionX = $state(true);
  let seismicDirectionZ = $state(true);

  /** The spectrum, live, so the panel can show what the zone and site imply. */
  const spectrumPreview = $derived(designSpectrum({ zone: seismicZone, site: siteClass }));
  const behaviourEntry = $derived(findBehaviour(systemKey));
  const effectiveR = $derived(elasticDesign ? R_ELASTIC : behaviourEntry?.r ?? null);

  // ─── Wind config ─────────────────────
  let enableWind = $state(false);
  let windV = $state(45);
  let windExposure = $state<Exposure>('B');
  let windEnclosure = $state<Enclosure>('enclosed');
  let windAltitude = $state(0);
  let windKzt = $state(1);
  let windKztSurveyed = $state(false);
  let windRoofSlope = $state(0);
  /** The wind's dynamics (§1.9): the frequency's source, damping, the rigid G, e_R. */
  let windDyn = $state<WindDynamics>({ ...DEFAULT_WIND_DYNAMICS });
  /** The frequencies the modal analysis gave the last preview, per axis. */
  let windModal = $state<ReturnType<typeof fundamentalFrequencies> | null>(null);
  /** A low-rise building is rigid without a frequency (art. 1.2, §1.9.2). */
  const windLowRise = $derived.by(() => {
    const ns = [...modelStore.nodes.values()];
    if (ns.length === 0) return false;
    const ext = (k: 'x' | 'y') => Math.max(...ns.map((n) => n[k])) - Math.min(...ns.map((n) => n[k]));
    return isLowRise(Math.max(...ns.map((n) => n.z ?? 0)), ext('x'), ext('y'), windEnclosure);
  });
  /** The dynamics the plan gets: the modal frequencies in place of typed ones when they are the source. */
  const planDynamics = (): WindDynamics => ({
    ...$state.snapshot(windDyn),
    ...(windDyn.n1Source === 'modal' && windModal ? { n1: { x: windModal.x?.n1, y: windModal.y?.n1 } } : {}),
  });
  /** The wind directions to generate: all four unless the reader narrows them (`wind-cases.ts`). */
  let windDirs = $state<WindDirection[]>([...WIND_DIRECTIONS]);
  let windCaseSet = $state<WindCaseSet>('all');
  let windService = $state<{ enabled: boolean; v50: number; mri: ServiceRecurrence }>({ enabled: false, v50: 0, mri: 10 });

  // ─── Options ───────────────────────────
  let genCombos = $state(true);
  /** Strength, service or both: strength by default, as the regulation's design needs. */
  let comboSet = $state<'ultimate' | 'service' | 'both'>('ultimate');
  /** Wind and earthquake in both senses along each direction (`combination-cases.ts`). */
  let bothSenses = $state(true);
  /** Where the combinations come from: the regulation, or the project's rules. */
  let comboSource = $state<ComboSource>('regulation');
  /** Patterns of partial loading also where their action is a companion (`combination-cases.ts`). */
  let patternsInCompanions = $state(false);
  let clearExisting = $state(false);

  /*
   * ── One section at a time ─────────────────────────────────────────
   *
   * The dialog was one column of ten cards, 2 300 px of scroll in a 620 px box, where finding the
   * snow meant scrolling past the dead load's table. It is laid out as the section selector is:
   * the actions down the left, each with what it comes to, and the one chosen on the right.
   */
  type Section = 'regulations' | 'dead' | 'live' | 'roof' | 'wind' | 'snow' | 'seismic' | 'special' | 'applying' | 'combos';
  let section = $state<Section>('dead');

  $effect(() => {
    if (!open || !focus) return;
    const f = focus;
    untrack(() => {
      /* Turning the section ON is the point: arriving at a disabled wind block from a
         row that says "W" is arriving nowhere. */
      if (f === 'wind' && windAvailable) enableWind = true;
      if (f === 'seismic' && seismicAvailable) enableSeismic = true;
      if (f === 'snow' && snowAvailable) snowCfg.enabled = true;
      section = f;
      plan = null; delta = null;
    });
  });

  /** The plan is built first and applied only after the user confirms. */
  let plan = $state<LoadPlan | null>(null);
  /** A load per area in the display units, with its unit. */
  const aq = (v: number, d = 2) => `${toQ(v, 'areaLoad').toFixed(d)} ${unitQ('areaLoad')}`;
  /** A section's heading: the bound code's name and the clause it stands on, both from its module. */
  function codeHead(role: 'basis' | 'loads' | 'snow' | 'wind' | 'seismic', section?: string): string {
    const m = loadCodeFor(regulationsStore.binding(role)?.adapterId);
    return m ? [m.title, section ? m.sections?.[section] : ''].filter(Boolean).join(' ') : '';
  }
  // ── Where wind and snow act (`region-nodes.ts`), and the user's wind profile ──
  let windRegion = $state<ActionRegion>({ kind: 'all' });
  let snowRegion = $state<ActionRegion>({ kind: 'all' });
  let windProfileOn = $state(false);
  let windProfileText = $state('0; 0.8\n10; 1.0\n20; 1.15');
  const windRegionNodes = $derived(regionNodes(modelStore.model as never, windRegion));
  const snowRoofMembers = $derived(regionMembers(modelStore.model as never, snowRegion));
  /** Rows of "z; p" read into a profile, or null when they do not read. */
  const windProfile = $derived.by((): Array<[number, number]> | null => {
    const rows: Array<[number, number]> = [];
    for (const line of windProfileText.split(/\r?\n/)) {
      const l = line.trim();
      if (!l) continue;
      const cells = l.split(/\s*[;\t]\s*|\s+/);
      const z = parseDecimal(cells[0] ?? ''), p = parseDecimal(cells[1] ?? '');
      if (z === null || p === null) return null;
      rows.push([z, p]);
    }
    return rows.length >= 2 ? rows.sort((a, b) => a[0] - b[0]) : null;
  });
  /** The previewed plan's gust effect factor per axis, for the dynamics block's reading. */
  /**
   * The last preview's gust effect factor per axis. Kept apart from the plan, which "Back" clears:
   * the reading sits with the wind's inputs, behind the before-and-after. Changing an input it
   * depends on drops it until the next preview.
   */
  let planGust = $state<LoadPlan['factors']['windGust']>(undefined);
  $effect(() => {
    void [JSON.stringify(windDyn), windV, windExposure, windEnclosure, enableWind];
    planGust = undefined;
  });
  /** The roof's weight class the plan settled on; read here, outside any `{#if}` that narrows `plan`. */
  const planRoofWeight = $derived(plan?.roofWeight);
  let delta = $state<PlanDelta | null>(null);
  let applyError = $state<string | null>(null);


  // The old seismic preview computed floor weights as
  //   (totalDead + 0.25 * occupancyQ) * 50   // "rough 50m2 per floor"
  // with 50 m2 a literal, so every floor of every building weighed the same regardless of
  // its plan. It is gone. The preview now comes from the plan, whose level masses are
  // built from member self-weight plus applied loads over each level's TRUE plan extent.
  const seismicPreview = $derived(plan?.factors.baseShear ? {
    W: plan.factors.seismicWeight?.value ?? 0,
    V0: plan.factors.baseShear.value,
    levels: plan.levels.filter(l => l.elevation > 0),
  } : null);

  function windStructurePlan(): NonNullable<LoadPlanInput['wind']>['structure'] {
    const w = windStructure;
    switch (w.kind) {
      case 'freeRoof': return { kind: 'freeRoof', roof: w.roof, blocked: w.blocked };
      case 'latticeTower': return { kind: 'latticeTower', section: w.towerSection, round: w.round, solidity: w.solidity, diagonal: w.diagonal, ...(w.width > 0 ? { width: w.width } : {}) };
      case 'openSign': return { kind: 'openSign', members: w.members, solidity: w.solidity, ...(w.width > 0 ? { width: w.width } : {}) };
      case 'solidSign': return { kind: 'solidSign', clearance: w.clearance };
      case 'chimney': return { kind: 'chimney', section: w.chimney, ...(w.diameter > 0 ? { diameter: w.diameter } : {}) };
      default: return { kind: 'building' };
    }
  }

  function planInput(): LoadPlanInput {
    return {
      regulations: regulationsStore.roles,
      model: {
        nodes: modelStore.nodes as never,
        elements: modelStore.elements as never,
        sections: modelStore.model.sections as never,
        materials: modelStore.model.materials as never,
        loadCases: modelStore.model.loadCases,
        quads: modelStore.model.quads as never,
      },
      dead: deadComponents.map(d => ({ labelKey: d.labelKey, q: d.q })),
      occupancyKey: selectedOccupancy,
      tributaryWidth,
      gravity: { mode: gravityMode, slab: gravitySlab, spanAxis: gravitySpan },
      patterns: livePatterns,
      thermal: special.thermal.on ? { dtUniform: special.thermal.dt, dtGradient: special.thermal.grad } : undefined,
      soil: special.soil.on ? { gradeZ: special.soil.gradeZ, gamma: special.soil.gamma, k: special.soil.k, surcharge: special.soil.surcharge, permanent: special.soil.permanent,
        ...(special.soil.sideOn ? { side: { x: special.soil.sideX, y: special.soil.sideY } } : {}) } : undefined,
      fluid: special.fluid.on ? { levelZ: special.fluid.levelZ, gamma: special.fluid.gamma,
        ...(special.fluid.insideOn ? { inside: { x: special.fluid.insideX, y: special.fluid.insideY } } : {}) } : undefined,
      roof: roofCfg.enabled ? {
        use: roofCfg.use, dead: roofCfg.dead ?? totalDead,
        // Absent unless chosen: the plan weighs the roof's structure with its cladding (§4.8.1,
        // `roofWeightOf`); the dead load alone took a concrete roof with light finishes for light.
        ...(roofCfg.weight ? { weight: roofCfg.weight } : {}),
        occupancyKey: roofCfg.occupancyKey, slopeDeg: roofCfg.slopeDeg ?? (snowRoof?.slopeDeg ?? windRoofSlope),
      } : undefined,
      reductionElementKind,
      floorsSupported,
      applyLiveReduction,
      wind: enableWind ? {
        enabled: true, basicSpeed: windV, exposure: windExposure,
        enclosure: windEnclosure, siteAltitudeM: windAltitude,
        kzt: windKzt, kztSurveyed: windKztSurveyed,
        roofSlopeDeg: windRoofSlope, rigid: windDyn.n1Source === 'declaredRigid', dynamics: planDynamics(),
        directions: { x: windDirs.some((d) => d.endsWith('x')), y: windDirs.some((d) => d.endsWith('y')) },
        caseSet: windCaseSet, senses: [...windDirs],
        service: windService.enabled ? { ...windService } : undefined,
        structure: windStructurePlan(),
        ...(windRegionNodes ? { region: windRegionNodes } : {}),
        ...(windProfileOn && windProfile ? { profile: windProfile } : {}),
      } : undefined,
      snow: snowCfg.enabled ? {
        enabled: true, ...snowPg(snowCfg),
        terrain: snowCfg.terrain, exposure: snowCfg.exposure, thermal: snowCfg.thermal,
        category: snowCfg.category, roofKind: snowCfg.roofKind, slippery: snowCfg.slippery,
        ...(snowCfg.roofKind === 'curved' && snowCfg.abutting ? { abutting: true } : {}),
        partial: snowCfg.partial,
        ...(snowRoofMembers ? { roof: snowRoofMembers } : {}),
        ...(snowCfg.parapet > 0 ? { parapet: { height: snowCfg.parapet } } : {}),
        ...(snowCfg.adjacent.length ? { adjacent: $state.snapshot(snowCfg.adjacent) } : {}),
      } : undefined,
      seismic: enableSeismic ? {
        /* `coefficient` is the fallback the plan uses only when `code` is absent or
           blocked; the 103 path below is what normally produces C. */
        enabled: true, coefficient: 0,
        code: {
          zone: seismicZone, site: siteClass, group: destinationGroup,
          systemKey, periodSystem, regularity, occupancy: seismicOccupancy,
          elastic: elasticDesign,
        },
        liveParticipation: null,
        directions: { x: seismicDirectionX, y: seismicDirectionZ },
        vertical: seismicMethod.vertical, torsion: seismicMethod.torsion, diagonal: seismicMethod.diagonal,
      } : undefined,
      generateCombinations: genCombos,
      combinationSet: comboSet,
      projectCombinations: comboSource === 'project' && modelStore.combinationRules.length > 0
        ? modelStore.combinationRules.map(ruleToSpec) : undefined,
    };
  }

  /**
   * Record that this dialog has supplied each load role's settings.
   *
   * `requiresConfig` on the loads/wind/seismic options means "something must supply the
   * parameters". This dialog IS that something — occupancy, dead components, exposure,
   * enclosure, zone and soil all live here. Marking the roles configured from the place
   * that configures them is what makes a fresh project able to generate loads at all,
   * instead of reporting a blocked plan with no way to unblock it.
   */
  function recordRoleConfiguration() {
    regulationsStore.configureRole('basis', { generateCombinations: genCombos }, true);
    regulationsStore.configureRole('loads', {
      occupancyKey: selectedOccupancy,
      dead: deadComponents.map(d => ({ labelKey: d.labelKey, q: d.q })),
      tributaryWidth, applyLiveReduction, reductionElementKind, floorsSupported,
      // The dialog's own state, to start from next time (`restoreFromRoles`).
      dialog: $state.snapshot({ deadRows, gravityMode, gravitySlab, gravitySpan, roofCfg, livePatterns, special }),
    }, true);
    if (enableWind) {
      regulationsStore.configureRole('wind', {
        basicSpeed: windV, exposure: windExposure, enclosure: windEnclosure,
        siteAltitudeM: windAltitude, kzt: windKzt, kztSurveyed: windKztSurveyed,
        roofSlopeDeg: windRoofSlope, dynamics: { ...$state.snapshot(windDyn) },
        dialog: $state.snapshot({ windDirs, windCaseSet, windService, windStructure }),
      }, true);
    }
    if (snowCfg.enabled) {
      regulationsStore.configureRole('snow', { ...$state.snapshot(snowCfg) }, true);
    }
    if (enableSeismic) {
      regulationsStore.configureRole('seismic', {
        zone: seismicZone, site: siteClass, destinationGroup, systemKey,
        periodSystem, regularity, occupancy: seismicOccupancy, elastic: elasticDesign,
        dialog: $state.snapshot({ seismicMethod, seismicDirectionX, seismicDirectionZ }),
      }, true);
    }
  }

  /**
   * Start from what the project stated last time, per role, rather than from the defaults: the
   * dialog writes its parameters to each role it generates (`recordRoleConfiguration`) and used to
   * open on V = 45 m/s and zone 4 whatever the project said. A role never configured keeps the
   * defaults. Each value is taken only when it is there, so an older project restores what it has.
   */
  function restoreFromRoles() {
    type Rec = Record<string, any>;
    const set = (role: Parameters<typeof regulationsStore.binding>[0]): Rec | null => {
      const b = regulationsStore.binding(role);
      return b?.adapterId && b.settings && Object.keys(b.settings).length ? (b.settings as Rec) : null;
    };
    const basis = set('basis');
    if (basis && typeof basis.generateCombinations === 'boolean') genCombos = basis.generateCombinations;
    const loads = set('loads');
    if (loads) {
      if (typeof loads.occupancyKey === 'string') selectedOccupancy = loads.occupancyKey;
      if (typeof loads.tributaryWidth === 'number') tributaryWidth = loads.tributaryWidth;
      if (typeof loads.applyLiveReduction === 'boolean') applyLiveReduction = loads.applyLiveReduction;
      if (typeof loads.reductionElementKind === 'string') reductionElementKind = loads.reductionElementKind as ElementKind;
      if (typeof loads.floorsSupported === 'number') floorsSupported = loads.floorsSupported;
      const d = loads.dialog as Rec | undefined;
      if (d?.deadRows) deadRows = d.deadRows;
      if (d?.gravityMode) gravityMode = d.gravityMode;
      if (d?.gravitySlab) gravitySlab = d.gravitySlab;
      if (d?.gravitySpan) gravitySpan = d.gravitySpan;
      if (d?.roofCfg) roofCfg = d.roofCfg;
      if (d?.livePatterns) livePatterns = d.livePatterns;
      if (d?.special) special = d.special;
    }
    // A code's own starting values first, then what the project saved over them.
    const windCode = loadCodeFor(regulationsStore.binding('wind')?.adapterId);
    if (windCode?.role === 'wind') {
      windV = windCode.defaults.basicSpeed;
      windExposure = windCode.defaults.exposure as Exposure;
      windEnclosure = windCode.defaults.enclosure as Enclosure;
    }
    const seismicCode = loadCodeFor(regulationsStore.binding('seismic')?.adapterId);
    if (seismicCode?.role === 'seismic') {
      seismicZone = seismicCode.defaults.zone as SeismicZone;
      siteClass = seismicCode.defaults.site as SiteClass;
      destinationGroup = seismicCode.defaults.group as DestinationGroup;
    }
    const wind = set('wind');
    if (wind && typeof wind.basicSpeed === 'number') {
      windV = wind.basicSpeed;
      if (wind.exposure) windExposure = wind.exposure;
      if (wind.enclosure) windEnclosure = wind.enclosure;
      if (typeof wind.siteAltitudeM === 'number') windAltitude = wind.siteAltitudeM;
      if (typeof wind.kzt === 'number') windKzt = wind.kzt;
      if (typeof wind.kztSurveyed === 'boolean') windKztSurveyed = wind.kztSurveyed;
      if (typeof wind.roofSlopeDeg === 'number') windRoofSlope = wind.roofSlopeDeg;
      // An older project said "rigid" with a checkbox: that is a declared-rigid frequency source.
      if (wind.dynamics) windDyn = { ...DEFAULT_WIND_DYNAMICS, ...wind.dynamics };
      else if (typeof wind.rigid === 'boolean') windDyn = { ...DEFAULT_WIND_DYNAMICS, n1Source: wind.rigid ? 'declaredRigid' : 'typed' };
      const d = wind.dialog as Rec | undefined;
      if (d?.windDirs) windDirs = d.windDirs;
      if (d?.windCaseSet) windCaseSet = d.windCaseSet;
      if (d?.windService) windService = d.windService;
      if (d?.windStructure) windStructure = d.windStructure;
      enableWind = windAvailable;
    }
    const snow = set('snow');
    if (snow && typeof snow.enabled === 'boolean') snowCfg = { ...defaultSnowConfig(), ...snow } as SnowConfig;
    const seismic = set('seismic');
    if (seismic && seismic.zone !== undefined) {
      seismicZone = seismic.zone;
      if (seismic.site) siteClass = seismic.site;
      if (seismic.destinationGroup) destinationGroup = seismic.destinationGroup;
      if (seismic.systemKey) systemKey = seismic.systemKey;
      if (seismic.periodSystem) periodSystem = seismic.periodSystem;
      if (seismic.regularity) regularity = seismic.regularity;
      if (seismic.occupancy) seismicOccupancy = seismic.occupancy;
      if (typeof seismic.elastic === 'boolean') elasticDesign = seismic.elastic;
      const d = seismic.dialog as Rec | undefined;
      if (d?.seismicMethod) seismicMethod = d.seismicMethod;
      if (typeof d?.seismicDirectionX === 'boolean') seismicDirectionX = d.seismicDirectionX;
      if (typeof d?.seismicDirectionZ === 'boolean') seismicDirectionZ = d.seismicDirectionZ;
      enableSeismic = seismicAvailable;
    }
  }
  let wasOpen = false;
  $effect(() => {
    const now = open;
    untrack(() => { if (now && !wasOpen) restoreFromRoles(); wasOpen = now; });
  });

  /** Step 1 — build the preview. Pure; the model is untouched. */
  function handlePreview() {
    applyError = null;
    recordRoleConfiguration();
    let p = buildLoadPlan(planInput());
    // A frequency from the modal analysis under the plan's own masses (§1.9.2, `seismic-modes.ts`).
    if (enableWind && windDyn.n1Source === 'modal' && !windLowRise && p.outcome === 'READY') {
      const f = windFrequenciesForPlan(p, SIMULTANEITY_F1[seismicOccupancy]);
      if ('error' in f) { applyError = tp('autoLoad.windDyn.modalFailed', { error: f.error }); plan = null; delta = null; return; }
      windModal = f;
      p = buildLoadPlan(planInput());
    }
    // The modal method needs the model's modes under the plan's own masses (`seismic-modes.ts`).
    if (enableSeismic && seismicMethod.method === 'modal' && p.outcome === 'READY') {
      const m = modesForPlan(p, SIMULTANEITY_F1[seismicOccupancy]);
      if ('error' in m) { applyError = tp('autoLoad.seismic.modalFailed', { error: m.error }); plan = null; delta = null; return; }
      const base = planInput();
      p = buildLoadPlan({ ...base, seismic: base.seismic ? { ...base.seismic, modal: { modes: m.modes } } : undefined });
    }
    plan = p;
    planGust = p.factors.windGust;
    // The flag has to go in: the same plan produces a different model depending on it, and
    // reporting the plan's own counts as "after" was the defect the audit caught.
    delta = describePlanDelta(p, currentLoadState(), { replaceExisting: clearExisting, bothSenses: { E: bothSenses }, patternsInCompanions });
  }

  /**
   * The model's current load counts, as the delta needs them.
   *
   * BOTH the 2D and 3D variants count. `addDistributedLoad3D` — which is what this dialog
   * applies with — stores `type: 'distributed3d'`, so filtering on `'distributed'` alone
   * reported zero existing loads in every PRO model. The "before" column then read 0 no
   * matter how many times the user had already generated, and the double-count warning
   * never fired on the quantity it was warning about.
   */
  const DISTRIBUTED_TYPES = ['distributed', 'distributed3d'] as const;
  const NODAL_TYPES = ['nodal', 'nodal3d'] as const;

  function currentLoadState() {
    const count = (types: readonly string[]) =>
      modelStore.loads.filter(l => types.includes(l.type)).length;
    // What the generator wrote, per case type: what a per-action "replace" removes.
    const typeOf = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type]));
    const byType: Record<string, { distributed: number; nodal: number }> = {};
    for (const l of modelStore.loads) {
      if (!(l.data as { generatedBy?: string }).generatedBy) continue;
      const ty = typeOf.get(l.data.caseId ?? 1) ?? '';
      const row = (byType[ty] ??= { distributed: 0, nodal: 0 });
      if ((DISTRIBUTED_TYPES as readonly string[]).includes(l.type)) row.distributed++;
      else if ((NODAL_TYPES as readonly string[]).includes(l.type)) row.nodal++;
    }
    return {
      distributed: count(DISTRIBUTED_TYPES),
      nodal: count(NODAL_TYPES),
      combinations: modelStore.model.combinations.length,
      caseTypes: modelStore.model.loadCases.map(c => c.type),
      generated: { byType, combinations: modelStore.model.combinations.filter((c) => c.origin).length },
    };
  }

  /**
   * Toggling "replace existing loads" changes what Apply will do, so the preview has to
   * follow it. Leaving a stale preview on screen while the flag says otherwise is exactly
   * the kind of quiet disagreement between UI and behaviour this repair is about.
   */
  function onClearExistingChange(next: boolean) {
    clearExisting = next;
    if (plan && plan.outcome === 'READY') {
      delta = describePlanDelta(plan, currentLoadState(), { replaceExisting: next, bothSenses: { E: bothSenses }, patternsInCompanions });
    }
  }

  /**
   * Both senses of the earthquake change how many combinations Apply adds: the preview follows.
   * The checkbox lives in ProAutoLoadsCombos (bound), so the change is watched here.
   */
  $effect(() => {
    const both = bothSenses, companions = patternsInCompanions;
    untrack(() => {
      if (plan && plan.outcome === 'READY') {
        delta = describePlanDelta(plan, currentLoadState(), { replaceExisting: clearExisting, bothSenses: { E: both }, patternsInCompanions: companions });
      }
    });
  });

  /** Step 2 — commit the previewed plan and invalidate downstream. */
  function handleApply() {
    const p = plan;
    if (!p || p.outcome !== 'READY') return;
    if (delta && delta.replaceExisting !== clearExisting) {
      // Cannot happen through the UI, but applying a plan whose preview described a
      // different outcome is the one thing this dialog must never do.
      applyError = t('autoLoad.previewStale');
      return;
    }
    applyError = null;

    applyLoadPlan(p, { clearExisting, bothSenses, patternsInCompanions, nameOf: (key, params) => tp(key, params) });

    // Commit the staged regulation change, then invalidate exactly what moved.
    if (regulationsStore.pending.length > 0) {
      regulationsStore.applyPending('loadRegulation');
    } else {
      regulationsStore.noteChange('loadEdit');
    }

    uiStore.toast(t('autoLoad.applied'), 'success');
    plan = null;
    delta = null;
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  // ─── The navigation: each section, and what it comes to ─────────
  const snowNow = $derived(snowCfg.enabled ? snowPreview(snowCfg, snowRoof) : null);
  const lrNow = $derived(roofCfg.enabled && roofCfg.use === 'maintenance' ? roofLrRange(roofCfg, totalDead, snowRoof?.slopeDeg ?? windRoofSlope, plan?.roofWeight) : null);
  const specialOn = $derived([special.thermal.on && 'T', special.soil.on && 'H', special.fluid.on && 'F'].filter(Boolean) as string[]);
  const f2 = (v: number) => v.toFixed(2);
  interface NavItem { id: Section; symbol?: string; labelKey: string; status: string | null; on: boolean }
  const navGroups = $derived<Array<{ titleKey: string; items: NavItem[] }>>([
    { titleKey: 'autoLoad.nav.basis', items: [
      { id: 'regulations', labelKey: 'autoLoad.nav.regulations', on: true,
        status: regulationsStore.pendingNeedsLoadRegeneration ? t('autoLoad.nav.pending') : null },
    ] },
    { titleKey: 'autoLoad.nav.actions', items: [
      { id: 'dead', symbol: 'D', labelKey: 'autoLoad.nav.dead', on: true, status: aq(totalDead) },
      { id: 'live', symbol: 'L', labelKey: 'autoLoad.nav.live', on: true, status: aq(occupancyQ) },
      { id: 'roof', symbol: 'Lr', labelKey: 'autoLoad.roof.title', on: roofCfg.enabled,
        status: !roofCfg.enabled ? null : lrNow ? `${f2(toQ(lrNow.lo, "areaLoad"))}–${f2(toQ(lrNow.hi, "areaLoad"))}` : t('autoLoad.roof.occupancyShort') },
      { id: 'wind', symbol: 'W', labelKey: 'autoLoad.wind', on: enableWind, status: enableWind ? `V ${+toQ(windV, 'speed').toFixed(1)} ${unitQ('speed')}` : null },
      { id: 'snow', symbol: 'S', labelKey: 'autoLoad.snow', on: snowCfg.enabled,
        status: snowNow && !snowNow.refused ? aq(snowNow.ps) : null },
      { id: 'seismic', symbol: 'E', labelKey: 'autoLoad.seismic', on: enableSeismic, status: enableSeismic ? tp('autoLoad.nav.zone', { z: seismicZone }) : null },
      { id: 'special', symbol: 'T·H·F', labelKey: 'autoLoad.nav.special', on: specialOn.length > 0, status: specialOn.length ? specialOn.join(', ') : null },
    ] },
    { titleKey: 'autoLoad.nav.output', items: [
      { id: 'applying', labelKey: 'autoLoad.applying', on: true, status: t(gravityMode === 'panels' ? 'autoLoad.nav.panels' : 'autoLoad.nav.width') },
      { id: 'combos', labelKey: 'autoLoad.tabCombos', on: genCombos, status: genCombos ? t(comboSource === 'project' ? 'autoLoad.nav.project' : `autoLoad.comboSet.${comboSet}`) : null },
    ] },
  ]);
  /** What Apply would generate, by symbol, for the footer. */
  const willGenerate = $derived([
    'D', 'L', ...(roofCfg.enabled && roofCfg.use === 'maintenance' ? ['Lr'] : []),
    ...(enableWind ? ['W'] : []), ...(snowCfg.enabled ? ['S'] : []), ...(enableSeismic ? ['E'] : []), ...specialOn,
  ]);
  function goTo(id: Section) {
    section = id;
    // A section opened from the preview is an edit: the preview no longer describes it.
    plan = null; delta = null; applyError = null;
  }
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="al-overlay" onkeydown={handleKeydown} onclick={onclose} role="dialog" aria-modal="true" aria-label={t('autoLoad.title')}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="al-dialog" onclick={(e) => e.stopPropagation()}>
    <div class="al-header">
      <h2>{t('autoLoad.title')}</h2>
      <button class="al-close" onclick={onclose} aria-label={t('report.cancel')}>&times;</button>
    </div>

    <div class="al-main">
      <!-- The actions, each with what it comes to: the left column of the section selector. -->
      <nav class="al-nav" aria-label={t('autoLoad.nav.label')}>
        {#each navGroups as g (g.titleKey)}
          <div class="al-nav-group">
            <span class="al-nav-title">{t(g.titleKey)}</span>
            {#each g.items as it (it.id)}
              <button type="button" class="al-nav-item" class:active={!plan && section === it.id} class:off={!it.on}
                aria-current={!plan && section === it.id ? 'page' : undefined}
                onclick={() => goTo(it.id)} data-testid="al-nav-{it.id}">
                {#if it.symbol}<span class="al-nav-sym">{it.symbol}</span>{/if}
                <span class="al-nav-label">{t(it.labelKey)}</span>
                <span class="al-nav-status" data-testid="al-nav-status-{it.id}">{it.status ?? (it.on ? '' : t('autoLoad.nav.off'))}</span>
              </button>
            {/each}
          </div>
        {/each}
      </nav>

      <div class="al-pane">
        {#if plan}
          <div class="al-pane-head"><h3>{t('autoLoad.previewTitle')}</h3></div>
          <div class="al-pane-scroll">
          <div class="al-preview" data-testid="al-preview">
            {#if plan.outcome === 'BLOCKED'}
              <p class="al-error" data-testid="al-blocked">{t('autoLoad.blocked')}</p>
              <ul class="al-list">
                <!-- Same class as the footing-issue crash: two blocked entries can share a key
                     and differ only in their params. -->
                {#each identifyMessages(plan.blockedKeys) as b (b.id)}<li>{te(b.message)}</li>{/each}
              </ul>
            {:else}
              <!-- The one decision that changes what Apply does: here, beside what it changes. -->
              <label class="al-check"><input type="checkbox" checked={clearExisting} data-testid="al-clear"
                onchange={(e) => onClearExistingChange(e.currentTarget.checked)} /> {t('autoLoad.clearExisting')}</label>
              {#if delta}
                <table class="al-delta" data-testid="al-delta">
                  <thead>
                    <tr><th>{t('autoLoad.quantity')}</th><th>{t('autoLoad.before')}</th><th>{t('autoLoad.after')}</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>{t('autoLoad.distributedLoads')}</td><td>{delta.before.distributed}</td><td data-testid="al-after-dist">{delta.after.distributed}</td></tr>
                    <tr><td>{t('autoLoad.nodalLoads')}</td><td>{delta.before.nodal}</td><td data-testid="al-after-nodal">{delta.after.nodal}</td></tr>
                    <tr><td>{t('autoLoad.combinations')}</td><td>{delta.before.combinations}</td><td data-testid="al-after-combos">{delta.after.combinations}</td></tr>
                    <tr><td>{t('autoLoad.loadCases')}</td><td>{delta.before.cases.join(', ') || '—'}</td><td>{delta.after.cases.join(', ') || '—'}</td></tr>
                  </tbody>
                </table>
                {#if delta.addedCaseTypes.length > 0}
                  <p data-testid="al-added-cases">{tp('autoLoad.addedCases', { types: delta.addedCaseTypes.join(', ') })}</p>
                {/if}

                <!-- Every load case gets a stated fate. A case that stops participating in the
                     combinations must never just quietly stop appearing. -->
                {#if delta.warnings.length > 0}
                  <div class="al-error" data-testid="al-case-warnings" role="alert">
                    <strong>{t('autoLoad.caseWarnings')}</strong>
                    <ul class="al-list">
                      {#each delta.warnings as w (messageIdentity(w))}<li>{te(w)}</li>{/each}
                    </ul>
                  </div>
                {/if}
                <details data-testid="al-dispositions">
                  <summary>{tp('autoLoad.dispositions', { count: delta.dispositions.length })}</summary>
                  <ul class="al-list">
                    {#each delta.dispositions as d (d.caseType)}
                      <li class:al-lossy={d.lossy} data-testid={`al-disposition-${d.caseType}`}>
                        <code>{d.caseType}</code> — {te(d.reason)}
                      </li>
                    {/each}
                  </ul>
                </details>
              {/if}
              <p><strong>{t('autoLoad.designLive')}:</strong> {aq(plan.factors.liveReduced.value)}
                ({tp('autoLoad.fromTableLo', { lo: plan.factors.occupancy.value.toFixed(2) })})</p>
              {#if plan.factors.baseShear}
                <p data-testid="al-base-shear">{tp('autoLoad.baseShear', {
                  w: (plan.factors.seismicWeight?.value ?? 0).toFixed(1),
                  v: plan.factors.baseShear.value.toFixed(1) })}</p>
              {/if}
              <!-- The seismic figures come from the PLAN, whose level masses are real. -->
              {#if seismicPreview}
                <div class="al-readout" data-testid="al-seismic-preview">
                  {#if plan.seismic?.source === 'cirsoc103'}
                    <div data-testid="al-seismic-coefficient">
                      {tp('autoLoad.coefficientLine', {
                        c: plan.seismic.c.toFixed(4), t: (plan.seismic.t ?? 0).toFixed(3), ta: (plan.seismic.ta ?? 0).toFixed(3),
                        r: plan.seismic.r ?? 0, gammaR: plan.seismic.gammaR ?? 0,
                      })}
                    </div>
                  {/if}
                  {#each seismicPreview.levels as lv (lv.elevation)}
                    <div>+{lv.elevation.toFixed(2)} m · Wi = {lv.weightKN.toFixed(1)} kN</div>
                  {/each}
                </div>
                {#if plan.seismic?.source === 'cirsoc103'}
                  {#if plan.seismic.periodCapped}<p class="al-hint">{t('autoLoad.periodCapped')}</p>{/if}
                  {#if plan.seismic.floorApplied === 'nearFault'}<p class="al-hint">{t('autoLoad.floorNearFault')}</p>
                  {:else if plan.seismic.floorApplied === 'lowZone'}<p class="al-hint">{t('autoLoad.floorLowZone')}</p>{/if}
                  {#if plan.seismic.topHeavy}<p class="al-hint">{t('autoLoad.topHeavy')}</p>{/if}
                {/if}
              {/if}
              {#if plan.assumptions.length > 0}
                <div class="al-warn" data-testid="al-assumptions">
                  <strong>{t('autoLoad.assumptions')}</strong>
                  <ul class="al-list">{#each plan.assumptions as a (messageIdentity(a))}<li>{te(a)}</li>{/each}</ul>
                </div>
              {/if}
              {#if plan.unsupportedKeys.length > 0}
                <div class="al-warn" data-testid="al-unsupported">
                  <strong>{t('autoLoad.notCovered')}</strong>
                  <ul class="al-list">{#each plan.unsupportedKeys as u (messageIdentity(u))}<li>{te(u)}</li>{/each}</ul>
                </div>
              {/if}
              <details data-testid="al-derivation">
                <summary>{t('autoLoad.derivation')}</summary>
                <ul class="al-list">{#each plan.derivation as d, i (i)}<li>{te(d)}</li>{/each}</ul>
              </details>
              <p class="al-warn">{t('autoLoad.applyInvalidates')}</p>
            {/if}
          </div>
          </div>
        {:else}
          <!-- The chosen section: its name, its regulation and what it comes to, then its fields. -->
          {#if section === 'regulations'}
            <div class="al-pane-head"><h3>{t('autoLoad.appliedRegulations')}</h3></div>
            <div class="al-pane-scroll">
              <div class="al-pane-body" data-testid="al-regulations">
                <ul class="al-regs">
                  {#each regulationsStore.stamps.filter(s => ['basis','loads','wind','snow','seismic'].includes(s.role)) as st (st.role)}
                    <li>
                      <span class="al-reg-role">{t(`regulations.role.${st.role}`)}</span>
                      <span class="al-reg-name">{te(st.label)}</span>
                      <span class="al-reg-state al-state-{st.state}">{t(`regulations.state.${st.state}`)}</span>
                    </li>
                  {/each}
                </ul>
                {#if regulationsStore.pendingNeedsLoadRegeneration}
                  <p class="al-warn" data-testid="al-pending-banner">{t('autoLoad.pendingRegulation')}</p>
                {/if}
                <p class="al-hint">{t('autoLoad.regulationsHint')}
                  <button class="al-link" onclick={() => { proNav.openRegulations(); onclose(); }}>{t('autoLoad.openRegulations')}</button></p>
              </div>
            </div>

          {:else if section === 'dead'}
            <div class="al-pane-head">
              <h3><span class="al-head-sym">D</span>{t('autoLoad.deadLoads')}</h3>
              <span class="al-sec-code">{codeHead('loads', 'dead')}</span>
              <span class="al-sec-value" data-testid="dead-total">{aq(totalDead)}</span>
            </div>
            <div class="al-pane-scroll" data-testid="al-dead-section">
              <div class="al-pane-body"><ProDeadLoadBuilder bind:rows={deadRows} liveLo={occupancyQ} /></div>
            </div>

          {:else if section === 'live'}
            <div class="al-pane-head">
              <h3><span class="al-head-sym">L</span>{t('autoLoad.liveLoads')}</h3>
              <span class="al-sec-code">{codeHead('loads', 'live')}</span>
              <span class="al-sec-value">{aq(occupancyQ)}</span>
            </div>
            <div class="al-pane-scroll" data-testid="al-live-section">
              <div class="al-pane-body">
                <label class="al-field"><span class="al-label">{t('loads.cirsoc101.occupancy')}</span>
                  <select bind:value={selectedOccupancy} data-testid="al-occupancy">
                    {#each OCCUPANCY_TABLE_2025 as occ}
                      <option value={occ.key}>{t(occ.labelKey)}{occ.uniformKNm2 !== null ? ` · ${aq(occ.uniformKNm2)}` : ''}</option>
                    {/each}
                  </select>
                </label>
                <div class="al-sub">
                  <span class="al-sub-title">{t('autoLoad.live.reductionTitle')}</span>
                  <label class="al-check">
                    <input type="checkbox" bind:checked={applyLiveReduction} data-testid="al-live-reduction" />
                    {t('autoLoad.applyLiveReduction')}
                  </label>
                  {#if applyLiveReduction}
                    <div class="al-grid">
                      <label class="al-field"><span class="al-label">{t('autoLoad.reductionElement')}</span>
                        <select bind:value={reductionElementKind} data-testid="al-elemkind">
                          {#each ['interiorColumn','exteriorColumnNoCantilever','edgeColumnWithCantilever','cornerColumnWithCantilever','edgeBeamNoCantilever','interiorBeam','other'] as k (k)}
                            <option value={k}>{t(`autoLoad.elementKind.${k}`)}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.floorsSupported')}</span>
                        <input type="number" step="1" min="1" bind:value={floorsSupported} data-testid="al-floors" />
                      </label>
                    </div>
                  {/if}
                </div>
                <div class="al-sub">
                  <span class="al-sub-title">{t('autoLoad.patterns')}</span>
                  <label class="al-field"><span class="al-label">{t('autoLoad.patternsMode')}</span>
                    <select bind:value={livePatterns} data-testid="al-live-patterns">
                      <option value="all">{t('autoLoad.patterns.all')}</option>
                      <option value="checkerboard">{t('autoLoad.patterns.checkerboard')}</option>
                      <option value="none">{t('autoLoad.patterns.none')}</option>
                    </select>
                  </label>
                  <p class="al-hint">{t('autoLoad.patternsHint')}</p>
                </div>
              </div>
            </div>

          {:else if section === 'roof'}
            <div class="al-pane-head">
              <label class="al-check al-head-toggle"><input type="checkbox" bind:checked={roofCfg.enabled} data-testid="al-roof" />
                <span class="al-pane-title"><span class="al-head-sym">Lr</span>{t('autoLoad.roof.title')}</span></label>
              <span class="al-sec-code">{codeHead('loads', 'roof')}</span>
              {#if lrNow}<span class="al-sec-value" data-testid="al-roof-lr">Lr {toQ(lrNow.lo, 'areaLoad').toFixed(2)}–{aq(lrNow.hi)}</span>{/if}
            </div>
            <div class="al-pane-scroll">
              {#if roofCfg.enabled}
                <ProRoofLoadSection bind:config={roofCfg} floorDead={totalDead} modelSlopeDeg={snowRoof?.slopeDeg ?? windRoofSlope} autoWeight={planRoofWeight} />
              {:else}
                <div class="al-pane-body"><p class="al-hint">{t('autoLoad.roof.off')}</p></div>
              {/if}
            </div>

          {:else if section === 'wind'}
            <div class="al-pane-head">
              <label class="al-check al-head-toggle"><input type="checkbox" bind:checked={enableWind} disabled={!windAvailable} data-testid="al-enable-wind" />
                <span class="al-pane-title"><span class="al-head-sym">W</span>{t('autoLoad.wind')}</span></label>
              <span class="al-sec-code">{te(bindingLabel(regulationsStore.binding('wind')))}</span>
            </div>
            <div class="al-pane-scroll" data-testid="al-wind-section">
              <div class="al-pane-body">
                {#if !windAvailable}
                  <p class="al-warn" data-testid="al-wind-unavailable">
                    {t('autoLoad.windNeedsRole')}
                    <button class="al-link" data-testid="al-goto-regulations-wind"
                            onclick={() => { proNav.openRegulations(); onclose(); }}>{t('autoLoad.openRegulations')}</button>
                  </p>
                {:else if !enableWind}
                  <p class="al-hint">{t('autoLoad.wind.off')}</p>
                {:else}
                  <div class="al-sub">
                    <span class="al-sub-title">{t('autoLoad.wind.siteTitle')}</span>
                    <!-- Both editions are named; one without its text is shown and cannot be chosen. -->
                    <label class="al-field" data-testid="al-wind-edition">
                      <span class="al-label">{t('autoLoad.windEdition')}</span>
                      <select value={regulationsStore.binding('wind').adapterId ?? ''}
                        onchange={(e) => regulationsStore.requestChange('wind', e.currentTarget.value)}>
                        {#each windEditions as o (o.adapterId)}
                          <option value={o.adapterId} disabled={!optionIsAvailable(o)}>
                            {te(optionLabel(o))}{optionIsAvailable(o) ? '' : ` · ${t('autoLoad.editionNoText')}`}
                          </option>
                        {/each}
                      </select>
                    </label>
                    {#if windEditions.some((o) => !optionIsAvailable(o))}<p class="al-hint">{t('autoLoad.windEditionHint')}</p>{/if}
                    <div class="al-grid">
                      <label class="al-field"><span class="al-label">{t('autoLoad.windSpeed')}</span>
                        <QuantityInput bind:value={windV} quantity="speed" min={10} max={120} testid="al-wind-speed" wrap="al-unit-field" />
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.windExposure')}</span>
                        <select bind:value={windExposure}>
                          <option value="B">B · {t('autoLoad.windExpB')}</option>
                          <option value="C">C · {t('autoLoad.windExpC')}</option>
                          <option value="D">D · {t('autoLoad.windExpD')}</option>
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.windEnclosure')}</span>
                        <select bind:value={windEnclosure} data-testid="al-wind-enclosure">
                          {#each ['enclosed','partiallyEnclosed','partiallyOpen','open'] as e (e)}
                            <option value={e}>{t(`loads.cirsoc102.enclosure.${e}`)}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.windAltitude')}</span>
                        <QuantityInput bind:value={windAltitude} quantity="length" min={0} testid="al-wind-altitude" wrap="al-unit-field" />
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.windRoofSlope')}</span>
                        <span class="al-unit-field"><input type="number" bind:value={windRoofSlope} min={0} max={90} step={1} data-testid="al-wind-slope" /><span>°</span></span>
                      </label>
                      <div class="al-field">
                        <label class="al-check"><input type="checkbox" bind:checked={windKztSurveyed} data-testid="al-wind-kzt-surveyed" /> {t('autoLoad.windKztSurveyed')}</label>
                        {#if windKztSurveyed}
                          <span class="al-unit-field"><input type="number" bind:value={windKzt} min={1} step={0.05} data-testid="al-wind-kzt" aria-label="Kzt" /><span>Kzt</span></span>
                        {/if}
                      </div>
                    </div>
                    <ProWindDynamics bind:dynamics={windDyn} gust={planGust} modal={windModal} lowRise={windLowRise} />
                    <!-- Where it acts, and a profile of the user's in place of the code's pressures. -->
                    <ProActionRegion bind:region={windRegion} testid="al-wind-region" />
                    <label class="al-check"><input type="checkbox" bind:checked={windProfileOn} data-testid="al-wind-profile-on" /> {t('windProfile.use')}</label>
                    {#if windProfileOn}
                      <textarea class="al-profile" rows="5" bind:value={windProfileText} placeholder="z (m); p (kPa)" data-testid="al-wind-profile-text"></textarea>
                      {#if windProfile}<ProfileChart points={windProfile} />{:else}<p class="al-hint">{t('windProfile.bad')}</p>{/if}
                      <p class="al-hint">{t('windProfile.hint')}</p>
                    {/if}
                  </div>
                  <ProWindCasesPanel
                    bind:caseSet={windCaseSet} bind:directions={windDirs} bind:enclosure={windEnclosure}
                    bind:service={windService}
                    speed={windV} exposure={windExposure} altitude={windAltitude}
                    kzt={windKztSurveyed ? windKzt : 1}
                    elevations={levelsWithPlanArea({ nodes: modelStore.nodes } as never).map((l) => l.elevation)}
                  />
                  <ProWindStructure bind:config={windStructure} />
                  {#if windStructure.kind === 'building'}
                    <ProWindCladding speed={windV} exposure={windExposure} altitude={windAltitude}
                      kzt={windKztSurveyed ? windKzt : 1} enclosure={windEnclosure}
                      height={modelExtent.h} leastDimension={modelExtent.least} roofSlopeDeg={snowRoof?.slopeDeg ?? windRoofSlope}
                      roofHint={snowCfg.roofKind === 'mono' ? 'monoslope' : snowCfg.roofKind === 'multiple' ? 'sawtooth' : 'gable'} />
                  {/if}
                {/if}
              </div>
            </div>

          {:else if section === 'snow'}
            <div class="al-pane-head">
              <label class="al-check al-head-toggle"><input type="checkbox" bind:checked={snowCfg.enabled} disabled={!snowAvailable} data-testid="al-enable-snow" />
                <span class="al-pane-title"><span class="al-head-sym">S</span>{t('autoLoad.snow')}</span></label>
              <span class="al-sec-code">{codeHead('snow')}</span>
              {#if snowNow && !snowNow.refused}<span class="al-sec-value">{snowCfg.roofKind === 'curved' || snowCfg.roofKind === 'multiple' || snowCfg.roofKind === 'dome' ? `pf = ${aq(snowNow.pf, 3)}` : `ps = ${aq(snowNow.ps, 3)}`}</span>{/if}
            </div>
            <div class="al-pane-scroll">
              {#if !snowAvailable}
                <div class="al-pane-body"><p class="al-warn">{t('autoLoad.snowNeedsRole')}</p></div>
              {:else if !snowCfg.enabled}
                <div class="al-pane-body" data-testid="al-snow-section"><p class="al-hint">{t('autoLoad.snow.off')}</p></div>
              {:else}
                <ProSnowSection bind:config={snowCfg} roof={snowRoof} />
                <ProActionRegion bind:region={snowRegion} testid="al-snow-roof" />
                <p class="al-hint">{t('snowRoof.hint')}</p>
              {/if}
            </div>

          {:else if section === 'seismic'}
            <div class="al-pane-head">
              <label class="al-check al-head-toggle"><input type="checkbox" bind:checked={enableSeismic} disabled={!seismicAvailable} data-testid="al-enable-seismic" />
                <span class="al-pane-title"><span class="al-head-sym">E</span>{t('autoLoad.seismic')}</span></label>
              <span class="al-sec-code">{te(bindingLabel(regulationsStore.binding('seismic')))}</span>
            </div>
            <div class="al-pane-scroll" data-testid="al-seismic-section">
              <div class="al-pane-body">
                {#if !seismicAvailable}
                  <!-- Why it is disabled, and where to fix it. -->
                  <p class="al-warn" data-testid="al-seismic-unavailable">
                    {t('autoLoad.seismicNeedsRole')}
                    <button class="al-link" data-testid="al-goto-regulations"
                            onclick={() => { proNav.openRegulations(); onclose(); }}>{t('autoLoad.openRegulations')}</button>
                  </p>
                {:else if !enableSeismic}
                  <p class="al-hint">{t('autoLoad.seismic.off')}</p>
                {:else}
                  <div class="al-sub">
                    <span class="al-sub-title">{t('autoLoad.seismic.siteTitle')}</span>
                    <div class="al-grid">
                      <label class="al-field"><span class="al-label">{t('autoLoad.zone')}</span>
                        <select bind:value={seismicZone} data-testid="al-zone">
                          <option value={4}>4 · {t('autoLoad.zoneVeryHigh')}</option>
                          <option value={3}>3 · {t('autoLoad.zoneHigh')}</option>
                          <option value={2}>2 · {t('autoLoad.zoneModerate')}</option>
                          <option value={1}>1 · {t('autoLoad.zoneLow')}</option>
                          <option value={0}>0 · {t('autoLoad.zoneNone')}</option>
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.site')}</span>
                        <select bind:value={siteClass} data-testid="al-site">
                          {#each ['SA', 'SB', 'SC', 'SD', 'SE', 'SF'] as const as k (k)}<option value={k}>{k} · {t(`autoLoad.soil${k}`)}</option>{/each}
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.importance')}</span>
                        <select bind:value={destinationGroup} data-testid="al-group">
                          <option value="Ao">Ao (γr = {RISK_FACTOR.Ao}) · {t('autoLoad.impEssential')}</option>
                          <option value="A">A (γr = {RISK_FACTOR.A}) · {t('autoLoad.impImportant')}</option>
                          <option value="B">B (γr = {RISK_FACTOR.B}) · {t('autoLoad.impNormal')}</option>
                          <option value="C">C (γr = {RISK_FACTOR.C}) · {t('autoLoad.impLow')}</option>
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.simultaneity')}</span>
                        <select bind:value={seismicOccupancy} data-testid="al-f1">
                          <option value="exceptional">{t('autoLoad.f1Exceptional')} · f1 = 0</option>
                          <option value="reduced">{t('autoLoad.f1Reduced')} · f1 = 0,25</option>
                          <option value="intermediate">{t('autoLoad.f1Intermediate')} · f1 = 0,50</option>
                          <option value="high">{t('autoLoad.f1High')} · f1 = 0,75</option>
                          <option value="full">{t('autoLoad.f1Full')} · f1 = 1,00</option>
                          <option value="other">{t('autoLoad.f1Other')} · f1 = 0,20</option>
                        </select>
                      </label>
                    </div>
                    <!-- What the zone and site imply, before anything is generated. -->
                    {#if isBlocked(spectrumPreview)}
                      <p class="al-warn" data-testid="al-spectrum-blocked">{te(spectrumPreview.blocked)}</p>
                    {:else}
                      <p class="al-readout" data-testid="al-spectrum">
                        {tp('autoLoad.spectrumLine', {
                          type: spectrumPreview.type, ca: spectrumPreview.ca.toFixed(3), cv: spectrumPreview.cv.toFixed(3),
                          t1: spectrumPreview.t1.toFixed(3), t2: spectrumPreview.t2.toFixed(3), t3: spectrumPreview.t3,
                        })}
                      </p>
                    {/if}
                  </div>
                  <div class="al-sub">
                    <span class="al-sub-title">{t('autoLoad.seismic.systemTitle')}</span>
                    <!--
                      Two different classifications, and they are not the same list: Tabla 5.1
                      says how ductile the system is (R), Tabla 6.2 says how stiff it is (Ta).
                    -->
                    <div class="al-grid">
                      <label class="al-field al-field-wide"><span class="al-label">{t('autoLoad.system')}</span>
                        <select bind:value={systemKey} data-testid="al-system">
                          {#each BEHAVIOUR_TABLE_2018 as sys (sys.key)}
                            <option value={sys.key}>{sys.row}. {t(sys.labelKey)}{sys.r !== null ? ` · R = ${sys.r}` : ` · ${t('autoLoad.rFormula')}`}</option>
                          {/each}
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.periodSystem')}</span>
                        <select bind:value={periodSystem} data-testid="al-period-system">
                          <option value="concreteMomentFrame">{t('autoLoad.sysRCFrame')}</option>
                          <option value="steelMomentFrame">{t('autoLoad.sysSteelFrame')}</option>
                          <option value="steelEccentricOrBRB">{t('autoLoad.sysSteelBraced')}</option>
                          <option value="other">{t('autoLoad.sysOther')}</option>
                        </select>
                      </label>
                      <label class="al-field"><span class="al-label">{t('autoLoad.regularity')}</span>
                        <select bind:value={regularity} data-testid="al-regularity">
                          <option value="regular">{t('autoLoad.regRegular')}</option>
                          <option value="medium">{t('autoLoad.regMedium')}</option>
                          <option value="irregular">{t('autoLoad.regIrregular')}</option>
                        </select>
                      </label>
                    </div>
                    <label class="al-check"><input type="checkbox" bind:checked={elasticDesign} data-testid="al-elastic" /> {t('autoLoad.elasticDesign')}</label>
                    {#if effectiveR === null}
                      <p class="al-warn" data-testid="al-no-r">{t('autoLoad.rFormulaWarning')}</p>
                    {/if}
                  </div>
                  <ProSeismicMethod bind:config={seismicMethod} />
                  <div class="al-row">
                    <span class="al-label">{t('autoLoad.seismicDirections')}</span>
                    <label class="al-check"><input type="checkbox" bind:checked={seismicDirectionX} data-testid="al-seismic-dir-x" /> X</label>
                    <label class="al-check"><input type="checkbox" bind:checked={seismicDirectionZ} data-testid="al-seismic-dir-y" /> Y</label>
                  </div>

                {/if}
              </div>
            </div>

          {:else if section === 'special'}
            <div class="al-pane-head">
              <h3><span class="al-head-sym">T·H·F</span>{t('autoLoad.special.title')}</h3>
              <span class="al-sec-code">{codeHead('basis', 'special')}</span>
            </div>
            <div class="al-pane-scroll"><ProSpecialLoadsSection bind:config={special} /></div>

          {:else if section === 'applying'}
            <div class="al-pane-head"><h3>{t('autoLoad.applying')}</h3></div>
            <div class="al-pane-scroll">
              <ProAutoLoadsApplying bind:mode={gravityMode} bind:slab={gravitySlab} bind:spanAxis={gravitySpan}
                bind:tributaryWidth {clearExisting} onClearChange={onClearExistingChange} />
            </div>

          {:else}
            <div class="al-pane-head">
              <label class="al-check al-head-toggle"><input type="checkbox" bind:checked={genCombos} data-testid="al-gen-combos" />
                <span class="al-pane-title">{t('autoLoad.genCombos')}</span></label>
              <span class="al-sec-code">{codeHead('basis', 'combinations')}</span>
            </div>
            <div class="al-pane-scroll">
              <ProAutoLoadsCombos generate={genCombos} bind:source={comboSource} bind:set={comboSet} bind:bothSenses bind:patternsInCompanions />
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="al-footer">
      <span class="al-summary" data-testid="al-summary">
        <span class="al-label">{t('autoLoad.summary')}</span>
        {#each willGenerate as sym (sym)}<span class="al-chip">{sym}</span>{/each}
        {#if genCombos}<span class="al-label">· {t('autoLoad.summaryCombos')}</span>{/if}
      </span>
      {#if applyError}
        <p class="al-error" role="alert" data-testid="al-apply-error">{applyError}</p>
      {/if}
      <button class="al-btn al-btn-secondary" onclick={onclose} data-testid="al-cancel">{t('report.cancel')}</button>
      {#if !plan}
        <button class="al-btn al-btn-primary" onclick={handlePreview} data-testid="al-preview-btn">{t('autoLoad.preview')}</button>
      {:else}
        <button class="al-btn al-btn-secondary" onclick={() => { plan = null; delta = null; }} data-testid="al-back">{t('autoLoad.back')}</button>
        <button class="al-btn al-btn-primary" onclick={handleApply}
                disabled={plan.outcome !== 'READY'} data-testid="al-apply">{t('autoLoad.apply')}</button>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  /*
   * One look for the whole dialog and the sections it hosts (dead load, wind cases, snow,
   * combinations): the actions down the left as the section selector lays its divisions out, the
   * chosen one on the right with its name, its regulation and what it comes to; fields carry their
   * label above; every control is one height. The rules are scoped to the dialog with :global so
   * the child components read the same ones.
   */
  .al-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
  }
  .al-dialog {
    background: var(--st-surface-2); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg, 8px);
    width: min(1040px, calc(100vw - 32px)); height: min(780px, 92vh); display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    font-family: var(--st-sans); font-size: 0.72rem; color-scheme: dark;
  }
  .al-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 10px; border-bottom: 1px solid var(--st-hair); }
  .al-header h2 { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--st-text); }
  .al-close { background: none; border: none; color: var(--st-text-3); font-size: 1.2rem; line-height: 1; cursor: pointer; }
  .al-close:hover { color: var(--st-text); }

  .al-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 228px minmax(0, 1fr); }

  /* ── Navigation ── */
  .al-nav { border-right: 1px solid var(--st-hair); overflow-y: auto; padding: 8px 0; display: flex; flex-direction: column; gap: 10px; }
  .al-nav-group { display: flex; flex-direction: column; }
  .al-nav-title {
    padding: 2px 14px 4px; font-family: var(--st-mono); font-size: 0.6rem; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--st-text-3);
  }
  .al-nav-item {
    display: grid; grid-template-columns: 2.6rem minmax(0, 1fr) auto; align-items: center; gap: 6px;
    padding: 6px 12px 6px 11px; background: none; border: none; border-left: 2px solid transparent;
    color: var(--st-text-2); font: inherit; text-align: left; cursor: pointer;
  }
  .al-nav-item:hover { background: var(--st-surface-3); color: var(--st-text); }
  .al-nav-item.active { background: var(--st-surface-3); color: var(--st-text); border-left-color: var(--st-accent); }
  .al-nav-item:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: -2px; }
  .al-nav-sym { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-3); }
  .al-nav-item:not(:has(.al-nav-sym)) .al-nav-label { grid-column: 1 / 3; }
  .al-nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-nav-status { font-family: var(--st-mono); font-size: 0.62rem; color: var(--st-value); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .al-nav-item.off .al-nav-status { color: var(--st-text-3); }
  .al-nav-item.off .al-nav-label { color: var(--st-text-3); }

  /* ── The chosen section ── */
  .al-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .al-pane-head { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 8px 16px; border-bottom: 1px solid var(--st-hair); }
  .al-pane-head h3, .al-pane-title { margin: 0; font-size: 0.8rem; font-weight: 600; color: var(--st-text); display: inline-flex; align-items: baseline; gap: 8px; }
  .al-head-sym { font-family: var(--st-mono); font-size: 0.7rem; font-weight: 400; color: var(--st-text-3); }
  .al-head-toggle { gap: 8px; }
  .al-pane-scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .al-dialog :global(.al-pane-body) { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px 16px; }
  .al-dialog :global(.al-sec-code) { color: var(--st-text-3); font-size: 0.66rem; }
  .al-dialog :global(.al-sec-value) { margin-left: auto; color: var(--st-value); font-family: var(--st-mono); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .al-dialog :global(.al-sub) { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px dashed var(--st-hair); }
  .al-dialog :global(.al-pane-body > .al-sub:first-child) { padding-top: 0; border-top: none; }
  .al-dialog :global(.al-sub-title) {
    font-family: var(--st-mono); font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--st-text-3);
  }

  /* ── Fields ── */
  .al-dialog :global(.al-grid) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
  .al-dialog :global(.al-field) { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .al-dialog :global(.al-field-wide) { grid-column: 1 / -1; }
  .al-dialog :global(.al-field-narrow) { max-width: 12rem; }
  .al-dialog :global(.al-label) { font-size: 0.66rem; color: var(--st-text-3); }
  .al-dialog :global(.al-row) { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; }
  .al-dialog :global(.al-check) { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; color: var(--st-text-2); }
  .al-dialog :global(.al-check input) { margin: 0; accent-color: var(--st-accent); }
  .al-dialog :global(.al-unit-field) { display: flex; align-items: center; gap: 6px; color: var(--st-text-3); }
  .al-dialog :global(.al-unit-field input) { flex: 1; min-width: 0; }
  .al-dialog :global(select),
  .al-dialog :global(input[type='number']),
  .al-dialog :global(input[type='text']) {
    box-sizing: border-box; height: 26px; width: 100%; padding: 0 6px;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    font-family: var(--st-sans); font-size: 0.72rem;
  }
  .al-dialog :global(input[type='number']) { font-family: var(--st-mono); text-align: right; }
  .al-dialog :global(select:focus-visible), .al-dialog :global(input:focus-visible) { outline: 2px solid var(--st-interactive); outline-offset: 0; }
  .al-dialog :global(select:disabled), .al-dialog :global(input:disabled) { opacity: 0.5; }

  /* ── Text ── */
  .al-dialog :global(.al-hint) { margin: 0; font-size: 0.64rem; line-height: 1.45; color: var(--st-text-3); }
  .al-dialog :global(.al-warn) {
    margin: 0; padding: 5px 8px; border-left: 2px solid var(--st-warn); background: var(--st-surface-3);
    border-radius: 0 var(--st-radius) var(--st-radius) 0; color: var(--st-text); font-size: 0.68rem; line-height: 1.45;
  }
  .al-dialog :global(.al-error) {
    margin: 0; padding: 5px 8px; border-left: 2px solid var(--st-danger); background: var(--st-surface-3);
    border-radius: 0 var(--st-radius) var(--st-radius) 0; color: var(--st-text); font-size: 0.68rem; line-height: 1.45;
  }
  .al-dialog :global(.al-readout) {
    margin: 0; padding: 6px 8px; background: var(--st-surface-3); border-radius: var(--st-radius);
    font-family: var(--st-mono); font-size: 0.66rem; line-height: 1.55; color: var(--st-text-2); font-variant-numeric: tabular-nums;
  }
  .al-dialog :global(.al-link) { background: none; border: none; padding: 0; color: var(--st-text); text-decoration: underline; font: inherit; cursor: pointer; }
  .al-dialog :global(.al-link:disabled) { opacity: 0.45; cursor: default; }
  .al-dialog :global(details > summary) { cursor: pointer; color: var(--st-text-2); }
  .al-dialog :global(details[open] > summary) { margin-bottom: 6px; }
  .al-dialog :global(.al-btn-sm) {
    height: 26px; padding: 0 10px; background: none; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    color: var(--st-text-2); font: inherit; cursor: pointer; white-space: nowrap;
  }
  .al-dialog :global(.al-btn-sm:hover:not(:disabled)) { color: var(--st-text); border-color: var(--st-accent); }
  .al-dialog :global(.al-btn-sm:disabled) { opacity: 0.45; cursor: not-allowed; }

  /* ── Regulations ── */
  .al-regs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .al-regs li { display: flex; gap: 8px; align-items: center; }
  .al-reg-role { min-width: 10rem; color: var(--st-text-3); }
  .al-reg-name { flex: 1; color: var(--st-text-2); }
  .al-reg-state { font-size: 0.62rem; padding: 1px 6px; border-radius: 3px; background: var(--st-surface-3); color: var(--st-text-2); }
  .al-state-stale { background: var(--st-accent); color: var(--st-text-on-accent, #fff); }

  /* ── Preview ── */
  .al-preview { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
  .al-preview p { margin: 0; }
  .al-delta { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .al-delta th, .al-delta td { border-bottom: 1px solid var(--st-hair); padding: 3px 6px; text-align: right; }
  .al-delta th { color: var(--st-text-3); font-weight: 500; }
  .al-delta th:first-child, .al-delta td:first-child { text-align: left; }
  .al-list { margin: 0.2rem 0 0; padding-left: 1.1rem; }
  .al-lossy { color: var(--st-text-2); }

  /* ── Footer ── */
  .al-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--st-hair); }
  .al-summary { margin-right: auto; display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; min-width: 0; }
  .al-chip { font-family: var(--st-mono); font-size: 0.64rem; padding: 1px 6px; border-radius: 3px; background: var(--st-surface-3); color: var(--st-text-2); }
  .al-footer > .al-error { max-width: 40%; }
  .al-btn { height: 30px; padding: 0 16px; border-radius: var(--st-radius); font: inherit; font-size: 0.74rem; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
  .al-btn-primary { background: var(--st-accent); color: var(--st-text-on-accent, #fff); }
  .al-btn-primary:hover:not(:disabled) { background: var(--st-accent-hover, var(--st-accent)); }
  .al-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .al-btn-secondary { background: none; border-color: var(--st-hair-strong); color: var(--st-text-2); }
  .al-btn-secondary:hover { color: var(--st-text); border-color: var(--st-text-3); }

  /* A narrow screen: the actions become a row over the section. */
  @media (max-width: 720px) {
    .al-dialog { height: 92vh; }
    .al-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .al-nav { flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: none; border-bottom: 1px solid var(--st-hair); padding: 4px; gap: 4px; }
    .al-nav-group { flex-direction: row; }
    .al-nav-title { display: none; }
    .al-nav-item { display: flex; border-left: none; border-bottom: 2px solid transparent; white-space: nowrap; padding: 6px 8px; }
    .al-nav-item.active { border-bottom-color: var(--st-accent); }
    .al-nav-status { display: none; }
    .al-dialog :global(.al-grid) { grid-template-columns: minmax(0, 1fr); }
    .al-summary { display: none; }
  }
  .al-profile { width: 100%; font-family: var(--st-mono); font-size: 0.68rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 3px; }
</style>
