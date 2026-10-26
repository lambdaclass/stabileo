<script lang="ts">
  /**
   * The Building panel's tools beyond placing one kind of element: a ramp across a bay, copying a
   * level's elements to others, and a rigid diaphragm per level.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { placeRamp } from '../../../lib/model/building/build-on-grid';
  import { addLevelDiaphragms } from '../../../lib/model/building/diaphragms';
  import { copyToLevels } from '../../../lib/model/building/copy-levels';
  import type { PhysicalKind } from '../../../lib/model/physical';

  let { materialId, meshSize, report }: { materialId: number; meshSize: number; report: (text: string) => void } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const xs = $derived((grid?.axes ?? []).filter((a) => a.axis === 'x').sort((a, b) => a.at - b.at));
  const ys = $derived((grid?.axes ?? []).filter((a) => a.axis === 'y').sort((a, b) => a.at - b.at));
  const first = <T extends { id: string }>(cur: string, list: T[], end: 'first' | 'last' | number) =>
    list.some((a) => a.id === cur) ? cur : (end === 'first' ? list[0]?.id : end === 'last' ? list[list.length - 1]?.id : list[end]?.id) ?? '';

  // ── Ramp ──
  let rx0 = $state(''), rx1 = $state(''), ry0 = $state(''), ry1 = $state(''), rLow = $state(''), rHigh = $state('');
  let rises = $state<'x' | 'y'>('x'), rampThickness = $state(0.2);
  $effect(() => {
    rx0 = first(rx0, xs, 'first'); rx1 = first(rx1, xs, 1);
    ry0 = first(ry0, ys, 'first'); ry1 = first(ry1, ys, 1);
    rLow = first(rLow, levels, 'first'); rHigh = first(rHigh, levels, 1);
  });
  function ramp() {
    if (!grid) return;
    const r = placeRamp(grid, { x: [rx0, rx1], y: [ry0, ry1], levelLow: rLow, levelHigh: rHigh, rises, thickness: rampThickness, materialId, meshSize });
    report(r.created > 0 ? tp('building.placed', { n: r.created, bars: 0, shells: r.shells }) : t(`building.refused.${r.refused ?? 'ramp'}`));
  }

  // ── Diaphragm ──
  function diaphragms() {
    const r = addLevelDiaphragms(levels.map((l) => l.z));
    report(tp('building.diaphragmsAdded', { n: r.added, existing: r.existing }));
  }

  // ── Copy between levels ──
  const COPY_KINDS: PhysicalKind[] = ['column', 'beam', 'brace', 'slab', 'wall'];
  let copyFrom = $state(''), copyTo = $state<string[]>([]), copyKinds = $state<PhysicalKind[]>([...COPY_KINDS]);
  $effect(() => { copyFrom = first(copyFrom, levels, 1); });
  function copy() {
    if (!grid) return;
    const r = copyToLevels(grid, { from: copyFrom, to: copyTo, kinds: copyKinds });
    report(r.refused ? t(`building.copyRefused.${r.refused}`) : tp('building.copied', { n: r.copied, levels: r.levels }));
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
</script>

{#if xs.length >= 2 && ys.length >= 2}
  <section class="pk-card" data-testid="building-ramp">
    <h5 class="bt-h">{t('building.rampTitle')}</h5>
    <div class="bt-grid">
      <span>{t('grid.dir.x')}</span>
      <select bind:value={rx0}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
      <select bind:value={rx1}>{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
      <span>{t('grid.dir.y')}</span>
      <select bind:value={ry0}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
      <select bind:value={ry1}>{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
      <span>{t('building.rampLevels')}</span>
      <select bind:value={rLow}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
      <select bind:value={rHigh}>{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
    </div>
    <div class="bt-row">
      <label class="bt-inline">{t('building.rises')}
        <select bind:value={rises}><option value="x">X</option><option value="y">Y</option></select>
      </label>
      <label class="bt-inline">{t('building.thickness')} <input type="number" min="0.05" step="0.01" bind:value={rampThickness} /></label>
      <button class="pk-btn pk-btn-primary" onclick={ramp} data-testid="building-place-ramp">{t('building.place')}</button>
    </div>
  </section>
{/if}

<section class="pk-card" data-testid="building-copy">
  <h5 class="bt-h">{t('building.copyTitle')}</h5>
  <p class="pk-hint">{t('building.copyHint')}</p>
  <div class="bt-row">
    <label class="bt-inline">{t('building.copyFrom')}
      <select bind:value={copyFrom} data-testid="building-copy-from">{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
    </label>
  </div>
  <div class="bt-row" role="group" aria-label={t('building.copyTo')}>
    <span class="bt-label">{t('building.copyTo')}</span>
    {#each levels.filter((l) => l.id !== copyFrom) as l (l.id)}
      <label><input type="checkbox" checked={copyTo.includes(l.id)} onchange={() => (copyTo = toggle(copyTo, l.id))} data-testid="building-copy-to-{l.name}" /> {l.name}</label>
    {/each}
  </div>
  <div class="bt-row" role="group" aria-label={t('physical.kindCol')}>
    {#each COPY_KINDS as k}
      <label><input type="checkbox" checked={copyKinds.includes(k)} onchange={() => (copyKinds = toggle(copyKinds, k))} /> {t(`physical.kind.${k}`)}</label>
    {/each}
  </div>
  <button class="pk-btn pk-btn-primary" onclick={copy} disabled={copyTo.length === 0 || copyKinds.length === 0} data-testid="building-copy-run">{t('building.copy')}</button>
</section>

<section class="pk-card" data-testid="building-diaphragm">
  <h5 class="bt-h">{t('building.diaphragmTitle')}</h5>
  <p class="pk-hint">{t('building.diaphragmHint')}</p>
  <button class="pk-btn" onclick={diaphragms} data-testid="building-diaphragms">{t('building.diaphragmAdd')}</button>
</section>

<style>
  .bt-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .bt-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; }
  .bt-row .on { border-color: var(--st-accent); color: var(--st-text); }
  .bt-inline { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .bt-inline input { width: 4.5rem; font-size: 0.72rem; }
  .bt-label { color: var(--st-text-2); }
  .bt-grid { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 4px 6px; align-items: center; font-size: 0.7rem; margin: 4px 0; }
  .bt-grid select { min-width: 0; font-size: 0.72rem; }
</style>
