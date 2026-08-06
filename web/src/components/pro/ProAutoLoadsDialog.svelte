<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp, i18n } from '../../lib/i18n';
  import { identifyMessages } from '../../lib/codes/message';
  import { te } from '../../lib/i18n/engine-text';
  // The ONE authoritative generator. The legacy auto-loads / wind-loads production path
  // is gone: it implemented the 2005 editions, had no wind pressure coefficients, and
  // built the seismic weight on a literal "* 50 // rough 50m2 per floor".
  import {
    buildLoadPlan, describePlanDelta, type LoadPlan, type LoadPlanInput, type PlanDelta,
  } from '../../lib/engine/loads/load-plan';
  import { OCCUPANCY_TABLE_2025 } from '../../lib/codes/cirsoc101/live-loads';
  import type { ElementKind } from '../../lib/codes/cirsoc101/live-loads';
  import type { Enclosure, Exposure } from '../../lib/codes/cirsoc102/wind';
  import { regulationsStore } from '../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../lib/codes/roles';
  import { messageIdentity } from '../../lib/codes/message';
  import { DUCTILITY_TABLE, type SeismicZone, type SoilType, type ImportanceGroup,
    type DuctilityKey, type StructureSystem, computeSa, approximatePeriod,
    reductionFactor, IMPORTANCE_FACTORS, SPECTRAL_PARAMS,
  } from '../../lib/engine/auto-loads';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  // ─── Design code definitions ─────────

  // ─── Dead load config ──────────────────
  const DEAD_KEYS = [
    'autoLoad.dead.screed', 'autoLoad.dead.finish', 'autoLoad.dead.ceiling',
    'autoLoad.dead.services', 'autoLoad.dead.partitions',
  ] as const;
  let deadComponents = $state(
    [1.0, 0.8, 0.3, 0.3, 1.0].map((q, i) => ({ labelKey: DEAD_KEYS[i], q })),
  );
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
  let soilType = $state<SoilType>('SD');
  let importanceGroup = $state<ImportanceGroup>('B');
  let ductilityKey = $state<DuctilityKey>('HA_portico_completa');
  let structureSystem = $state<StructureSystem>('portico_HA');
  let seismicDirectionX = $state(true);
  let seismicDirectionZ = $state(true);

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
  let clearExisting = $state(false);

  /** The plan is built first and applied only after the user confirms. */
  let plan = $state<LoadPlan | null>(null);
  let delta = $state<PlanDelta | null>(null);
  let applyError = $state<string | null>(null);

  // The ductility table still carries its own label pair; everything new is keyed.
  const isEs = $derived(i18n.locale === 'es');

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

  /** Seismic design coefficient C from the bound seismic role. */
  function seismicCoefficient(): number {
    const T = approximatePeriod(buildingHeight(), structureSystem);
    const mu = DUCTILITY_TABLE.find(d => d.key === ductilityKey)?.mu ?? 3.0;
    const gammaR = IMPORTANCE_FACTORS[importanceGroup];
    const p = SPECTRAL_PARAMS[seismicZone]?.[soilType];
    const R = reductionFactor(T, mu, p?.T1 ?? 0.1);
    return (gammaR * computeSa(T, seismicZone, soilType)) / R;
  }

  function buildingHeight(): number {
    const zs = [...modelStore.nodes.values()].map(n => n.z ?? 0);
    return zs.length > 0 ? Math.max(...zs) - Math.min(...zs) : 0;
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
        enabled: true, coefficient: seismicCoefficient(),
        liveParticipation: null,
        directions: { x: seismicDirectionX, y: seismicDirectionZ },
      } : undefined,
      generateCombinations: genCombos,
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
        zone: seismicZone, soil: soilType, importanceGroup, ductilityKey, structureSystem,
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

    for (const combo of p.combinations) {
      const factors: Array<{ caseId: number; factor: number }> = [];
      for (const term of combo.terms) {
        for (const id of caseIdByType.get(term.symbol) ?? []) {
          factors.push({ caseId: id, factor: term.factor });
        }
      }
      if (factors.length > 0) modelStore.addCombination(combo.label, factors);
    }

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
      <fieldset class="al-fieldset">
        <legend>{t('autoLoad.deadLoads')} ({totalDead.toFixed(1)} kN/m²)</legend>
        {#each deadComponents as comp, i}
          <div class="al-dead-row">
            <span class="al-dead-label">{t(comp.labelKey)}</span>
            <input type="number" step="0.1" bind:value={deadComponents[i].q} class="al-input-sm" /> kN/m²
          </div>
        {/each}
      </fieldset>

      <!-- Live Loads -->
      <fieldset class="al-fieldset">
        <legend>{t('autoLoad.liveLoads')} ({occupancyQ} kN/m²)</legend>
        <select bind:value={selectedOccupancy} class="al-select">
          {#each OCCUPANCY_TABLE_2025 as occ}
            <option value={occ.key}>{t(occ.labelKey)}{occ.uniformKNm2 !== null ? ` — ${occ.uniformKNm2} kN/m²` : ''}</option>
          {/each}
        </select>
      </fieldset>

      <!-- Seismic -->
      <fieldset class="al-fieldset">
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
                    onclick={() => { uiStore.proActiveTab = 'design'; onclose(); }}>
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
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.soil')}</label>
              <select bind:value={soilType} class="al-select-sm">
                <option value="SA">SA — {t('autoLoad.soilSA')}</option>
                <option value="SB">SB — {t('autoLoad.soilSB')}</option>
                <option value="SC">SC — {t('autoLoad.soilSC')}</option>
                <option value="SD">SD — {t('autoLoad.soilSD')}</option>
                <option value="SE">SE — {t('autoLoad.soilSE')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.importance')}</label>
              <select bind:value={importanceGroup} class="al-select-sm">
                <option value="Ao">Ao (γ=1.5) — {t('autoLoad.impEssential')}</option>
                <option value="A">A (γ=1.3) — {t('autoLoad.impImportant')}</option>
                <option value="B">B (γ=1.0) — {t('autoLoad.impNormal')}</option>
                <option value="C">C (γ=0.8) — {t('autoLoad.impLow')}</option>
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.ductility')}</label>
              <select bind:value={ductilityKey} class="al-select-sm">
                {#each DUCTILITY_TABLE as d}
                  <option value={d.key}>{isEs ? d.label : d.labelEn} (μ={d.mu})</option>
                {/each}
              </select>
            </div>
            <div class="al-field">
              <label class="al-label">{t('autoLoad.system')}</label>
              <select bind:value={structureSystem} class="al-select-sm">
                <option value="portico_HA">{t('autoLoad.sysRCFrame')}</option>
                <option value="portico_acero">{t('autoLoad.sysSteelFrame')}</option>
                <option value="muros">{t('autoLoad.sysWalls')}</option>
                <option value="otro">{t('autoLoad.sysOther')}</option>
              </select>
            </div>
          </div>
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
      <fieldset class="al-fieldset">
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
                    onclick={() => { uiStore.proActiveTab = 'design'; onclose(); }}>
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
  .al-reg-state { font-size: 0.7rem; font-weight: 600; padding: 0.05rem 0.35rem; border-radius: 3px; background: rgba(128,128,128,0.3); }
  .al-state-applied { background: #14532d; color: #dcfce7; }
  .al-state-pending { background: #7a5b00; color: #fff6dd; }
  .al-state-stale { background: #7a1f1f; color: #ffe3e3; }
  .al-lossy { color: #fca5a5; }
  .al-preview { padding: 0.6rem 1rem; border-top: 1px solid #2a2a4a; max-height: 40vh; overflow: auto; font-size: 0.82rem; }
  .al-preview h3 { margin: 0 0 0.4rem; font-size: 0.9rem; }
  .al-delta { width: 100%; border-collapse: collapse; margin: 0.3rem 0; }
  .al-delta th, .al-delta td { border: 1px solid #2a2a4a; padding: 0.15rem 0.4rem; text-align: right; }
  .al-delta th:first-child, .al-delta td:first-child { text-align: left; }
  .al-warn { background: #7a5b00; color: #fff6dd; padding: 0.35rem 0.5rem; border-radius: 4px; margin: 0.35rem 0; }
  .al-error { background: #7a1f1f; color: #ffe3e3; padding: 0.35rem 0.5rem; border-radius: 4px; margin: 0.35rem 0; }
  .al-list { margin: 0.2rem 0 0; padding-left: 1.1rem; }
  .al-row { display: flex; align-items: center; gap: 0.4rem; margin: 0.2rem 0; }
  .al-row label { min-width: 11rem; }
  .al-seismic-preview { margin-top: 6px; font-size: 0.78rem; opacity: 0.9; }
  .al-link { background: none; border: none; text-decoration: underline; color: inherit; cursor: pointer; padding: 0; font: inherit; }
  .al-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;
  }
  .al-dialog {
    background: #1a1a2e; color: #e0e0e0; border-radius: 10px;
    width: 520px; max-height: 85vh; display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); border: 1px solid #2a2a4a;
  }
  .al-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid #2a2a4a;
  }
  .al-header h2 { margin: 0; font-size: 15px; color: #fff; }
  .al-close { background: none; border: none; color: #888; font-size: 22px; cursor: pointer; }
  .al-close:hover { color: #fff; }
  .al-body { padding: 14px 18px; overflow-y: auto; flex: 1; }
  .al-fieldset {
    border: 1px solid #2a2a4a; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;
  }
  .al-fieldset legend { color: #4ecdc4; font-size: 11px; font-weight: 600; padding: 0 6px; text-transform: uppercase; }
  .al-dead-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px;
  }
  .al-dead-label { flex: 1; color: #bbb; }
  .al-input-sm {
    width: 55px; padding: 3px 5px; background: #12122a; border: 1px solid #333;
    border-radius: 3px; color: #e0e0e0; font-size: 11px; text-align: right;
  }
  .al-input-sm:focus { border-color: #4ecdc4; outline: none; }
  .al-select, .al-select-sm {
    width: 100%; padding: 5px 6px; background: #12122a; border: 1px solid #333;
    border-radius: 4px; color: #e0e0e0; font-size: 11px;
  }
  .al-select-sm { width: 100%; }
  .al-select:focus, .al-select-sm:focus { border-color: #4ecdc4; outline: none; }
  .al-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .al-field { display: flex; flex-direction: column; gap: 3px; }
  .al-label { font-size: 10px; color: #888; }
  .al-directions { display: flex; gap: 16px; margin-top: 8px; font-size: 11px; }
  .al-directions label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .al-directions input { accent-color: #4ecdc4; }
  .al-check { display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; margin-bottom: 4px; }
  .al-check input { accent-color: #4ecdc4; }
  .al-check-legend { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .al-check-legend input { accent-color: #4ecdc4; }
  .al-preview {
    margin-top: 8px; padding: 8px; background: #12122a; border-radius: 4px; font-size: 10px;
    font-family: monospace;
  }
  .al-preview-title { color: #4ecdc4; font-weight: 600; margin-bottom: 4px; }
  .al-preview-row { color: #ccc; margin-bottom: 2px; }
  .al-preview-floor { color: #999; padding-left: 8px; }
  .al-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 18px; border-top: 1px solid #2a2a4a;
  }
  .al-btn {
    padding: 8px 20px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: none; transition: background 0.15s;
  }
  .al-btn-primary { background: #4ecdc4; color: #111; }
  .al-btn-primary:hover { background: #3dbdb4; }
  .al-btn-secondary { background: #2a2a4a; color: #ccc; }
  .al-btn-secondary:hover { background: #3a3a5a; }
</style>
