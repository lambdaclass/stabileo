<script lang="ts">
  /**
   * Where a placement goes on the grid: between two axes in X, two in Y, and from one level to
   * another. The ranges start as the whole grid and keep what the person chose while the grid
   * holds it.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';

  let { x0 = $bindable(''), x1 = $bindable(''), y0 = $bindable(''), y1 = $bindable(''), levelFrom = $bindable(''), levelTo = $bindable(''), levelsLabel, testid }: {
    x0?: string; x1?: string; y0?: string; y1?: string; levelFrom?: string; levelTo?: string;
    /** What the levels mean for this tool (columns run between them, beams sit on them). */
    levelsLabel: string; testid?: string;
  } = $props();

  const grid = $derived(modelStore.grid);
  const levels = $derived([...(grid?.levels ?? [])].sort((a, b) => a.z - b.z));
  const xs = $derived((grid?.axes ?? []).filter((a) => a.axis === 'x').sort((a, b) => a.at - b.at));
  const ys = $derived((grid?.axes ?? []).filter((a) => a.axis === 'y').sort((a, b) => a.at - b.at));
  const pick = <T extends { id: string }>(cur: string, list: T[], end: 'first' | 'last') =>
    list.some((a) => a.id === cur) ? cur : (end === 'first' ? list[0]?.id : list[list.length - 1]?.id) ?? '';
  $effect(() => {
    x0 = pick(x0, xs, 'first'); x1 = pick(x1, xs, 'last');
    y0 = pick(y0, ys, 'first'); y1 = pick(y1, ys, 'last');
    levelFrom = pick(levelFrom, levels, 'first'); levelTo = pick(levelTo, levels, 'last');
  });
</script>

<div class="br" data-testid={testid}>
  <span>{t('grid.dir.x')}</span>
  <select bind:value={x0} aria-label="{t('grid.dir.x')} 1">{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
  <select bind:value={x1} aria-label="{t('grid.dir.x')} 2">{#each xs as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
  <span>{t('grid.dir.y')}</span>
  <select bind:value={y0} aria-label="{t('grid.dir.y')} 1">{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
  <select bind:value={y1} aria-label="{t('grid.dir.y')} 2">{#each ys as a (a.id)}<option value={a.id}>{a.name}</option>{/each}</select>
  <span>{levelsLabel}</span>
  <select bind:value={levelFrom} data-testid="building-level-from">{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
  <select bind:value={levelTo} data-testid="building-level-to">{#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select>
</div>

<style>
  .br { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 4px 6px; align-items: center; font-size: 0.7rem; margin: 4px 0; color: var(--st-text-2); }
  .br select { font-size: 0.72rem; min-width: 0; }
</style>
