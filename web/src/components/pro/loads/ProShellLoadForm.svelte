<script lang="ts">
  /**
   * The values of a load on shells, for the write card: an area load with its direction, its field
   * and its extent; a fluid to a level; a force at a point. `build` turns them into the model's
   * loads on the shells picked, or the reason it does not, as i18n keys
   * (`model/loads/shell-load-form.ts`, which reads the numbers by the app's one rule).
   *
   * Every magnitude is typed in the display units (`QuantityInput`) and kept here in SI, `null`
   * while empty; the list of corner values is read the same way, value by value.
   */
  import { t } from '../../../lib/i18n';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { fromDisplay, unitLabel } from '../../../lib/utils/units';
  import QuantityInput from './QuantityInput.svelte';
  import type { SketchInput } from './LoadSketch.svelte';
  import { buildShellLoads, type ShellLoadFields } from '../../../lib/model/loads/shell-load-form';
  import type { ShellRef } from '../../../lib/model/loads/shell-load-tools';
  import type { WriteOutcome, WriteRefusal } from '../../../lib/model/loads/write-load';

  interface Props {
    kind: 'surface' | 'hydro' | 'shellPoint';
    /** What the fields say, for the card's sketch (`LoadSketch`). */
    sketch?: SketchInput['shell'];
  }
  let { kind, sketch = $bindable() }: Props = $props();

  type N = number | null;

  // ── Area load ──
  let dirMode = $state<ShellLoadFields['dirMode']>('down');
  let dirAxis = $state<'X' | 'Y' | 'Z'>('Z');
  let field = $state<ShellLoadFields['field']>('uniform');
  let q = $state<N>(null);
  let qc = $state('');
  let va = $state<{ axis: 'X' | 'Y' | 'Z'; c1: N; q1: N; c2: N; q2: N }>({ axis: 'Z', c1: null, q1: null, c2: null, q2: null });
  let partial = $state(false);
  let rect = $state<{ plane: 'XY' | 'XZ' | 'YZ'; u1: N; v1: N; u2: N; v2: N }>({ plane: 'XY', u1: null, v1: null, u2: null, v2: null });
  // ── Fluid ──
  let gamma = $state<N>(10);
  let level = $state<N>(null);
  let inside = $state<Record<'x' | 'y' | 'z', N>>({ x: null, y: null, z: null });
  // ── Point ──
  let at = $state<Record<'x' | 'y' | 'z', N>>({ x: null, y: null, z: null });
  let pf = $state<Record<'fx' | 'fy' | 'fz', N>>({ fx: null, fy: null, fz: null });

  $effect(() => {
    const corners = qc.split(';').map((x) => parseDecimal(x.trim())).filter((x): x is number => x !== null);
    sketch = { dirMode, dirAxis, field, q, corners, va: { ...va }, partial, rect: { ...rect }, gamma, level, inside: { ...inside }, at: { ...at }, pf: { ...pf } };
  });

  /** The loads on the shells picked, or why there are none. */
  export function build(shells: readonly ShellRef[], caseId: number | undefined): WriteOutcome | WriteRefusal {
    return buildShellLoads(kind, { dirMode, dirAxis, field, q, qc, va, partial, rect, gamma, level, inside, at, pf }, shells, caseId,
      (v) => fromDisplay(v, 'areaLoad', uiStore.unitSystem));
  }
</script>

