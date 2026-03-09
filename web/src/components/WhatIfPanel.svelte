<script lang="ts">
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { solve } from '../lib/engine/wasm-solver';
  import type { ModelSnapshot } from '../lib/store/history.svelte';
  import { t } from '../lib/i18n';

  let baseline: ModelSnapshot | null = $state(null);
  let debounceTimer: number | undefined;

  // Load factors per load index
  let loadFactors = $state<number[]>([]);
  // Material E multiplier
  let eFactor = $state(1.0);
  // Section multipliers
  let aFactor = $state(1.0);
  let izFactor = $state(1.0);

  // Baseline values for display
  let baselineE = $state(0);
  let baselineA = $state(0);
  let baselineIz = $state(0);

  // Initialize when panel opens
  $effect(() => {
    if (uiStore.showWhatIf && !baseline) {
      baseline = modelStore.snapshot();
      loadFactors = modelStore.model.loads.map(() => 1.0);
      eFactor = 1.0;
      aFactor = 1.0;
      izFactor = 1.0;
      // Get first material/section values for display
      const firstMat = modelStore.model.materials.values().next().value;
      const firstSec = modelStore.model.sections.values().next().value;
      baselineE = firstMat?.e ?? 200000;
      baselineA = firstSec?.a ?? 0.01;
      baselineIz = firstSec?.iz ?? 1e-4;
    }
    if (!uiStore.showWhatIf && baseline) {
      baseline = null;
    }
  });

  function applyAndSolve() {
    if (!baseline) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Restore baseline first
      modelStore.restore(baseline!);

      // Apply load factors
      const loads = modelStore.model.loads;
      for (let i = 0; i < loads.length; i++) {
        const f = loadFactors[i] ?? 1.0;
        const l = loads[i];
        if (l.type === 'nodal') {
          const d = l.data as { fx: number; fy: number; mz: number };
          const baseLoads = baseline!.loads[i]?.data as { fx: number; fy: number; mz: number };
          if (baseLoads) {
            d.fx = baseLoads.fx * f;
            d.fy = baseLoads.fy * f;
            d.mz = baseLoads.mz * f;
          }
        } else if (l.type === 'distributed') {
          const d = l.data as { qI: number; qJ: number };
          const baseLoads = baseline!.loads[i]?.data as { qI: number; qJ: number };
          if (baseLoads) {
            d.qI = baseLoads.qI * f;
            d.qJ = baseLoads.qJ * f;
          }
        } else if (l.type === 'pointOnElement') {
          const d = l.data as { p: number };
          const baseLoads = baseline!.loads[i]?.data as { p: number };
          if (baseLoads) {
            d.p = baseLoads.p * f;
          }
        } else if (l.type === 'thermal') {
          const d = l.data as { dtUniform: number; dtGradient: number };
          const baseLoads = baseline!.loads[i]?.data as { dtUniform: number; dtGradient: number };
          if (baseLoads) {
            d.dtUniform = baseLoads.dtUniform * f;
            d.dtGradient = baseLoads.dtGradient * f;
          }
        } else if (l.type === 'nodal3d') {
          const d = l.data as { fx: number; fy: number; fz: number; mx: number; my: number; mz: number };
          const baseLoads = baseline!.loads[i]?.data as typeof d;
          if (baseLoads) {
            d.fx = baseLoads.fx * f; d.fy = baseLoads.fy * f; d.fz = baseLoads.fz * f;
            d.mx = baseLoads.mx * f; d.my = baseLoads.my * f; d.mz = baseLoads.mz * f;
          }
        } else if (l.type === 'distributed3d') {
          const d = l.data as { qYI: number; qYJ: number; qZI: number; qZJ: number };
          const baseLoads = baseline!.loads[i]?.data as typeof d;
          if (baseLoads) {
            d.qYI = baseLoads.qYI * f; d.qYJ = baseLoads.qYJ * f;
            d.qZI = baseLoads.qZI * f; d.qZJ = baseLoads.qZJ * f;
          }
        }
      }

      // Apply material E factor
      for (const mat of modelStore.model.materials.values()) {
        const baseMat = baseline!.materials.find(([id]) => id === mat.id);
        if (baseMat) {
          mat.e = baseMat[1].e * eFactor;
        }
      }

      // Apply section factors
      for (const sec of modelStore.model.sections.values()) {
        const baseSec = baseline!.sections.find(([id]) => id === sec.id);
        if (baseSec) {
          sec.a = baseSec[1].a * aFactor;
          sec.iz = baseSec[1].iz * izFactor;
          // Always update iy — 2D solver uses iy ?? iz for bending stiffness
          (sec as any).iy = ((baseSec[1] as any).iy ?? baseSec[1].iz) * izFactor;
          if (uiStore.analysisMode === '3d') {
            (sec as any).j = ((baseSec[1] as any).j ?? baseSec[1].iz * 2) * izFactor;
          }
        }
      }

      // Re-solve
      if (uiStore.analysisMode === '3d') {
        try {
          const r3d = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
          if (r3d && typeof r3d !== 'string') resultsStore.setResults3D(r3d);
        } catch { /* ignore */ }
      } else {
        const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
        if (!input) return;
        try {
          const results = solve(input);
          resultsStore.setResults(results);
        } catch { /* ignore */ }
      }
    }, 60) as unknown as number;
  }

  function close() {
    if (baseline) {
      modelStore.restore(baseline);
      // Re-solve with original values
      if (uiStore.analysisMode === '3d') {
        try {
          const r3d = modelStore.solve3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
          if (r3d && typeof r3d !== 'string') resultsStore.setResults3D(r3d);
        } catch { /* ignore */ }
      } else {
        const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
        if (input) {
          try {
            const results = solve(input);
            resultsStore.setResults(results);
          } catch { /* ignore */ }
        }
      }
      baseline = null;
    }
    uiStore.showWhatIf = false;
  }

  function resetAll() {
    loadFactors = loadFactors.map(() => 1.0);
    eFactor = 1.0;
    aFactor = 1.0;
    izFactor = 1.0;
    applyAndSolve();
  }

  function loadLabel(i: number): string {
    const l = baseline?.loads[i];
    if (!l) return t('whatif.loadFallback').replace('{n}', String(i + 1));
    if (l.type === 'nodal') {
      const d = l.data as { fx: number; fy: number; mz: number };
      const parts: string[] = [];
      if (d.fx) parts.push(`Fx=${d.fx}`);
      if (d.fy) parts.push(`Fy=${d.fy}`);
      if (d.mz) parts.push(`Mz=${d.mz}`);
      return parts.join(', ') || `Nodal ${i + 1}`;
    }
    if (l.type === 'distributed') {
      const d = l.data as { qI: number; qJ: number };
      return d.qI === d.qJ ? `q=${d.qI}` : `q=${d.qI}→${d.qJ}`;
    }
    if (l.type === 'pointOnElement') {
      const d = l.data as { p: number };
      return `P=${d.p}`;
    }
    if (l.type === 'thermal') {
      return t('whatif.thermal');
    }
    if (l.type === 'nodal3d') {
      const d = l.data as { nodeId: number; fx: number; fy: number; fz: number };
      const parts: string[] = [];
      if (d.fx) parts.push(`Fx=${d.fx}`);
      if (d.fy) parts.push(`Fy=${d.fy}`);
      if (d.fz) parts.push(`Fz=${d.fz}`);
      return parts.join(', ') || `3D N${d.nodeId}`;
    }
    if (l.type === 'distributed3d') {
      const d = l.data as { elementId: number; qYI: number; qYJ: number; qZI: number; qZJ: number };
      return `Dist3D E${d.elementId}`;
    }
    return t('whatif.loadFallback').replace('{n}', String(i + 1));
  }

  function formatSci(v: number): string {
    if (Math.abs(v) >= 0.01 && Math.abs(v) < 10000) return v.toPrecision(4);
    return v.toExponential(2);
  }
