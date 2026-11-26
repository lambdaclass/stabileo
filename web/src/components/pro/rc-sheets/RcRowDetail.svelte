<script lang="ts">
  import { t } from '../../../lib/i18n';
  import type { SheetRow, SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import type { SheetCode } from '../../../lib/rc-sheets/types';
  import RcSteps from './RcSteps.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcCombos from './RcCombos.svelte';
  import RcRowEditor from './RcRowEditor.svelte';
  import RcColumnSection from './RcColumnSection.svelte';
  import RcColumnElevation from './RcColumnElevation.svelte';
  import RcSlabLayers from './RcSlabLayers.svelte';
  import RcWallDetail from './RcWallDetail.svelte';
  import RcPunchingSvg from './RcPunchingSvg.svelte';
  import RcResize from './RcResize.svelte';
  import { showRebarOf } from '../../../lib/store/rc-rebar-3d.svelte';

  let { row: r, rows, code, endZones, slabCover, onleave }: { row: SheetRow; rows: SheetRows; code: SheetCode; endZones: boolean; slabCover: number; onleave: () => void } = $props();
</script>

{#if r.family !== 'punching'}<button type="button" class="rcs-btn rcw-3d" onclick={() => { showRebarOf(r); onleave(); }} data-testid="rc-view-3d">{t('rcSheets.r3d.show')}</button>{/if}
<RcResize row={r} walls={rows.wall} {onleave} />
{#if r.family !== 'punching'}<RcRowEditor row={r} />{/if}
{#if r.family === 'column'}
  <div class="rcw-secs">
    <RcColumnSection row={r} all={rows.column} {code} {endZones} />
    <RcColumnElevation row={r} {code} {endZones} />
  </div>
{:else if r.family === 'slab'}
  <div class="rcw-secs"><RcSlabLayers row={r} cover={slabCover} /></div>
{:else if r.family === 'wall'}
  <div class="rcw-secs"><RcWallDetail row={r} {code} /></div>
{:else if r.family === 'punching' && r.figure}
  <div class="rcw-secs"><RcPunchingSvg fig={r.figure} name={r.name} /></div>
{/if}
<RcChecks lines={r.verifications} kind={r.family === 'beam' || r.family === 'column' ? r.family : undefined} />
<details open={r.status === 'fail'}>
  <summary>{t('rcSheets.combo.title')} ({r.combos.rows.length})</summary>
  <RcCombos table={r.combos} />
</details>
<details open>
  <summary>{t('rcSheets.steps')}</summary>
  <RcSteps groups={r.steps} />
</details>

<style>
  details { margin: 4px 0 8px; }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcw-3d { float: right; margin: 2px 0 4px 8px; }
  .rcw-secs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 6px 0 8px; min-width: 0; }
</style>
