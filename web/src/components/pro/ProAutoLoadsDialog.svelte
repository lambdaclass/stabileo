<script lang="ts">
  import { untrack } from 'svelte';
  import { expandCombinations } from '../../lib/engine/loads/combination-cases';
  import { addGeneratedCombinations } from '../../lib/store/generated-combinations';
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
  import ProAutoLoadsCombos, { type ComboSource } from './ProAutoLoadsCombos.svelte';
  import { ruleToSpec } from '../../lib/engine/loads/combination-rules';
  import { defaultSnowConfig, snowPg, type SnowConfig } from '../../lib/engine/loads/snow-config';
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
    designSpectrum, isBlocked, RISK_FACTOR,
    type SeismicZone, type SiteClass, type DestinationGroup, type OccupancyProbability,
  } from '../../lib/codes/cirsoc103/spectrum';
  import { BEHAVIOUR_TABLE_2018, findBehaviour, R_ELASTIC } from '../../lib/codes/cirsoc103/behaviour';
  import type { PeriodSystem, PlanRegularity } from '../../lib/codes/cirsoc103/static-method';

  /** Which load the reader came in to define. */
  export type AutoLoadFocus = 'dead' | 'live' | 'wind' | 'snow' | 'seismic' | 'combos';

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
  let windRigid = $state(true);
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
  /** Loads, or combinations: two tabs, one Preview and Apply for both. */
  let tab = $state<'loads' | 'combos'>('loads');
  let clearExisting = $state(false);

  /* The fieldsets, so a focused open can bring one into view. */
  let windFieldset = $state<HTMLElement | null>(null);
  let seismicFieldset = $state<HTMLElement | null>(null);
  let snowFieldset = $state<HTMLElement | null>(null);
  let deadFieldset = $state<HTMLElement | null>(null);
  let liveFieldset = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open || !focus) return;
    tab = focus === 'combos' ? 'combos' : 'loads';
    if (focus === 'combos') return;
    /* Turning the section ON is the point: arriving at a disabled wind block from a
       row that says "W" is arriving nowhere. */
    if (focus === 'wind' && windAvailable) enableWind = true;
    if (focus === 'seismic' && seismicAvailable) enableSeismic = true;
    if (focus === 'snow' && snowAvailable) snowCfg.enabled = true;
    const el = focus === 'wind' ? windFieldset
      : focus === 'snow' ? snowFieldset
      : focus === 'seismic' ? seismicFieldset
      : focus === 'live' ? liveFieldset
      : deadFieldset;
    el?.scrollIntoView({ block: 'start' });
  });

  /** The plan is built first and applied only after the user confirms. */
  let plan = $state<LoadPlan | null>(null);
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

  function planInput(): LoadPlanInput {
    return {
      regulations: regulationsStore.roles,
      model: {
        nodes: modelStore.nodes as never,
        elements: modelStore.elements as never,
        sections: modelStore.model.sections as never,
        materials: modelStore.model.materials as never,
        loadCases: modelStore.model.loadCases,
      },
      dead: deadComponents.map(d => ({ labelKey: d.labelKey, q: d.q })),
      occupancyKey: selectedOccupancy,
      tributaryWidth,
      reductionElementKind,
      floorsSupported,
      applyLiveReduction,
      wind: enableWind ? {
        enabled: true, basicSpeed: windV, exposure: windExposure,
        enclosure: windEnclosure, siteAltitudeM: windAltitude,
        kzt: windKzt, kztSurveyed: windKztSurveyed,
        roofSlopeDeg: windRoofSlope, rigid: windRigid,
        directions: { x: windDirs.some((d) => d.endsWith('x')), y: windDirs.some((d) => d.endsWith('y')) },
        caseSet: windCaseSet, senses: [...windDirs],
        service: windService.enabled ? { ...windService } : undefined,
      } : undefined,
      snow: snowCfg.enabled ? {
        enabled: true, ...snowPg(snowCfg),
        terrain: snowCfg.terrain, exposure: snowCfg.exposure, thermal: snowCfg.thermal,
        category: snowCfg.category, roofKind: snowCfg.roofKind, slippery: snowCfg.slippery,
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
    }, true);
    if (enableWind) {
      regulationsStore.configureRole('wind', {
        basicSpeed: windV, exposure: windExposure, enclosure: windEnclosure,
        siteAltitudeM: windAltitude, kzt: windKzt, kztSurveyed: windKztSurveyed,
        roofSlopeDeg: windRoofSlope, rigid: windRigid,
      }, true);
    }
    if (snowCfg.enabled) {
      regulationsStore.configureRole('snow', { ...$state.snapshot(snowCfg) }, true);
    }
    if (enableSeismic) {
      regulationsStore.configureRole('seismic', {
        zone: seismicZone, site: siteClass, destinationGroup, systemKey,
        periodSystem, regularity, occupancy: seismicOccupancy, elastic: elasticDesign,
      }, true);
    }
  }

  /** Step 1 — build the preview. Pure; the model is untouched. */
  function handlePreview() {
    applyError = null;
    recordRoleConfiguration();
    const p = buildLoadPlan(planInput());
    plan = p;
    // The flag has to go in: the same plan produces a different model depending on it, and
    // reporting the plan's own counts as "after" was the defect the audit caught.
    delta = describePlanDelta(p, currentLoadState(), { replaceExisting: clearExisting, bothSenses: { E: bothSenses } });
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
    return {
      distributed: count(DISTRIBUTED_TYPES),
      nodal: count(NODAL_TYPES),
      combinations: modelStore.model.combinations.length,
      caseTypes: modelStore.model.loadCases.map(c => c.type),
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
      delta = describePlanDelta(plan, currentLoadState(), { replaceExisting: next, bothSenses: { E: bothSenses } });
    }
  }

  /**
   * Both senses of the earthquake change how many combinations Apply adds: the preview follows.
   * The checkbox lives in ProAutoLoadsCombos (bound), so the change is watched here.
   */
  $effect(() => {
    const both = bothSenses;
    untrack(() => {
      if (plan && plan.outcome === 'READY') {
        delta = describePlanDelta(plan, currentLoadState(), { replaceExisting: clearExisting, bothSenses: { E: both } });
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

    if (clearExisting) {
      for (const id of modelStore.loads.map(l => l.data.id)) modelStore.removeLoad(id);
      for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
    }

    // Resolve every planned case to a real id, creating only what is missing. A case the plan
    // has no match for is still reused when one of the same type already carries its name, so
    // applying twice does not duplicate the wind cases of Fig. 2.4-8.
    const caseIds: number[] = [];
    const caseIdByType = new Map<string, number[]>();
    for (const pc of p.cases) {
      const name = tp(pc.nameKey, pc.nameParams);
      const id = modelStore.ensureLoadCase(name, pc.type, { existingId: pc.existingId, alternatives: pc.alternatives });
      caseIds.push(id);
      const list = caseIdByType.get(pc.type) ?? [];
      list.push(id);
      caseIdByType.set(pc.type, list);
    }
    const caseOf = (type: string, index?: number) =>
      index !== undefined ? caseIds[index] : caseIdByType.get(type)?.[0];

    for (const d of p.distributed) {
      const id = caseOf(d.caseType, d.caseIndex);
      if (id === undefined) continue;
      modelStore.addDistributedLoad3D(d.elementId, 0, 0, d.q, d.q, undefined, undefined, id);
    }

    for (const n of p.nodal) {
      const id = caseOf(n.caseType, n.caseIndex);
      if (id === undefined) continue;
      modelStore.addNodalLoad3D(n.nodeId, n.fx, n.fy, n.fz, 0, 0, n.mz ?? 0, id);
    }

    // One combination per wind or seismic direction, never both directions in one.
    const planned = [...caseIdByType].flatMap(([type, ids]) => ids.map((id) => {
      const lc = modelStore.model.loadCases.find((c) => c.id === id);
      return { id, type, name: lc?.name ?? type, ...(lc?.alternatives ? { alternatives: lc.alternatives } : {}) };
    }));
    // Wind from −X and −Y is generated as cases of its own (`wind-cases.ts`); earthquake is
    // reversed by the sign in the combination.
    addGeneratedCombinations(expandCombinations(p.combinations, planned, { bothSenses: { E: bothSenses } }));

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
</script>

{#if open}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="al-overlay" onkeydown={handleKeydown} onclick={onclose} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="al-dialog" onclick={(e) => e.stopPropagation()}>
    <div class="al-header">
      <h2>{t('autoLoad.title')}</h2>
      <button class="al-close" onclick={onclose}>&times;</button>
    </div>

    <div class="al-tabs" role="tablist">
      {#each [['loads', 'autoLoad.tabLoads'], ['combos', 'autoLoad.tabCombos']] as const as [k, key] (k)}
        <button role="tab" class="al-tab" class:on={tab === k} aria-selected={tab === k} onclick={() => (tab = k)} data-testid="al-tab-{k}">{t(key)}</button>
      {/each}
    </div>

    <div class="al-body">
      {#if tab === 'combos'}
        <ProAutoLoadsCombos bind:generate={genCombos} bind:source={comboSource} bind:set={comboSet} bind:bothSenses />
      {:else}
      <!-- Which regulations these loads come from. Selection lives in Project
           Regulations; this surface states what is bound and whether it is pending. -->
      <section class="al-sec" data-testid="al-regulations">
        <div class="al-sec-head"><span class="al-sec-title">{t('autoLoad.appliedRegulations')}</span></div>
        <div class="al-sec-body">
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
        </div>
      </section>

      <!-- Dead loads: the build-up, from Tabla 3.1. -->
      <section class="al-sec" bind:this={deadFieldset} data-testid="al-dead-section">
        <div class="al-sec-head">
          <span class="al-sec-title">{t('autoLoad.deadLoads')}</span>
          <span class="al-sec-value" data-testid="dead-total">{totalDead.toFixed(2)} kN/m²</span>
        </div>
        <div class="al-sec-body">
          <ProDeadLoadBuilder bind:rows={deadRows} liveLo={occupancyQ} />
        </div>
      </section>

      <!-- Live loads: the occupancy, and the reduction by tributary area that goes with it. -->
      <section class="al-sec" bind:this={liveFieldset} data-testid="al-live-section">
        <div class="al-sec-head">
          <span class="al-sec-title">{t('autoLoad.liveLoads')}</span>
          <span class="al-sec-value">{occupancyQ} kN/m²</span>
        </div>
        <div class="al-sec-body">
          <label class="al-field"><span class="al-label">{t('loads.cirsoc101.occupancy')}</span>
            <select bind:value={selectedOccupancy} data-testid="al-occupancy">
              {#each OCCUPANCY_TABLE_2025 as occ}
                <option value={occ.key}>{t(occ.labelKey)}{occ.uniformKNm2 !== null ? ` · ${occ.uniformKNm2} kN/m²` : ''}</option>
              {/each}
            </select>
          </label>
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
      </section>

      <!-- Wind -->
      <section class="al-sec" class:off={!enableWind} bind:this={windFieldset} data-testid="al-wind-section">
        <div class="al-sec-head">
          <label class="al-check al-sec-title">
            <input type="checkbox" bind:checked={enableWind} disabled={!windAvailable} data-testid="al-enable-wind" />
            {t('autoLoad.wind')}
          </label>
          <span class="al-sec-code">{te(bindingLabel(regulationsStore.binding('wind')))}</span>
        </div>
        {#if !windAvailable}
          <div class="al-sec-body">
            <p class="al-warn" data-testid="al-wind-unavailable">
              {t('autoLoad.windNeedsRole')}
              <button class="al-link" data-testid="al-goto-regulations-wind"
                      onclick={() => { proNav.openRegulations(); onclose(); }}>{t('autoLoad.openRegulations')}</button>
            </p>
          </div>
        {:else if enableWind}
          <div class="al-sec-body">
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
                <span class="al-unit-field"><input type="number" bind:value={windV} min={10} max={120} step={1} data-testid="al-wind-speed" /><span>m/s</span></span>
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
                <span class="al-unit-field"><input type="number" bind:value={windAltitude} min={0} step={10} data-testid="al-wind-altitude" /><span>m</span></span>
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
            <label class="al-check"><input type="checkbox" bind:checked={windRigid} data-testid="al-wind-rigid" /> {t('autoLoad.windRigid')}</label>
            <ProWindCasesPanel
              bind:caseSet={windCaseSet} bind:directions={windDirs} bind:enclosure={windEnclosure}
              bind:service={windService}
              speed={windV} exposure={windExposure} altitude={windAltitude}
              kzt={windKztSurveyed ? windKzt : 1}
              elevations={levelsWithPlanArea({ nodes: modelStore.nodes } as never).map((l) => l.elevation)}
            />
          </div>
        {/if}
      </section>

      <div bind:this={snowFieldset}>
        <ProSnowSection bind:config={snowCfg} available={snowAvailable} roof={snowRoof} />
      </div>

      <!-- Seismic -->
      <section class="al-sec" class:off={!enableSeismic} bind:this={seismicFieldset} data-testid="al-seismic-section">
        <div class="al-sec-head">
          <label class="al-check al-sec-title">
            <input type="checkbox" bind:checked={enableSeismic} disabled={!seismicAvailable} data-testid="al-enable-seismic" />
            {t('autoLoad.seismic')}
          </label>
          <span class="al-sec-code">{te(bindingLabel(regulationsStore.binding('seismic')))}</span>
        </div>
        {#if !seismicAvailable}
          <!-- Why it is disabled, and where to fix it. -->
          <div class="al-sec-body">
            <p class="al-warn" data-testid="al-seismic-unavailable">
              {t('autoLoad.seismicNeedsRole')}
              <button class="al-link" data-testid="al-goto-regulations"
                      onclick={() => { proNav.openRegulations(); onclose(); }}>{t('autoLoad.openRegulations')}</button>
            </p>
          </div>
        {:else if enableSeismic}
          <div class="al-sec-body">
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
              <label class="al-field"><span class="al-label">{t('autoLoad.regularity')}</span>
                <select bind:value={regularity} data-testid="al-regularity">
                  <option value="regular">{t('autoLoad.regRegular')}</option>
                  <option value="medium">{t('autoLoad.regMedium')}</option>
                  <option value="irregular">{t('autoLoad.regIrregular')}</option>
                </select>
              </label>
              <!--
                Two different classifications, and they are not the same list: Tabla 5.1
                says how ductile the system is (R), Tabla 6.2 says how stiff it is (Ta).
              -->
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
            <div class="al-row">
              <span class="al-label">{t('autoLoad.seismicDirections')}</span>
              <label class="al-check"><input type="checkbox" bind:checked={seismicDirectionX} data-testid="al-seismic-dir-x" /> X</label>
              <label class="al-check"><input type="checkbox" bind:checked={seismicDirectionZ} data-testid="al-seismic-dir-y" /> Y</label>
            </div>
            <label class="al-check"><input type="checkbox" bind:checked={elasticDesign} data-testid="al-elastic" /> {t('autoLoad.elasticDesign')}</label>

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
            {#if effectiveR === null}
              <p class="al-warn" data-testid="al-no-r">{t('autoLoad.rFormulaWarning')}</p>
            {/if}

            <!-- The seismic figures come from the PLAN, whose level masses are real. -->
            {#if seismicPreview}
              <div class="al-readout" data-testid="al-seismic-preview">
                <div>{tp('autoLoad.baseShear', { w: seismicPreview.W.toFixed(1), v: seismicPreview.V0.toFixed(1) })}</div>
                {#if plan?.seismic?.source === 'cirsoc103'}
                  <div data-testid="al-seismic-coefficient">
                    {tp('autoLoad.coefficientLine', {
                      c: plan.seismic.c.toFixed(4), t: (plan.seismic.t ?? 0).toFixed(3), ta: (plan.seismic.ta ?? 0).toFixed(3),
                      r: plan.seismic.r ?? 0, gammaR: plan.seismic.gammaR ?? 0,
                    })}
                  </div>
                  {#if plan.seismic.periodCapped}<p class="al-hint">{t('autoLoad.periodCapped')}</p>{/if}
                  {#if plan.seismic.floorApplied === 'nearFault'}<p class="al-hint">{t('autoLoad.floorNearFault')}</p>
                  {:else if plan.seismic.floorApplied === 'lowZone'}<p class="al-hint">{t('autoLoad.floorLowZone')}</p>{/if}
                  {#if plan.seismic.topHeavy}<p class="al-hint">{t('autoLoad.topHeavy')}</p>{/if}
                {/if}
                {#each seismicPreview.levels as lv (lv.elevation)}
                  <div>+{lv.elevation.toFixed(2)} m · Wi = {lv.weightKN.toFixed(1)} kN</div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <!-- How the loads go onto the model: the strip of slab each beam carries, and what
           happens to the loads already there. -->
      <section class="al-sec">
        <div class="al-sec-head"><span class="al-sec-title">{t('autoLoad.applying')}</span></div>
        <div class="al-sec-body">
          <label class="al-field al-field-narrow"><span class="al-label">{t('autoLoad.tributaryWidth')}</span>
            <span class="al-unit-field"><input type="number" step="0.5" min="0.1" bind:value={tributaryWidth} data-testid="al-trib" /><span>m</span></span>
          </label>
          <p class="al-hint">{t('autoLoad.tributaryHint')}</p>
          <label class="al-check"><input type="checkbox" checked={clearExisting} data-testid="al-clear"
            onchange={(e) => onClearExistingChange(e.currentTarget.checked)} /> {t('autoLoad.clearExisting')}</label>
        </div>
      </section>
      {/if}
    </div>

    {#if plan}
      <div class="al-preview" data-testid="al-preview">
        <h3>{t('autoLoad.previewTitle')}</h3>
        {#if plan.outcome === 'BLOCKED'}
          <p class="al-error" data-testid="al-blocked">{t('autoLoad.blocked')}</p>
          <ul class="al-list">
            <!-- Same class as the footing-issue crash: two blocked entries can share a key
                 and differ only in their params. -->
            {#each identifyMessages(plan.blockedKeys) as b (b.id)}<li>{te(b.message)}</li>{/each}
          </ul>
        {:else}
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
          <p><strong>{t('autoLoad.designLive')}:</strong> {plan.factors.liveReduced.value.toFixed(2)} kN/m²
            ({tp('autoLoad.fromTableLo', { lo: plan.factors.occupancy.value.toFixed(2) })})</p>
          {#if plan.factors.baseShear}
            <p data-testid="al-base-shear">{tp('autoLoad.baseShear', {
              w: (plan.factors.seismicWeight?.value ?? 0).toFixed(1),
              v: plan.factors.baseShear.value.toFixed(1) })}</p>
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
    {/if}

    <div class="al-footer">
      <button class="al-btn al-btn-secondary" onclick={onclose} data-testid="al-cancel">{t('report.cancel')}</button>
      {#if !plan}
        <button class="al-btn al-btn-primary" onclick={handlePreview} data-testid="al-preview-btn">{t('autoLoad.preview')}</button>
      {:else}
        <button class="al-btn al-btn-secondary" onclick={() => { plan = null; delta = null; }} data-testid="al-back">{t('autoLoad.back')}</button>
        <button class="al-btn al-btn-primary" onclick={handleApply}
                disabled={plan.outcome !== 'READY'} data-testid="al-apply">{t('autoLoad.apply')}</button>
      {/if}
    </div>
    {#if applyError}
      <p class="al-error" role="alert" data-testid="al-apply-error">{applyError}</p>
    {/if}
  </div>
</div>
{/if}

<style>
  /*
   * One look for the whole dialog and the sections it hosts (dead load, wind cases, snow,
   * combinations): each load is a card with its name, its regulation and what it comes to;
   * fields carry their label above; every control is one height. The rules are scoped to the
   * dialog with :global so the child components read the same ones, which is what the dialog
   * lacked: its classes were local, and the snow block and the wind cases, rendered by children,
   * fell back to the browser's controls.
   */
  .al-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;
  }
  .al-dialog {
    background: var(--st-surface-2); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius-lg, 8px);
    width: min(620px, calc(100vw - 32px)); max-height: 88vh; display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    font-family: var(--st-sans); font-size: 0.72rem; color-scheme: dark;
  }
  .al-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px 10px; }
  .al-header h2 { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--st-text); }
  .al-close { background: none; border: none; color: var(--st-text-3); font-size: 1.2rem; line-height: 1; cursor: pointer; }
  .al-close:hover { color: var(--st-text); }
  .al-tabs { display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--st-hair); }
  .al-tab {
    padding: 6px 12px; background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--st-text-3); font: inherit; font-size: 0.74rem; cursor: pointer; margin-bottom: -1px;
  }
  .al-tab:hover { color: var(--st-text); }
  .al-tab.on { color: var(--st-text); border-bottom-color: var(--st-accent); }
  .al-body { padding: 12px 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }

  /* ── Sections ── */
  .al-dialog :global(.al-sec) {
    border: 1px solid var(--st-hair); border-radius: var(--st-radius-lg, 8px); background: var(--st-surface);
  }
  .al-dialog :global(.al-sec-head) { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 6px 12px; }
  .al-dialog :global(.al-sec-title) { font-size: 0.76rem; font-weight: 600; color: var(--st-text); }
  .al-dialog :global(.al-sec-code) { color: var(--st-text-3); font-size: 0.66rem; }
  .al-dialog :global(.al-sec-value) { margin-left: auto; color: var(--st-value); font-family: var(--st-mono); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .al-dialog :global(.al-sec.off .al-sec-title) { color: var(--st-text-2); }
  .al-dialog :global(.al-sec-body) {
    display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid var(--st-hair);
  }
  .al-dialog :global(.al-sub) { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--st-hair); }
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
    margin: 0; padding: 6px 8px; background: var(--st-surface-2); border-radius: var(--st-radius);
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
  .al-regs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .al-regs li { display: flex; gap: 8px; align-items: center; }
  .al-reg-role { min-width: 7.5rem; color: var(--st-text-3); }
  .al-reg-name { flex: 1; color: var(--st-text-2); }
  .al-reg-state { font-size: 0.62rem; padding: 1px 6px; border-radius: 3px; background: var(--st-surface-3); color: var(--st-text-2); }
  .al-state-stale { background: var(--st-accent); color: var(--st-text-on-accent, #fff); }

  /* ── Preview ── */
  .al-preview { padding: 10px 16px; border-top: 1px solid var(--st-hair); max-height: 40vh; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
  .al-preview h3 { margin: 0; font-size: 0.78rem; font-weight: 600; }
  .al-preview p { margin: 0; }
  .al-delta { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .al-delta th, .al-delta td { border-bottom: 1px solid var(--st-hair); padding: 3px 6px; text-align: right; }
  .al-delta th { color: var(--st-text-3); font-weight: 500; }
  .al-delta th:first-child, .al-delta td:first-child { text-align: left; }
  .al-list { margin: 0.2rem 0 0; padding-left: 1.1rem; }
  .al-lossy { color: var(--st-text-2); }

  /* ── Footer ── */
  .al-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--st-hair); }
  .al-btn { height: 30px; padding: 0 16px; border-radius: var(--st-radius); font: inherit; font-size: 0.74rem; font-weight: 600; cursor: pointer; border: 1px solid transparent; }
  .al-btn-primary { background: var(--st-accent); color: var(--st-text-on-accent, #fff); }
  .al-btn-primary:hover:not(:disabled) { background: var(--st-accent-hover, var(--st-accent)); }
  .al-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .al-btn-secondary { background: none; border-color: var(--st-hair-strong); color: var(--st-text-2); }
  .al-btn-secondary:hover { color: var(--st-text); border-color: var(--st-text-3); }
  .al-dialog > .al-error { margin: 0 16px 12px; }
</style>