{#if kind === 'surface'}
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.direction')}</span>
    <span class="fg-wide">
      <select class="fg-wide" bind:value={dirMode} data-testid="wl-sl-dir">
        <option value="down">{t('writeLoad.shell.dir.down')}</option>
        <option value="local">{t('writeLoad.shell.dir.local')}</option>
        <option value="global">{t('writeLoad.shell.dir.global')}</option>
        <option value="projected">{t('writeLoad.shell.dir.projected')}</option>
      </select>
      {#if dirMode === 'global' || dirMode === 'projected'}
        <select class="fg-in sl-axis" bind:value={dirAxis} data-testid="wl-sl-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>+{a}</option>{/each}</select>
      {/if}
    </span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.field')}</span>
    <select class="fg-wide" bind:value={field} data-testid="wl-sl-field">
      <option value="uniform">{t('writeLoad.shell.field.uniform')}</option>
      <option value="corners">{t('writeLoad.shell.field.corners')}</option>
      <option value="axis">{t('writeLoad.shell.field.axis')}</option>
    </select></div>
  {#if field === 'uniform'}
    <div class="fg-r"><span class="fg-l">q</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={q} quantity="areaLoad" testid="wl-sq" /><span class="fg-u">{unitLabel('areaLoad', uiStore.unitSystem)}</span></div>
  {:else if field === 'corners'}
    <div class="fg-r"><span class="fg-l">q₁; q₂; q₃; q₄</span><input type="text" bind:value={qc} class="fg-in sl-list" data-testid="wl-sl-corners" /><span class="fg-u sl-list-u">{unitLabel('areaLoad', uiStore.unitSystem)}</span></div>
  {:else}
    <div class="fg-r"><span class="fg-l">{t('loadTarget.axis')}</span><select class="fg-in" bind:value={va.axis} data-testid="wl-sl-vary-axis">{#each ['X', 'Y', 'Z'] as a (a)}<option value={a}>{a}</option>{/each}</select></div>
    <div class="fg-r fg-head"><span></span><span>{va.axis} ({unitLabel('length', uiStore.unitSystem)})</span><span>q ({unitLabel('areaLoad', uiStore.unitSystem)})</span></div>
    <div class="fg-r"><span class="fg-l">1</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.c1} quantity="length" testid="wl-sl-c1" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.q1} quantity="areaLoad" testid="wl-sl-q1" /></div>
    <div class="fg-r"><span class="fg-l">2</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.c2} quantity="length" testid="wl-sl-c2" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={va.q2} quantity="areaLoad" testid="wl-sl-q2" /></div>
    <p class="wl-hint fg-full">{t('writeLoad.shell.varyHint')}</p>
  {/if}
  <label class="wl-check fg-full"><input type="checkbox" bind:checked={partial} data-testid="wl-sl-partial" /> {t('writeLoad.shell.partial')}</label>
  {#if partial}
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.plane')}</span><select class="fg-in" bind:value={rect.plane} data-testid="wl-sl-plane">{#each ['XY', 'XZ', 'YZ'] as p (p)}<option value={p}>{p}</option>{/each}</select></div>
    <div class="fg-r fg-head"><span></span><span>{rect.plane[0]}</span><span>{rect.plane[1]}</span></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.corner')} 1</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.u1} quantity="length" testid="wl-sl-u1" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.v1} quantity="length" testid="wl-sl-v1" /><span class="fg-u fg-u2">{unitLabel('length', uiStore.unitSystem)}</span></div>
    <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.corner')} 2</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.u2} quantity="length" testid="wl-sl-u2" /><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={rect.v2} quantity="length" testid="wl-sl-v2" /><span class="fg-u fg-u2">{unitLabel('length', uiStore.unitSystem)}</span></div>
    <p class="wl-hint fg-full">{t('writeLoad.shell.partialHint')}</p>
  {/if}
{:else if kind === 'hydro'}
  <div class="fg-r"><span class="fg-l">γ</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={gamma} quantity="density" testid="wl-hy-gamma" /><span class="fg-u">{unitLabel('density', uiStore.unitSystem)}</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.shell.level')}</span><QuantityInput nullable showUnit={false} cls="fg-in" bind:value={level} quantity="length" testid="wl-hy-level" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.inside')}</p>
  <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.point')}</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.x} quantity="length" testid="wl-hy-x" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.y} quantity="length" testid="wl-hy-y" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={inside.z} quantity="length" testid="wl-hy-z" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.hydroHint')}</p>
{:else}
  <div class="fg-r fg-head"><span></span><span>X</span><span>Y</span><span>Z</span></div>
  <div class="fg-r"><span class="fg-l">{t('writeLoad.point')}</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.x} quantity="length" testid="wl-sp-x" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.y} quantity="length" testid="wl-sp-y" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={at.z} quantity="length" testid="wl-sp-z" /><span class="fg-u">{unitLabel('length', uiStore.unitSystem)}</span></div>
  <div class="fg-r"><span class="fg-l">F</span>
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fx} quantity="force" testid="wl-sp-fx" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fy} quantity="force" testid="wl-sp-fy" />
    <QuantityInput nullable showUnit={false} cls="fg-in" bind:value={pf.fz} quantity="force" testid="wl-sp-fz" /><span class="fg-u">{unitLabel('force', uiStore.unitSystem)}</span></div>
  <p class="wl-hint fg-full">{t('writeLoad.shell.pointHint')}</p>
{/if}

<style>
  /* The grid and its cells are the card's (`ProWriteLoadCard`), shared with every other kind. */
  :global(.wl .fg-r) .sl-list { grid-column: 2 / 5; }
  .sl-axis { width: auto; }
</style>
