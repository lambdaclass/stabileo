<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import { t, i18n } from '../../lib/i18n';
  import {
    OCCUPANCY_TABLE, DEAD_LOAD_DEFAULTS,
    getCirsoc101Combinations, computeSeismicStatic, detectFloorLevels,
    DUCTILITY_TABLE, IMPORTANCE_FACTORS,
    type SeismicZone, type SoilType, type ImportanceGroup,
    type DuctilityKey, type StructureSystem, type FloorLevel,
  } from '../../lib/engine/auto-loads';
  import { generateWindLoads } from '../../lib/engine/wind-loads';
  import type { WindParams } from '../../lib/engine/wind-loads';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  // ─── Dead load config ──────────────────
  let deadComponents = $state(DEAD_LOAD_DEFAULTS.map(d => ({ ...d })));
  const totalDead = $derived(deadComponents.reduce((s, c) => s + c.q, 0));

  // ─── Live load config ──────────────────
  let selectedOccupancy = $state('vivienda');
  const occupancyQ = $derived(OCCUPANCY_TABLE.find(o => o.key === selectedOccupancy)?.q ?? 2.0);

  // ─── Seismic config ────────────────────
  let enableSeismic = $state(true);
  let seismicZone = $state<SeismicZone>(4);
  let soilType = $state<SoilType>('SD');
  let importanceGroup = $state<ImportanceGroup>('B');
  let ductilityKey = $state<DuctilityKey>('HA_portico_completa');
  let structureSystem = $state<StructureSystem>('portico_HA');
  let seismicDirectionX = $state(true);
  let seismicDirectionZ = $state(true);

  // ─── Wind config (CIRSOC 102) ────────
  let enableWind = $state(false);
  let windV = $state(45);
  let windExposure = $state<'B' | 'C' | 'D'>('B');
  let windWidth = $state(10);
  let windDirX = $state(true);
  let windDirZ = $state(false);

  // ─── Options ───────────────────────────
  let generateCombinations = $state(true);
  let clearExisting = $state(false);

  const isEs = $derived(i18n.locale === 'es');

  // ─── Preview computation ───────────────
  const seismicPreview = $derived.by(() => {
    if (!enableSeismic || seismicZone === 0) return null;
    const allLevels = detectFloorLevels(modelStore.nodes as any);
    if (allLevels.length < 2) return null;
    const base = allLevels[0].elevation;
    const top = allLevels[allLevels.length - 1].elevation;
    const H = top - base;
    if (H <= 0) return null;

    // Estimate weight per floor from dead + live loads
    // Use a rough tributary area estimate
    const floorWeight = (totalDead + 0.25 * occupancyQ) * 50; // rough 50m² per floor
    const floors: FloorLevel[] = allLevels
      .filter(lv => lv.elevation > base + 0.01)
      .map(lv => ({
        elevation: lv.elevation - base,
        weight: floorWeight,
        nodeIds: lv.nodeIds,
      }));

    if (floors.length === 0) return null;
    return computeSeismicStatic(
      { zone: seismicZone, soil: soilType, importanceGroup, ductilityKey, structureSystem },
      floors, H,
    );
  });

  function handleGenerate() {
    if (clearExisting) {
      // Remove all existing loads
      const ids = modelStore.loads.map(l => l.data.id);
      for (const id of ids) modelStore.removeLoad(id);
      // Remove all combinations
      for (const c of [...modelStore.model.combinations]) modelStore.removeCombination(c.id);
      // Remove non-default load cases
      for (const lc of [...modelStore.model.loadCases]) {
        if (lc.id > 4) modelStore.removeLoadCase(lc.id);
      }
    }

    // Ensure load cases exist
    const cases = modelStore.model.loadCases;
    let deadCaseId = cases.find(c => c.type === 'D')?.id;
    let liveCaseId = cases.find(c => c.type === 'L')?.id;
    let seismicCaseIdX: number | undefined;
    let seismicCaseIdZ: number | undefined;

    if (!deadCaseId) deadCaseId = modelStore.addLoadCase(t('autoLoad.deadCase'), 'D');
    if (!liveCaseId) liveCaseId = modelStore.addLoadCase(t('autoLoad.liveCase'), 'L');

    let windCaseIdX: number | undefined;
    let windCaseIdZ: number | undefined;

    if (enableSeismic && seismicDirectionX) {
      seismicCaseIdX = cases.find(c => c.type === 'E' && c.name.includes('X'))?.id;
      if (!seismicCaseIdX) seismicCaseIdX = modelStore.addLoadCase(t('autoLoad.seismicX'), 'E');
    }
    if (enableSeismic && seismicDirectionZ) {
      seismicCaseIdZ = cases.find(c => c.type === 'E' && c.name.includes('Z'))?.id;
      if (!seismicCaseIdZ) seismicCaseIdZ = modelStore.addLoadCase(t('autoLoad.seismicZ'), 'E');
    }

    // Generate dead + live loads on horizontal elements (beams)
    for (const [, elem] of modelStore.elements) {
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;

      // Only apply area loads to roughly horizontal elements
      const dx = nJ.x - nI.x;
      const dy = nJ.y - nI.y;
      const dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 0.01) continue;

      const cosAngle = Math.abs(dy) / L;
      // Skip if element is nearly vertical (column)
      if (cosAngle > 0.5) continue;

      // Estimate tributary width (heuristic: use section width or 1m default)
      const sec = modelStore.sections.get(elem.sectionId);
      // For beams, assume tributary width = spacing between beams ≈ 3m (user can adjust)
      const tribWidth = 3.0;

      // Dead load (distributed along element in local Y = gravity direction for horizontal elements)
      const qDead = -totalDead * tribWidth; // negative Y = downward
      if (Math.abs(qDead) > 0.001) {
        modelStore.addDistributedLoad3D(elem.id, qDead, qDead, 0, 0, undefined, undefined, deadCaseId!);
      }

      // Live load
      const qLive = -occupancyQ * tribWidth;
      if (Math.abs(qLive) > 0.001) {
        modelStore.addDistributedLoad3D(elem.id, qLive, qLive, 0, 0, undefined, undefined, liveCaseId!);
      }
    }

    // Generate seismic forces
    if (enableSeismic && seismicZone > 0) {
      const allLevels = detectFloorLevels(modelStore.nodes as any);
      if (allLevels.length >= 2) {
        const base = allLevels[0].elevation;
        const top = allLevels[allLevels.length - 1].elevation;
        const H = top - base;

        if (H > 0) {
          // Compute seismic weight per floor from model
          const floorWeight = computeFloorWeights(allLevels, base);
          const floors: FloorLevel[] = allLevels
            .filter(lv => lv.elevation > base + 0.01)
            .map((lv, i) => ({
              elevation: lv.elevation - base,
              weight: floorWeight[i + 1] ?? 100,
              nodeIds: lv.nodeIds,
            }));

          if (floors.length > 0) {
            const result = computeSeismicStatic(
              { zone: seismicZone, soil: soilType, importanceGroup, ductilityKey, structureSystem },
              floors, H,
            );

            // Apply forces as nodal loads
            for (const floor of result.floors) {
              if (floor.Fk < 0.01) continue;
              const nNodes = floor.nodeIds.length;
              if (nNodes === 0) continue;
              const forcePerNode = floor.Fk / nNodes;

              for (const nodeId of floor.nodeIds) {
                if (seismicDirectionX && seismicCaseIdX) {
                  modelStore.addNodalLoad3D(nodeId, forcePerNode, 0, 0, 0, 0, 0, seismicCaseIdX);
                }
                if (seismicDirectionZ && seismicCaseIdZ) {
                  modelStore.addNodalLoad3D(nodeId, 0, 0, forcePerNode, 0, 0, 0, seismicCaseIdZ);
                }
              }
            }
          }
        }
      }
    }

    // Generate wind loads (CIRSOC 102)
    if (enableWind) {
      const params: WindParams = { V: windV, exposure: windExposure };
      const nodes = modelStore.nodes as Map<number, { id: number; x: number; y: number; z?: number }>;

      if (windDirX) {
        try {
          const res = generateWindLoads(nodes, params, 'X', windWidth);
          if (res?.nodalForces?.length) {
            const updCases = modelStore.model.loadCases;
            windCaseIdX = updCases.find(c => c.type === 'W' && c.name.includes('X'))?.id;
            if (!windCaseIdX) windCaseIdX = modelStore.addLoadCase(`${t('autoLoad.windCase')} X (V=${windV})`, 'W');
            for (const f of res.nodalForces) {
              modelStore.addNodalLoad3D(f.nodeId, f.Fx ?? 0, f.Fy ?? 0, f.Fz ?? 0, 0, 0, 0, windCaseIdX);
            }
          }
        } catch { /* skip wind X on error */ }
      }

      if (windDirZ) {
        try {
          const res = generateWindLoads(nodes, params, 'Y', windWidth);
          if (res?.nodalForces?.length) {
            const updCases = modelStore.model.loadCases;
            windCaseIdZ = updCases.find(c => c.type === 'W' && c.name.includes('Z'))?.id;
            if (!windCaseIdZ) windCaseIdZ = modelStore.addLoadCase(`${t('autoLoad.windCase')} Z (V=${windV})`, 'W');
            for (const f of res.nodalForces) {
              modelStore.addNodalLoad3D(f.nodeId, f.Fx ?? 0, f.Fy ?? 0, f.Fz ?? 0, 0, 0, 0, windCaseIdZ);
            }
          }
        } catch { /* skip wind Z on error */ }
      }
    }

    // Generate standard combinations
    if (generateCombinations) {
      const hasSeismic = enableSeismic && seismicZone > 0;
      const hasWind = enableWind && (windDirX || windDirZ);
      const combos = getCirsoc101Combinations(hasWind, hasSeismic, false);

      // Map case types to actual case IDs
      const updatedCases = modelStore.model.loadCases;
      for (const combo of combos) {
        const factors: Array<{ caseId: number; factor: number }> = [];
        for (const f of combo.factors) {
          // Find matching case(s)
          const matchingCases = updatedCases.filter(c => c.type === f.caseType);
          for (const mc of matchingCases) {
            factors.push({ caseId: mc.id, factor: f.factor });
          }
        }
        if (factors.length > 0) {
          modelStore.addCombination(combo.name, factors);
        }
      }
    }

    uiStore.toast(t('autoLoad.generated'), 'success');
    onclose();
  }

  /** Estimate seismic weight per floor level from element self-weights */
  function computeFloorWeights(
    levels: Array<{ elevation: number; nodeIds: number[] }>,
    baseElev: number,
  ): number[] {
    const weights: number[] = new Array(levels.length).fill(0);

    for (const [, elem] of modelStore.elements) {
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;

      const sec = modelStore.sections.get(elem.sectionId);
      const mat = modelStore.materials.get(elem.materialId);
      if (!sec || !mat) continue;

      const dx = nJ.x - nI.x;
      const dy = nJ.y - nI.y;
      const dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const w = (mat.rho ?? 25) * sec.a * L; // kN

      // Distribute to nearest floor levels
      const yMid = (nI.y + nJ.y) / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < levels.length; i++) {
        const d = Math.abs(levels[i].elevation - yMid);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      weights[bestIdx] += w;
    }

    // Add superimposed dead + portion of live
    const areaPerFloor = estimateFloorArea();
    for (let i = 0; i < levels.length; i++) {
      if (levels[i].elevation > baseElev + 0.01) {
        weights[i] += (totalDead + 0.25 * occupancyQ) * areaPerFloor;
      }
    }

    return weights;
  }

  /** Rough floor area estimate from node bounding box */
  function estimateFloorArea(): number {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [, node] of modelStore.nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      const z = node.z ?? 0;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const dx = maxX - minX;
    const dz = maxZ - minZ;
    return Math.max(dx * dz, 10); // minimum 10m²
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
      <!-- Dead Loads -->
      <fieldset class="al-fieldset">
        <legend>{t('autoLoad.deadLoads')} ({totalDead.toFixed(1)} kN/m²)</legend>
        {#each deadComponents as comp, i}
          <div class="al-dead-row">
            <span class="al-dead-label">{isEs ? comp.label : comp.labelEn}</span>
            <input type="number" step="0.1" bind:value={deadComponents[i].q} class="al-input-sm" /> kN/m²
          </div>
        {/each}
      </fieldset>

      <!-- Live Loads -->
      <fieldset class="al-fieldset">
        <legend>{t('autoLoad.liveLoads')} ({occupancyQ} kN/m²)</legend>
        <select bind:value={selectedOccupancy} class="al-select">
          {#each OCCUPANCY_TABLE as occ}
            <option value={occ.key}>{isEs ? occ.label : occ.labelEn} — {occ.q} kN/m²</option>
          {/each}
        </select>
      </fieldset>

      <!-- Seismic -->
      <fieldset class="al-fieldset">
        <legend>
          <label class="al-check-legend">
            <input type="checkbox" bind:checked={enableSeismic} />
            {t('autoLoad.seismic')}
          </label>
        </legend>
        {#if enableSeismic}
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

          {#if seismicPreview}
            <div class="al-preview">
              <div class="al-preview-title">{t('autoLoad.preview')}</div>
              <div class="al-preview-row">T ≈ {seismicPreview.T.toFixed(3)} s | Sa = {seismicPreview.Sa.toFixed(3)}g | R = {seismicPreview.R.toFixed(1)}</div>
              <div class="al-preview-row">V₀ = {seismicPreview.V0.toFixed(1)} kN ({(seismicPreview.V0 / seismicPreview.W * 100).toFixed(1)}% W)</div>
              {#each seismicPreview.floors as f}
                <div class="al-preview-floor">h={f.elevation.toFixed(1)}m → F={f.Fk.toFixed(1)} kN</div>
              {/each}
            </div>
          {/if}
        {/if}
      </fieldset>

      <!-- Wind (CIRSOC 102) -->
      <fieldset class="al-fieldset">
        <legend>
          <label class="al-check-legend">
            <input type="checkbox" bind:checked={enableWind} />
            {t('autoLoad.wind')}
          </label>
        </legend>
        {#if enableWind}
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
              <label class="al-label">{t('autoLoad.windTribWidth')} (m)</label>
              <input type="number" class="al-input-sm" bind:value={windWidth} min={0.1} step={0.5} />
            </div>
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
        <label class="al-check"><input type="checkbox" bind:checked={generateCombinations} /> {t('autoLoad.genCombos')}</label>
        <label class="al-check"><input type="checkbox" bind:checked={clearExisting} /> {t('autoLoad.clearExisting')}</label>
      </fieldset>
    </div>

    <div class="al-footer">
      <button class="al-btn al-btn-secondary" onclick={onclose}>{t('report.cancel')}</button>
      <button class="al-btn al-btn-primary" onclick={handleGenerate}>{t('autoLoad.generate')}</button>
    </div>
  </div>
</div>
{/if}

<style>
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