</script>

{#if uiStore.showWhatIf}
  <div class="wif-panel">
    <div class="wif-header">
      <span class="wif-title">{t('whatif.title')}</span>
      <button class="wif-reset" onclick={resetAll} title={t('whatif.restoreOriginals')}>Reset</button>
      <button class="wif-close" onclick={close} title={t('whatif.closeAndRestore')}>✕</button>
    </div>

    <div class="wif-body">
      <!-- Load factors -->
      <div class="wif-section">
        <div class="wif-section-title">{t('whatif.loads')}</div>
        {#each loadFactors as factor, i}
          <div class="wif-slider-row">
            <label class="wif-label" title={loadLabel(i)}>{loadLabel(i)}</label>
            <input
              type="range"
              class="wif-range"
              min="0" max="3" step="0.05"
              bind:value={loadFactors[i]}
              oninput={applyAndSolve}
            />
            <span class="wif-val">{factor.toFixed(2)}x</span>
          </div>
        {/each}
      </div>

      <!-- Material -->
      <div class="wif-section">
        <div class="wif-section-title">{t('whatif.material')}</div>
        <div class="wif-slider-row">
          <label class="wif-label">E</label>
          <input
            type="range"
            class="wif-range"
            min="0.1" max="5" step="0.05"
            bind:value={eFactor}
            oninput={applyAndSolve}
          />
          <span class="wif-val" title="{(baselineE * eFactor).toFixed(0)} MPa">{eFactor.toFixed(2)}x</span>
        </div>
        <div class="wif-current">E = {formatSci(baselineE * eFactor)} MPa</div>
      </div>

      <!-- Section -->
      <div class="wif-section">
        <div class="wif-section-title">{t('whatif.section')}</div>
        <div class="wif-slider-row">
          <label class="wif-label">A</label>
          <input
            type="range"
            class="wif-range"
            min="0.1" max="5" step="0.05"
            bind:value={aFactor}
            oninput={applyAndSolve}
          />
          <span class="wif-val">{aFactor.toFixed(2)}x</span>
        </div>
        <div class="wif-current">A = {formatSci(baselineA * aFactor)} m²</div>

        <div class="wif-slider-row">
          <label class="wif-label">Iz</label>
          <input
            type="range"
            class="wif-range"
            min="0.1" max="5" step="0.05"
            bind:value={izFactor}
            oninput={applyAndSolve}
          />
          <span class="wif-val">{izFactor.toFixed(2)}x</span>
        </div>
        <div class="wif-current">Iz = {formatSci(baselineIz * izFactor)} m⁴</div>
      </div>
    </div>
  </div>
{/if}

<style>
  .wif-panel {
    position: absolute;
    top: 50px;
    right: 8px;
    z-index: 110;
    width: 220px;
    background: rgba(22, 33, 62, 0.96);
    border: 1px solid #1a4a7a;
    border-radius: 8px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 70px);
  }

  .wif-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid #1a4a7a;
  }

  .wif-title {
    flex: 1;
    font-size: 0.78rem;
    font-weight: 600;
    color: #4ecdc4;
  }

  .wif-reset {
    padding: 2px 6px;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.65rem;
  }

  .wif-reset:hover { background: #1a4a7a; color: #eee; }

  .wif-close {
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: #666;
    cursor: pointer;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .wif-close:hover { background: #e94560; color: white; }

  .wif-body {
    overflow-y: auto;
    padding: 6px 10px 10px;
  }

  .wif-section {
    margin-bottom: 10px;
  }

  .wif-section-title {
    font-size: 0.68rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    border-bottom: 1px solid rgba(26, 74, 122, 0.4);
    padding-bottom: 2px;
  }

  .wif-slider-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
  }

  .wif-label {
    font-size: 0.65rem;
    color: #aaa;
    min-width: 28px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60px;
  }

  .wif-range {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #1a4a7a;
    border-radius: 2px;
    outline: none;
  }

  .wif-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4ecdc4;
    cursor: pointer;
    border: none;
  }

  .wif-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #4ecdc4;
    cursor: pointer;
    border: none;
  }

  .wif-val {
    font-size: 0.65rem;
    color: #ccc;
    min-width: 35px;
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .wif-current {
    font-size: 0.6rem;
    color: #777;
    margin-bottom: 4px;
    font-family: 'Courier New', monospace;
    padding-left: 32px;
  }
</style>
