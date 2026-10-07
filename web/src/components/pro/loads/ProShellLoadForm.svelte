<script lang="ts">
  /**
   * The values of a load on shells, for the write card: an area load with its direction, its field
   * and its extent; a fluid to a level; a force at a point. `build` turns them into the model's
   * loads on the shells picked, or the reason it does not, as i18n keys
   * (`model/loads/shell-load-form.ts`, which reads the numbers by the app's one rule).
   *
   * Pressures in kN/m², coordinates in m, a force in kN, in SI as the rest of the card.
   */
  import { t } from '../../../lib/i18n';
  import { buildShellLoads, type ShellLoadFields } from '../../../lib/model/loads/shell-load-form';
  import type { ShellRef } from '../../../lib/model/loads/shell-load-tools';
  import type { WriteOutcome, WriteRefusal } from '../../../lib/model/loads/write-load';

  interface Props { kind: 'surface' | 'hydro' | 'shellPoint' }
  let { kind }: Props = $props();

  // ── Area load ──
  let dirMode = $state<ShellLoadFields['dirMode']>('down');
  let dirAxis = $state<'X' | 'Y' | 'Z'>('Z');
  let field = $state<ShellLoadFields['field']>('uniform');
  let q = $state('');
  let qc = $state('');
  let va = $state({ axis: 'Z' as 'X' | 'Y' | 'Z', c1: '', q1: '', c2: '', q2: '' });
  let partial = $state(false);
  let rect = $state({ plane: 'XY' as 'XY' | 'XZ' | 'YZ', u1: '', v1: '', u2: '', v2: '' });
  // ── Fluid ──
  let gamma = $state('10');
  let level = $state('');
  let inside = $state({ x: '', y: '', z: '' });
  // ── Point ──
  let at = $state({ x: '', y: '', z: '' });
  let pf = $state({ fx: '', fy: '', fz: '' });

  /** The loads on the shells picked, or why there are none. */
  export function build(shells: readonly ShellRef[], caseId: number | undefined): WriteOutcome | WriteRefusal {
    return buildShellLoads(kind, { dirMode, dirAxis, field, q, qc, va, partial, rect, gamma, level, inside, at, pf }, shells, caseId);
  }
</script>

