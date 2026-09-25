<script lang="ts">
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
    buildLoadPlan, describePlanDelta, type LoadPlan, type LoadPlanInput, type PlanDelta,
  } from '../../lib/engine/loads/load-plan';
  import { OCCUPANCY_TABLE_2025 } from '../../lib/codes/cirsoc101/live-loads';
  import { findDeadEntry, deadComponentLoad } from '../../lib/codes/cirsoc101/dead-loads';
  import ProDeadLoadBuilder, { type DeadRow } from './ProDeadLoadBuilder.svelte';
  import type { ElementKind } from '../../lib/codes/cirsoc101/live-loads';
  import type { Enclosure, Exposure } from '../../lib/codes/cirsoc102/wind';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../lib/codes/roles';
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
  export type AutoLoadFocus = 'dead' | 'live' | 'wind' | 'seismic';

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
  let windDirX = $state(true);
  let windDirZ = $state(false);

  // ─── Options ───────────────────────────
  let genCombos = $state(true);
  /** Strength, service or both: strength by default, as the regulation's design needs. */
  let comboSet = $state<'ultimate' | 'service' | 'both'>('ultimate');
  let clearExisting = $state(false);

  /* The fieldsets, so a focused open can bring one into view. */
  let windFieldset = $state<HTMLElement | null>(null);
  let seismicFieldset = $state<HTMLElement | null>(null);
  let deadFieldset = $state<HTMLElement | null>(null);
  let liveFieldset = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open || !focus) return;
    /* Turning the section ON is the point: arriving at a disabled wind block from a
       row that says "W" is arriving nowhere. */
    if (focus === 'wind' && windAvailable) enableWind = true;
    if (focus === 'seismic' && seismicAvailable) enableSeismic = true;
    const el = focus === 'wind' ? windFieldset
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
        directions: { x: windDirX, y: windDirZ },
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
    delta = describePlanDelta(p, currentLoadState(), { replaceExisting: clearExisting });
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
      delta = describePlanDelta(plan, currentLoadState(), { replaceExisting: next });
    }
  }

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

    // Resolve every planned case to a real id, creating only what is missing.
    const caseIdByType = new Map<string, number[]>();
    for (const pc of p.cases) {
      let id = pc.existingId;
      if (id === null) id = modelStore.addLoadCase(tp(pc.nameKey, pc.nameParams), pc.type);
      const list = caseIdByType.get(pc.type) ?? [];
      list.push(id);
      caseIdByType.set(pc.type, list);
    }
    const firstOf = (type: string) => caseIdByType.get(type)?.[0];

    for (const d of p.distributed) {
      const id = firstOf(d.caseType);
      if (id === undefined) continue;
      modelStore.addDistributedLoad3D(d.elementId, 0, 0, d.q, d.q, undefined, undefined, id);
    }

    // Nodal loads carry a direction; W/E cases were planned per direction in order.
    const dirIndex = { W: 0, E: 0 } as Record<string, number>;
    for (const n of p.nodal) {
      const ids = caseIdByType.get(n.caseType) ?? [];
      if (ids.length === 0) continue;
      const useY = Math.abs(n.fy) > Math.abs(n.fx);
      const id = ids.length > 1 ? (useY ? ids[1] : ids[0]) : ids[0];
      dirIndex[n.caseType] = 0;
      modelStore.addNodalLoad3D(n.nodeId, n.fx, n.fy, n.fz, 0, 0, 0, id);
    }

    // One combination per wind or seismic direction, never both directions in one.
    const planned = [...caseIdByType].flatMap(([type, ids]) => ids.map((id) => ({
      id, type, name: modelStore.model.loadCases.find((c) => c.id === id)?.name ?? type,
    })));
    addGeneratedCombinations(expandCombinations(p.combinations, planned));

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

    <div class="al-body">
      <!-- Which regulations these loads come from. Selection lives in Project
           Regulations; this surface states what is bound and whether it is pending. -->
      <fieldset class="al-fieldset" data-testid="al-regulations">
        <legend>{t('autoLoad.appliedRegulations')}</legend>
        <ul class="al-regs">
          {#each regulationsStore.stamps.filter(s => ['basis','loads','wind','seismic'].includes(s.role)) as st (st.role)}
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
      </fieldset>

      <!-- Dead Loads -->
      <fieldset class="al-fieldset" bind:this={deadFieldset} data-testid="al-dead-section">
        <legend>{t('autoLoad.deadLoads')} ({totalDead.toFixed(2)} kN/m²)</legend>
        <ProDeadLoadBuilder bind:rows={deadRows} liveLo={occupancyQ} />
      </fieldset>

      <!-- Live Loads -->
      <fieldset class="al-fieldset" bind:this={liveFieldset} data-testid="al-live-section">
        <legend>{t('autoLoad.liveLoads')} ({occupancyQ} kN/m²)</legend>
        <select bind:value={selectedOccupancy} class="al-select">
          {#each OCCUPANCY_TABLE_2025 as occ}
            <option value={occ.key}>{t(occ.labelKey)}{occ.uniformKNm2 !== null ? ` — ${occ.uniformKNm2} kN/m²` : ''}</option>
          {/each}
        </select>
      </fieldset>

      <!-- Seismic -->
      <fieldset class="al-fieldset" bind:this={seismicFieldset} data-testid="al-seismic-section">
        <legend>
          <label class="al-check-legend">
            <input type="checkbox" bind:checked={enableSeismic}
                   disabled={!seismicAvailable} data-testid="al-enable-seismic" />
            {t('autoLoad.seismic')} ({te(bindingLabel(regulationsStore.binding('seismic')))})
          </label>
        </legend>
        {#if !seismicAvailable}
          <!-- Why it is disabled, and where to fix it. A disabled control with no
               explanation is the defect this whole repair exists to remove. -->
          <p class="al-warn" data-testid="al-seismic-unavailable">
            {t('autoLoad.seismicNeedsRole')}
            <button class="al-link" data-testid="al-goto-regulations"
                    onclick={() => { proNav.openRegulations(); onclose(); }}>
              {t('autoLoad.openRegulations')}
            </button>
          </p>
        {/if}
        {#if enableSeismic && seismicAvailable}
          <div class="al-grid">
            <div class="al-field">
              <label class="al-label">{t('autoLoad.zone')}</label>
              <select bind:value={seismicZone} class="al-select-sm">
                <option value={4}>4 — {t('autoLoad.zoneVeryHigh')}</option>
                <option value={3}>3 — {t('autoLoad.zoneHigh')}</option>
                <option value={2}>2 — {t('autoLoad.zoneModerate')}</option>
                <option value={1}>1 — {t('autoLoad.zoneLow')}</option>
                <option value={0}>0 — {t('autoLoad.zoneNone')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label" for="al-site">{t('autoLoad.site')}</label>
              <select id="al-site" bind:value={siteClass} class="al-select-sm" data-testid="al-site">
                <option value="SA">SA — {t('autoLoad.soilSA')}</option>
                <option value="SB">SB — {t('autoLoad.soilSB')}</option>
                <option value="SC">SC — {t('autoLoad.soilSC')}</option>
                <option value="SD">SD — {t('autoLoad.soilSD')}</option>
                <option value="SE">SE — {t('autoLoad.soilSE')}</option>
                <option value="SF">SF — {t('autoLoad.soilSF')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label" for="al-group">{t('autoLoad.importance')}</label>
              <select id="al-group" bind:value={destinationGroup} class="al-select-sm" data-testid="al-group">
                <option value="Ao">Ao (γr={RISK_FACTOR.Ao}) — {t('autoLoad.impEssential')}</option>
                <option value="A">A (γr={RISK_FACTOR.A}) — {t('autoLoad.impImportant')}</option>
                <option value="B">B (γr={RISK_FACTOR.B}) — {t('autoLoad.impNormal')}</option>
                <option value="C">C (γr={RISK_FACTOR.C}) — {t('autoLoad.impLow')}</option>
              </select>
            </div>
            <!--
              Two different classifications, and they are not the same list: Tabla 5.1
              says how ductile the system is (R), Tabla 6.2 says how stiff it is (Ta).
              A concrete frame is row 2 in one and `concreteMomentFrame` in the other,
              and collapsing them into one control would silently pick a row.
            -->
            <div class="al-field al-field-wide">
              <label class="al-label" for="al-system">{t('autoLoad.system')}</label>
              <select id="al-system" bind:value={systemKey} class="al-select-sm" data-testid="al-system">
                {#each BEHAVIOUR_TABLE_2018 as sys (sys.key)}
                  <option value={sys.key}>
                    {sys.row}. {t(sys.labelKey)}{sys.r !== null ? ` — R = ${sys.r}` : ` — ${t('autoLoad.rFormula')}`}
                  </option>
                {/each}
              </select>
            </div>
            <div class="al-field">
              <label class="al-label" for="al-period-system">{t('autoLoad.periodSystem')}</label>
              <select id="al-period-system" bind:value={periodSystem} class="al-select-sm" data-testid="al-period-system">
                <option value="concreteMomentFrame">{t('autoLoad.sysRCFrame')}</option>
                <option value="steelMomentFrame">{t('autoLoad.sysSteelFrame')}</option>
                <option value="steelEccentricOrBRB">{t('autoLoad.sysSteelBraced')}</option>
                <option value="other">{t('autoLoad.sysOther')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label" for="al-occupancy-f1">{t('autoLoad.simultaneity')}</label>
              <select id="al-occupancy-f1" bind:value={seismicOccupancy} class="al-select-sm" data-testid="al-f1">
                <option value="exceptional">{t('autoLoad.f1Exceptional')} — f1 = 0</option>
                <option value="reduced">{t('autoLoad.f1Reduced')} — f1 = 0,25</option>
                <option value="intermediate">{t('autoLoad.f1Intermediate')} — f1 = 0,50</option>
                <option value="high">{t('autoLoad.f1High')} — f1 = 0,75</option>
                <option value="full">{t('autoLoad.f1Full')} — f1 = 1,00</option>
                <option value="other">{t('autoLoad.f1Other')} — f1 = 0,20</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label" for="al-regularity">{t('autoLoad.regularity')}</label>
              <select id="al-regularity" bind:value={regularity} class="al-select-sm" data-testid="al-regularity">
                <option value="regular">{t('autoLoad.regRegular')}</option>
                <option value="medium">{t('autoLoad.regMedium')}</option>
                <option value="irregular">{t('autoLoad.regIrregular')}</option>
              </select>
            </div>
          </div>
          <label class="al-elastic">
            <input type="checkbox" bind:checked={elasticDesign} data-testid="al-elastic" />
            {t('autoLoad.elasticDesign')}
          </label>

          <!--
            What the zone and site imply, before anything is generated. The spectrum is
            the input the reader is least able to check by eye, so the panel prints the
            two coefficients and the two corner periods it produced.
          -->
          {#if isBlocked(spectrumPreview)}
            <p class="al-warn" data-testid="al-spectrum-blocked">{te(spectrumPreview.blocked)}</p>
          {:else}
            <div class="al-spectrum" data-testid="al-spectrum">
              {tp('autoLoad.spectrumLine', {
                type: spectrumPreview.type,
                ca: spectrumPreview.ca.toFixed(3),
                cv: spectrumPreview.cv.toFixed(3),
                t1: spectrumPreview.t1.toFixed(3),
                t2: spectrumPreview.t2.toFixed(3),
                t3: spectrumPreview.t3,
              })}
            </div>
          {/if}
          {#if effectiveR === null}
            <p class="al-warn" data-testid="al-no-r">{t('autoLoad.rFormulaWarning')}</p>
          {/if}
          <div class="al-directions">
            <label><input type="checkbox" bind:checked={seismicDirectionX} /> {t('autoLoad.dirX')}</label>
            <label><input type="checkbox" bind:checked={seismicDirectionZ} /> {t('autoLoad.dirZ')}</label>
          </div>

          <!-- The seismic figures come from the PLAN, whose level masses are real. The
               old block read T / Sa / R off a preview object that no longer exists and
               crashed the whole tab on undefined.toFixed. -->
          {#if seismicPreview}
            <div class="al-seismic-preview" data-testid="al-seismic-preview">
              <div class="al-preview-title">{t('autoLoad.previewTitle')}</div>
              <div class="al-preview-row">
                {tp('autoLoad.baseShear', {
                  w: seismicPreview.W.toFixed(1), v: seismicPreview.V0.toFixed(1) })}
              </div>
              {#if plan?.seismic?.source === 'cirsoc103'}
                <div class="al-preview-row" data-testid="al-seismic-coefficient">
                  {tp('autoLoad.coefficientLine', {
                    c: plan.seismic.c.toFixed(4),
                    t: (plan.seismic.t ?? 0).toFixed(3),
                    ta: (plan.seismic.ta ?? 0).toFixed(3),
                    r: plan.seismic.r ?? 0,
                    gammaR: plan.seismic.gammaR ?? 0,
                  })}
                </div>
                {#if plan.seismic.periodCapped}
                  <div class="al-preview-note">{t('autoLoad.periodCapped')}</div>
                {/if}
                {#if plan.seismic.floorApplied === 'nearFault'}
                  <div class="al-preview-note">{t('autoLoad.floorNearFault')}</div>
                {:else if plan.seismic.floorApplied === 'lowZone'}
                  <div class="al-preview-note">{t('autoLoad.floorLowZone')}</div>
                {/if}
                {#if plan.seismic.topHeavy}
                  <div class="al-preview-note">{t('autoLoad.topHeavy')}</div>
                {/if}
              {/if}
              {#each seismicPreview.levels as lv (lv.elevation)}
                <div class="al-preview-floor">
                  +{lv.elevation.toFixed(2)} m → Wi = {lv.weightKN.toFixed(1)} kN
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </fieldset>

      <!-- Wind -->
      <fieldset class="al-fieldset" bind:this={windFieldset} data-testid="al-wind-section">
        <legend>
          <label class="al-check-legend">
            <input type="checkbox" bind:checked={enableWind}
                   disabled={!windAvailable} data-testid="al-enable-wind" />
            {t('autoLoad.wind')} ({te(bindingLabel(regulationsStore.binding('wind')))})
          </label>
        </legend>
        {#if !windAvailable}
          <p class="al-warn" data-testid="al-wind-unavailable">
            {t('autoLoad.windNeedsRole')}
            <button class="al-link" data-testid="al-goto-regulations-wind"
                    onclick={() => { proNav.openRegulations(); onclose(); }}>
              {t('autoLoad.openRegulations')}
            </button>
          </p>
        {/if}
        {#if enableWind && windAvailable}
          <div class="al-grid">
            <div class="al-field">
              <label class="al-label">V (m/s)</label>
              <input type="number" class="al-input-sm" bind:value={windV} min={10} max={120} step={1} />
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.windExposure')}</label>
              <select class="al-select-sm" bind:value={windExposure}>
                <option value="B">B — {t('autoLoad.windExpB')}</option>
                <option value="C">C — {t('autoLoad.windExpC')}</option>
                <option value="D">D — {t('autoLoad.windExpD')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.windEnclosure')}</label>
              <select class="al-select-sm" bind:value={windEnclosure} data-testid="al-wind-enclosure">
                {#each ['enclosed','partiallyEnclosed','partiallyOpen','open'] as e (e)}
                  <option value={e}>{t(`loads.cirsoc102.enclosure.${e}`)}</option>
                {/each}
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.windAltitude')} (m)</label>
              <input type="number" class="al-input-sm" bind:value={windAltitude} min={0} step={10} data-testid="al-wind-altitude" />
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.windRoofSlope')} (°)</label>
              <input type="number" class="al-input-sm" bind:value={windRoofSlope} min={0} max={90} step={1} data-testid="al-wind-slope" />
            </div>
          </div>
          <div class="al-directions" style="margin-top: 6px;">
            <label><input type="checkbox" bind:checked={windKztSurveyed} data-testid="al-wind-kzt-surveyed" /> {t('autoLoad.windKztSurveyed')}</label>
            {#if windKztSurveyed}
              <input type="number" class="al-input-sm" bind:value={windKzt} min={1} step={0.05} data-testid="al-wind-kzt" />
            {/if}
            <label><input type="checkbox" bind:checked={windRigid} data-testid="al-wind-rigid" /> {t('autoLoad.windRigid')}</label>
          </div>
          <div class="al-directions" style="margin-top: 6px;">
            <label><input type="checkbox" bind:checked={windDirX} /> {t('autoLoad.dirX')}</label>
            <label><input type="checkbox" bind:checked={windDirZ} /> {t('autoLoad.dirZ')}</label>
          </div>
        {/if}
      </fieldset>

      <!-- Options -->
      <fieldset class="al-fieldset">
        <legend>{t('autoLoad.options')}</legend>
        <label class="al-check"><input type="checkbox" bind:checked={genCombos} data-testid="al-gen-combos" /> {t('autoLoad.genCombos')}</label>
        {#if genCombos}
          <div class="al-row al-comboset" role="radiogroup" aria-label={t('autoLoad.comboSet')} data-testid="al-combo-set">
            <span>{t('autoLoad.comboSet')}</span>
            {#each ['ultimate', 'service', 'both'] as const as k (k)}
              <label><input type="radio" name="al-combo-set" value={k} bind:group={comboSet} data-testid="al-combo-set-{k}" /> {t(`autoLoad.comboSet.${k}`)}</label>
            {/each}
          </div>
          {#if comboSet !== 'ultimate'}<p class="al-hint">{t('autoLoad.comboSetServiceHint')}</p>{/if}
        {/if}
        <label class="al-check"><input type="checkbox" checked={clearExisting} data-testid="al-clear"
          onchange={(e) => onClearExistingChange(e.currentTarget.checked)} /> {t('autoLoad.clearExisting')}</label>
        <label class="al-check">
          <input type="checkbox" bind:checked={applyLiveReduction} data-testid="al-live-reduction" />
          {t('autoLoad.applyLiveReduction')}
        </label>
        <div class="al-row">
          <label for="al-trib">{t('autoLoad.tributaryWidth')}</label>
          <input id="al-trib" type="number" step="0.5" min="0.1" bind:value={tributaryWidth} class="al-input-sm" data-testid="al-trib" /> m
        </div>
        <div class="al-row">
          <label for="al-floors">{t('autoLoad.floorsSupported')}</label>
          <input id="al-floors" type="number" step="1" min="1" bind:value={floorsSupported} class="al-input-sm" data-testid="al-floors" />
        </div>
        <div class="al-row">
          <label for="al-elemkind">{t('autoLoad.reductionElement')}</label>
          <select id="al-elemkind" bind:value={reductionElementKind} class="al-select" data-testid="al-elemkind">
            {#each ['interiorColumn','exteriorColumnNoCantilever','edgeColumnWithCantilever','cornerColumnWithCantilever','edgeBeamNoCantilever','interiorBeam','other'] as k (k)}
              <option value={k}>{t(`autoLoad.elementKind.${k}`)}</option>
            {/each}
          </select>
        </div>
      </fieldset>
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
  .al-regs { list-style: none; margin: 0; padding: 0; font-size: 0.82rem; }
  .al-regs li { display: flex; gap: 0.5rem; align-items: center; padding: 0.1rem 0; }
  .al-reg-role { min-width: 8rem; opacity: 0.8; }
  .al-reg-name { flex: 1; }
  .al-reg-state { font-size: 0.7rem; font-weight: 600; padding: 0.05rem 0.35rem; border-radius: 3px; background: rgba(143, 163, 179,0.3); }
  .al-state-applied { background: var(--st-surface-3); color: var(--st-text); }
  .al-state-pending { background: var(--st-surface-3); color: var(--st-text); }
  .al-state-stale { background: var(--st-accent); color: var(--st-text); }
  .al-lossy { color: var(--st-text-2); }
  .al-preview { padding: 0.6rem 1rem; border-top: 1px solid var(--st-surface-3); max-height: 40vh; overflow: auto; font-size: 0.82rem; }
  .al-preview h3 { margin: 0 0 0.4rem; font-size: 0.9rem; }
  .al-delta { width: 100%; border-collapse: collapse; margin: 0.3rem 0; }
  .al-delta th, .al-delta td { border: 1px solid var(--st-surface-3); padding: 0.15rem 0.4rem; text-align: right; }
  .al-delta th:first-child, .al-delta td:first-child { text-align: left; }
  /*
     11 px, like every other piece of body text in this dialog. Without a size these
     two inherited the dialog's base and came out as the LARGEST text on screen —
     "seismic loads need a seismic regulation bound" shouting over the numbers the
     reader is there to set.
  */
  .al-warn { background: var(--st-surface-3); color: var(--st-text); padding: 0.35rem 0.5rem; border-radius: 4px; margin: 0.35rem 0; font-size: 11px; line-height: 1.5; }
  .al-error { background: var(--st-accent); color: var(--st-text); padding: 0.35rem 0.5rem; border-radius: 4px; margin: 0.35rem 0; font-size: 11px; line-height: 1.5; }
  .al-list { margin: 0.2rem 0 0; padding-left: 1.1rem; }
  .al-row { display: flex; align-items: center; gap: 0.4rem; margin: 0.2rem 0; }
  .al-comboset { flex-wrap: wrap; padding-left: 1.3rem; }
  .al-hint { margin: 0.1rem 0 0.3rem 1.3rem; font-size: 0.62rem; color: var(--st-text-3); }
  .al-row label { min-width: 11rem; }
  .al-seismic-preview { margin-top: 6px; font-size: 0.78rem; opacity: 0.9; }
  .al-link { background: none; border:  none; text-decoration: underline; color: inherit; cursor: pointer; padding: 0; font: inherit; }
  .al-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
  }
  .al-dialog {
    background: var(--st-surface-2); color: var(--st-text); border-radius: 10px;
    width: 520px; max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); border: 1px solid var(--st-surface-3);
  }
  .al-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid var(--st-surface-3);
  }
  .al-header h2 { margin: 0; font-size: 15px; color: var(--st-text); }
  .al-close { background: none; border:  none; color: var(--st-text-3); font-size: 22px; cursor: pointer; }
  .al-close:hover { color: var(--st-text); }
  .al-body { padding: 14px 18px; overflow-y: auto; flex: 1; }
  .al-fieldset {
    border: 1px solid var(--st-surface-3); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;
  }
  .al-fieldset legend { color: var(--st-text-2); font-size: 11px; font-weight: 600; padding: 0 6px; text-transform: uppercase; }
  .al-field-wide { grid-column: 1 / -1; }
  .al-elastic {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.73rem; color: var(--st-text-2); margin-top: 6px;
  }
  .al-spectrum {
    margin-top: 6px; font-size: 0.7rem; color: var(--st-text-3);
    font-variant-numeric: tabular-nums; line-height: 1.5;
  }
  .al-preview-note { font-size: 0.68rem; color: var(--st-text-3); line-height: 1.45; }

  .al-dead-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px;
  }
  .al-dead-label { flex: 1; color: var(--st-text-2); }
  .al-input-sm {
    width: 55px; padding: 3px 5px; background: var(--st-bg); border: 1px solid var(--st-surface-3);
    border-radius: 3px; color: var(--st-text); font-size: 11px; text-align: right;
  }
  .al-input-sm:focus { border-color: var(--st-text-2); outline: none; }
  .al-select, .al-select-sm {
    width: 100%; padding: 5px 6px; background: var(--st-bg); border: 1px solid var(--st-surface-3);
    border-radius: 4px; color: var(--st-text); font-size: 11px;
  }
  .al-select-sm { width: 100%; }
  .al-select:focus, .al-select-sm:focus { border-color: var(--st-text-2); outline: none; }
  .al-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .al-field { display: flex; flex-direction: column; gap: 3px; }
  .al-label { font-size: 10px; color: var(--st-text-3); }
  .al-directions { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; }
  .al-directions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .al-directions input { accent-color: var(--st-value); }
  .al-check { display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; margin-bottom: 4px; }
  .al-check input { accent-color: var(--st-text-2); }
  .al-check-legend { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .al-check-legend input { accent-color: var(--st-text-2); }
  .al-preview {
    margin-top: 8px; padding: 8px; background: var(--st-bg); border-radius: 4px; font-size: 10px;
    font-family: monospace;
  }
  .al-preview-title { color: var(--st-text-2); font-weight: 600; margin-bottom: 4px; }
  .al-preview-row { color: var(--st-text-2); margin-bottom: 2px; }
  .al-preview-floor { color: var(--st-text-2); padding-left: 8px; }
  .al-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 18px; border-top: 1px solid var(--st-surface-3);
  }
  .al-btn {
    padding: 8px 20px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: none; transition: background 0.15s;
  }
  .al-btn-primary { background: var(--st-accent); color: var(--st-text-on-accent); }
  .al-btn-primary:hover { background: var(--st-accent-hover); }
  .al-btn-secondary { background: var(--st-surface-3); color: var(--st-text-2); }
  .al-btn-secondary:hover { background: var(--st-hair-strong); }
</style>
