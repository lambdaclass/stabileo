<script lang="ts">
  /**
   * The full stress and strain state at the queried fibre.
   *
   * Sits directly above Mohr's circle, and the order is the argument: Mohr is a
   * two-dimensional slice of what this section states in full. Reading the
   * tensor first and the circle second is the direction the theory runs — the
   * circle is a construction ON a stress state, not a substitute for one.
   *
   * The zeros in the stress tensor are printed, not elided. They are a
   * MODELLING ASSUMPTION of beam theory (no transverse normal stress, no
   * transverse shear between the in-plane directions), and a student who never
   * sees them written has no way to know that the three numbers a beam formula
   * produces are a special case rather than the general state.
   *
   * Strain needs elastic constants, so this section is absent — rather than
   * blank or zero-filled — when the member's material carries none.
   */
  import type { StressTensorState } from '../../lib/section/tensors';
  import { tensorRows } from '../../lib/section/tensors';
  import { t } from '../../lib/i18n';
  import { fmt } from './fmt';

  interface Props {
    showTensors: boolean;
    tensors: StressTensorState | null;
    /** Yield stress, MPa — lets von Mises be shown as a utilisation. */
    fy?: number;
  }

  let { showTensors = $bindable(), tensors, fy }: Props = $props();

  const stressRows = $derived(tensors ? tensorRows(tensors.stress) : []);
  // Microstrain: strains run around 1e-3 and a table of "0.0012" reads far
  // worse than one of "1200 µε", which is also the unit strain gauges report.
  const strainRows = $derived(
    tensors ? tensorRows(tensors.strain).map((r) => r.map((v) => v * 1e6)) : [],
  );
  const vonMises = $derived(tensors ? Math.sqrt(3 * tensors.invariants.j2) : 0);
  const utilisation = $derived(fy && fy > 0 ? vonMises / fy : null);
</script>

<button class="ssp-section-toggle" onclick={() => showTensors = !showTensors}>
  <span class="ssp-chevron">{showTensors ? '▾' : '▸'}</span>
  {t('stress.tensors')}
  <span class="ssp-help ssp-help-inline" title={t('stress.tensorsHelp')}>?</span>
</button>