{#if kind === 'surface'}
  <div class="sl-row">
    <label>{t('writeLoad.shell.direction')}
      <select bind:value={dirMode} data-testid="wl-sl-dir">
        <option value="down">{t('writeLoad.shell.dir.down')}</option>
        <option value="local">{t('writeLoad.shell.dir.local')}</option>
        <option value="global">{t('writeLoad.shell.dir.global')}</option>
        <option value="projected">{t('writeLoad.shell.dir.projected')}</option>
      </select>
    </label>
    {#if dirMode === 'global' || dirMode === 'projected'}
      <select bind:value={dirAxis} data-testid="wl-sl-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>+{a}</option>{/each}</select>
    {/if}
  </div>
  <div class="sl-row">
    <label>{t('writeLoad.shell.field')}
      <select bind:value={field} data-testid="wl-sl-field">
        <option value="uniform">{t('writeLoad.shell.field.uniform')}</option>
        <option value="corners">{t('writeLoad.shell.field.corners')}</option>
        <option value="axis">{t('writeLoad.shell.field.axis')}</option>
      </select>
    </label>
  </div>
  {#if field === 'uniform'}
    <div class="sl-row"><label>q <input type="text" bind:value={q} class="sl-num" placeholder="kN/m²" data-testid="wl-sq" /></label></div>
  {:else if field === 'corners'}
    <div class="sl-row"><label>q₁; q₂; q₃; q₄ <input type="text" bind:value={qc} class="sl-wide" placeholder="kN/m²" data-testid="wl-sl-corners" /></label></div>
  {:else}
    <div class="sl-row">
      <select bind:value={va.axis} data-testid="wl-sl-vary-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>{a}</option>{/each}</select>
      <label>c₁ <input type="text" bind:value={va.c1} class="sl-num" placeholder="m" data-testid="wl-sl-c1" /></label>
      <label>q₁ <input type="text" bind:value={va.q1} class="sl-num" placeholder="kN/m²" data-testid="wl-sl-q1" /></label>
      <label>c₂ <input type="text" bind:value={va.c2} class="sl-num" placeholder="m" data-testid="wl-sl-c2" /></label>
      <label>q₂ <input type="text" bind:value={va.q2} class="sl-num" placeholder="kN/m²" data-testid="wl-sl-q2" /></label>
    </div>
    <p class="sl-hint">{t('writeLoad.shell.varyHint')}</p>
  {/if}
  <label class="sl-check"><input type="checkbox" bind:checked={partial} data-testid="wl-sl-partial" /> {t('writeLoad.shell.partial')}</label>
  {#if partial}
    <div class="sl-row">
      <select bind:value={rect.plane} data-testid="wl-sl-plane">{#each ['XY', 'XZ', 'YZ'] as p (p)}<option value={p}>{p}</option>{/each}</select>
      <label>{rect.plane[0]}₁ <input type="text" bind:value={rect.u1} class="sl-num" data-testid="wl-sl-u1" /></label>
      <label>{rect.plane[1]}₁ <input type="text" bind:value={rect.v1} class="sl-num" data-testid="wl-sl-v1" /></label>
      <label>{rect.plane[0]}₂ <input type="text" bind:value={rect.u2} class="sl-num" data-testid="wl-sl-u2" /></label>
      <label>{rect.plane[1]}₂ <input type="text" bind:value={rect.v2} class="sl-num" data-testid="wl-sl-v2" /></label>
    </div>
    <p class="sl-hint">{t('writeLoad.shell.partialHint')}</p>
  {/if}
{:else if kind === 'hydro'}
  <div class="sl-row">
    <label>γ <input type="text" bind:value={gamma} class="sl-num" placeholder="kN/m³" data-testid="wl-hy-gamma" /></label>
    <label>{t('writeLoad.shell.level')} <input type="text" bind:value={level} class="sl-num" placeholder="m" data-testid="wl-hy-level" /></label>
  </div>
  <div class="sl-row">
    <span>{t('writeLoad.shell.inside')}</span>
    <label>X <input type="text" bind:value={inside.x} class="sl-num" data-testid="wl-hy-x" /></label>
    <label>Y <input type="text" bind:value={inside.y} class="sl-num" data-testid="wl-hy-y" /></label>
    <label>Z <input type="text" bind:value={inside.z} class="sl-num" data-testid="wl-hy-z" /></label>
  </div>
  <p class="sl-hint">{t('writeLoad.shell.hydroHint')}</p>
{:else}
  <div class="sl-row">
    <span>{t('writeLoad.shell.at')}</span>
    <label>X <input type="text" bind:value={at.x} class="sl-num" placeholder="m" data-testid="wl-sp-x" /></label>
    <label>Y <input type="text" bind:value={at.y} class="sl-num" placeholder="m" data-testid="wl-sp-y" /></label>
    <label>Z <input type="text" bind:value={at.z} class="sl-num" placeholder="m" data-testid="wl-sp-z" /></label>
  </div>
  <div class="sl-row">
    <label>Fx <input type="text" bind:value={pf.fx} class="sl-num" placeholder="kN" data-testid="wl-sp-fx" /></label>
    <label>Fy <input type="text" bind:value={pf.fy} class="sl-num" placeholder="kN" data-testid="wl-sp-fy" /></label>
    <label>Fz <input type="text" bind:value={pf.fz} class="sl-num" placeholder="kN" data-testid="wl-sp-fz" /></label>
  </div>
  <p class="sl-hint">{t('writeLoad.shell.pointHint')}</p>
{/if}

<style>
  .sl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 0.7rem; color: var(--st-text-2); }
  .sl-row label { display: inline-flex; align-items: center; gap: 4px; }
  .sl-row select, .sl-num, .sl-wide { padding: 3px 5px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.74rem; font-family: var(--st-mono); }
  .sl-num { width: 58px; }
  .sl-wide { width: 160px; }
  .sl-check { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; color: var(--st-text-2); }
  .sl-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
</style>
