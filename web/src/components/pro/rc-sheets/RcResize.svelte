<script lang="ts">
  /**
   * Under an opened row: the size it would need to verify with the forces it has now (or a
   * smaller one that still does, for a column or a wall), worked out a frame after it opens, and
   * the way to its element in the model, where the size is changed.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { nextFrame } from '../../../lib/store/mesh-progress.svelte';
  import { goToRow, lineResizeHint, resizeHints, rowTargets, type GotoTarget, type ResizeHint } from '../../../lib/store/rc-sheets-resize';
  import type { SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import type { BeamRow } from '../../../lib/rc-sheets/beam-row';

  let { row, spans, onleave }: { row: SheetRow | LineLayout; spans?: BeamRow[]; onleave: () => void } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let hints = $state.raw<ResizeHint[] | null>(null);

  $effect(() => {
    const r = row, s = spans;
    let live = true;
    hints = null;
    void nextFrame().then(() => {
      if (!live) return;
      hints = 'spanAdopted' in r ? [lineResizeHint(s ?? [])].filter((h): h is ResizeHint => !!h) : resizeHints(r);
    });
    return () => { live = false; };
  });

  const cm = (v: number[]) => v.map((x) => fmt(x * 100, 0)).join(' × ');
  const targets = $derived(rowTargets(row));
  const isPunching = $derived(!('spanAdopted' in row) && row.family === 'punching');
  const gotoLabel = (g: GotoTarget) => t(isPunching ? (g === 'plates' ? 'rcSheets.goto.slab' : 'rcSheets.goto.column') : 'rcSheets.goto.element');
  function go(g: GotoTarget) { if (goToRow(row, g)) onleave(); }
</script>

<div class="rcz" data-testid="rc-resize">
  {#if hints === null}
    <span class="dim" data-testid="rc-resize-searching">{t('rcSheets.resize.searching')}</span>
  {:else}
    {#each hints as h (h.what)}
      <span class="hint" class:grow={h.direction === 'grow'} class:none={h.to === null} data-testid="rc-resize-hint" data-what={h.what}>
        {#if h.to === null}
          {tp(`rcSheets.resize.none.${h.what}`, { from: cm(h.from) })}
        {:else}
          {tp(`rcSheets.resize.${h.direction}.${h.what}`, { from: cm(h.from), to: cm(h.to), a: cm(h.to.slice(0, 1)), b: cm(h.to.slice(1, 2)) })}
        {/if}
      </span>
    {/each}
    {#if hints.length}<span class="dim">{t('rcSheets.resize.note')}</span>{/if}
  {/if}
  <span class="sp"></span>
  {#each targets as g (g)}
    <button type="button" class="rcz-btn" onclick={() => go(g)} data-testid="rc-goto-{g}">{gotoLabel(g)} →</button>
  {/each}
</div>

<style>
  .rcz { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0 0 8px; padding: 5px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); font-size: 0.72rem; color: var(--st-text-2); }
  .hint { color: var(--st-text); }
  .hint.grow { color: var(--st-warn); font-weight: 600; }
  .hint.none { color: var(--st-danger); }
  .dim { color: var(--st-text-3); }
  .sp { flex: 1; }
  .rcz-btn { font-size: 0.72rem; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; white-space: nowrap; }
  .rcz-btn:hover { border-color: var(--st-accent); }
</style>