{#if showTensors}
  {#if !tensors}
    <p class="ssp-tensor-empty">{t('stress.tensorsNoElastic')}</p>
  {:else}
    <div class="ssp-tensor-block">
      <!-- ── Stress tensor ──────────────────────────────── -->
      <div class="ssp-tensor-head">
        <span>{t('stress.tensorStress')}</span><span class="ssp-tensor-unit">MPa</span>
      </div>
      <div class="ssp-matrix">
        <span class="ssp-bracket">⎡<br />⎢<br />⎣</span>
        <div class="ssp-matrix-grid">
          {#each stressRows as row}
            {#each row as v}
              <span class="ssp-cell" class:zero={v === 0}>{fmt(v)}</span>
            {/each}
          {/each}
        </div>
        <span class="ssp-bracket">⎤<br />⎥<br />⎦</span>
      </div>
      <p class="ssp-tensor-note">{t('stress.tensorZerosNote')}</p>

      <!-- ── Strain tensor ──────────────────────────────── -->
      <div class="ssp-tensor-head">
        <span>{t('stress.tensorStrain')}</span><span class="ssp-tensor-unit">µε</span>
      </div>
      <div class="ssp-matrix">
        <span class="ssp-bracket">⎡<br />⎢<br />⎣</span>
        <div class="ssp-matrix-grid">
          {#each strainRows as row}
            {#each row as v}
              <span class="ssp-cell" class:zero={v === 0}>{fmt(v, 0)}</span>
            {/each}
          {/each}
        </div>
        <span class="ssp-bracket">⎤<br />⎥<br />⎦</span>
      </div>
      <p class="ssp-tensor-note">{t('stress.tensorPoissonNote')}</p>

      <!-- ── Principal values and invariants ────────────── -->
      <div class="ssp-tensor-rows">
        <div class="ssp-trow">
          <span class="ssp-tlabel">&sigma;<sub>1,2,3</sub></span>
          <span class="ssp-tval">
            {fmt(tensors.principalStress.values[0])} / {fmt(tensors.principalStress.values[1])} / {fmt(tensors.principalStress.values[2])}
            <span class="ssp-tunit">MPa</span>
          </span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">&theta;<sub>p</sub></span>
          <span class="ssp-tval">{tensors.principalStress.angleDeg.toFixed(1)}<span class="ssp-tunit">&deg;</span></span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">&tau;<sub>max</sub></span>
          <span class="ssp-tval">{fmt(tensors.principalStress.maxShear)}<span class="ssp-tunit">MPa</span></span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">I<sub>1</sub></span>
          <span class="ssp-tval">{fmt(tensors.invariants.i1)}<span class="ssp-tunit">MPa</span></span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">J<sub>2</sub></span>
          <span class="ssp-tval">{fmt(tensors.invariants.j2)}<span class="ssp-tunit">MPa²</span></span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">&sigma;<sub>{t('stress.hydrostaticSub')}</sub></span>
          <span class="ssp-tval">{fmt(tensors.invariants.hydrostatic)}<span class="ssp-tunit">MPa</span></span>
        </div>
        <div class="ssp-trow ssp-trow-vm">
          <span class="ssp-tlabel">&sigma;<sub>vM</sub></span>
          <span class="ssp-tval">
            {fmt(vonMises)}<span class="ssp-tunit">MPa</span>
            {#if utilisation !== null}
              <span class="ssp-util" class:over={utilisation > 1}>
                {(utilisation * 100).toFixed(0)}% f<sub>y</sub>
              </span>
            {/if}
          </span>
        </div>
        <div class="ssp-trow">
          <span class="ssp-tlabel">&epsilon;<sub>vol</sub></span>
          <span class="ssp-tval">{fmt(tensors.volumetricStrain * 1e6, 0)}<span class="ssp-tunit">µε</span></span>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .ssp-section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0;
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }
  .ssp-section-toggle:hover { color: var(--st-text-2); }
  .ssp-chevron { font-size: 0.6rem; width: 10px; }

  .ssp-tensor-block { padding: 4px 0 8px; }
  .ssp-tensor-empty {
    margin: 6px 0 8px;
    font-size: 0.65rem;
    color: var(--st-text-3);
    line-height: 1.45;
  }

  .ssp-tensor-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 6px 0 3px;
    font-size: 0.64rem;
    color: var(--st-text-3);
  }
  .ssp-tensor-unit { font-family: 'Courier New', monospace; opacity: 0.75; }

  .ssp-matrix {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 2px;
    padding: 2px 0;
  }
  .ssp-bracket {
    font-size: 0.7rem;
    line-height: 1.5;
    color: var(--st-text-3);
    user-select: none;
  }
  .ssp-matrix-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px 6px;
    flex: 1;
    max-width: 210px;
  }
  .ssp-cell {
    font-family: 'Courier New', monospace;
    font-size: 0.66rem;
    line-height: 1.5;
    text-align: right;
    color: var(--st-text-2);
    /* A long value must not widen the column and shear the matrix out of
       alignment — a misaligned matrix stops reading as a matrix. */
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The assumed zeros, dimmed: present and legible, but visibly not measured. */
  .ssp-cell.zero { color: var(--st-text-3); opacity: 0.5; }

  .ssp-tensor-note {
    margin: 2px 0 0;
    font-size: 0.58rem;
    line-height: 1.4;
    color: var(--st-text-3);
    opacity: 0.8;
  }

  .ssp-tensor-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(26, 74, 122, 0.3);
  }
  .ssp-trow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }
  .ssp-tlabel { color: var(--st-text-3); flex: none; }
  .ssp-tval {
    font-family: 'Courier New', monospace;
    color: var(--st-text-2);
    text-align: right;
  }
  .ssp-tunit { color: var(--st-text-3); opacity: 0.7; margin-left: 3px; font-size: 0.9em; }
  .ssp-trow-vm .ssp-tval { color: var(--st-value); }
  .ssp-util {
    margin-left: 5px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(42, 168, 105, 0.15);
    color: var(--st-ok);
    font-size: 0.9em;
  }
  .ssp-util.over { background: rgba(214, 69, 69, 0.18); color: var(--st-danger); }

  .ssp-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(127, 212, 204, 0.12);
    color: var(--st-value);
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(127, 212, 204, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }
  .ssp-help:hover { opacity: 1; background: rgba(127, 212, 204, 0.25); }
  .ssp-help-inline { margin-left: auto; }
</style>
