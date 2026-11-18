<script lang="ts">
  /**
   * Under an opened row: where its proposal finds no reinforcement for its section and concrete,
   * that it has none and the alternatives it verifies with, each applied to the model with a
   * button; otherwise the size it would need (or a smaller one that still does, for a column or a
   * wall). Worked out a frame after it opens. Then the way to its element in the model.
   */
  import { t, tp, i18n, tpn } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { nextFrame } from '../../../lib/store/mesh-progress.svelte';
  import { uiStore } from '../../../lib/store';
  import { designData } from '../../../lib/store/design-data';
  import { DEFAULT_FC_MAX } from '../../../lib/rc-sheets/concrete-classes';
  import { alternatives, goToRow, lineAlternatives, lineResizeHint, noArrangement, resizeHints, rowTargets, wallsToHold, type Alternative, type GotoTarget, type ResizeHint } from '../../../lib/store/rc-sheets-resize';
  import { applyAlternative, canApply } from '../../../lib/store/rc-sheets-apply';
  import { holdWallBasesAndDesign, sheetsSolve } from '../../../lib/store/rc-sheets-solve.svelte';
  import type { SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import type { BeamRow } from '../../../lib/rc-sheets/beam-row';

  let { row, spans, walls = [], onleave }: { row: SheetRow | LineLayout; spans?: BeamRow[]; walls?: readonly SheetRow[]; onleave: () => void } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let hints = $state.raw<ResizeHint[] | null>(null);
  let alts = $state.raw<Alternative[]>([]);
  const none = $derived(noArrangement(row, spans ?? []));

  $effect(() => {
    const r = row, s = spans, empty = none;
    let live = true;
    hints = null;
    alts = [];
    void nextFrame().then(() => {
      if (!live) return;
      if (empty) {
        alts = 'spanAdopted' in r ? lineAlternatives(r, s ?? []) : alternatives(r);
        hints = 'spanAdopted' in r ? [] : resizeHints(r).filter((h) => h.what === 'punchCapital' || h.what === 'punchDrop');
        return;
      }
      hints = 'spanAdopted' in r ? [lineResizeHint(s ?? [])].filter((h): h is ResizeHint => !!h) : resizeHints(r);
    });
    return () => { live = false; };
  });
  const fcMax = $derived(designData().designOptions?.alternatives?.fcMax ?? DEFAULT_FC_MAX);
  function apply(a: Alternative) {
    const done = applyAlternative(row, a);
    if (!done) return;
    uiStore.toast(tp('rcSheets.alt.applied', { name: done.name, n: done.members + done.plates }), 'success');
    onleave();
  }

  const cm = (v: number[]) => v.map((x) => fmt(x * 100, 0)).join(' × ');
  const targets = $derived(rowTargets(row));
  const isPunching = $derived(!('spanAdopted' in row) && row.family === 'punching');
  const gotoLabel = (g: GotoTarget) => t(isPunching ? (g === 'plates' ? 'rcSheets.goto.slab' : 'rcSheets.goto.column') : 'rcSheets.goto.element');
  function go(g: GotoTarget) { if (goToRow(row, g)) onleave(); }
  const baseUnheld = $derived(!('spanAdopted' in row) && row.family === 'wall' ? (row.demand.base?.unheld?.length ?? 0) : 0);
  const toHold = $derived(baseUnheld > 0 ? wallsToHold(walls.some((w) => w.key === row.key) ? walls : [row as SheetRow]) : []);
  const onFoundation = $derived(toHold.some((w) => w.key === row.key));
</script>

<div class="rcz" data-testid="rc-resize">
  {#if none}
    <span class="hint none" data-testid="rc-no-arrangement">{t('rcSheets.alt.none')}</span>
  {/if}
  {#if none && hints !== null}
    {#each alts as a, i (i)}
      <span class="alt" data-testid="rc-alternative" data-kind={a.kind}>
        <span class="hint grow">{a.kind === 'concrete'
          ? tp('rcSheets.alt.concrete', { name: a.name, to: fmt(a.to, 0), from: fmt(a.from, 0) })
          : a.kind === 'footing' ? t(`rcSheets.alt.footing.${a.what}`)
          : tp(`rcSheets.alt.section.${a.what}`, { from: cm(a.from), to: cm(a.to) })}</span>
        {#if canApply(row, a)}<button type="button" class="rcz-btn" title={t('rcSheets.alt.applyTitle')} onclick={() => apply(a)} data-testid="rc-alternative-apply">{t('rcSheets.alt.apply')}</button>{/if}
      </span>
    {/each}
    {#if !alts.length}<span class="hint none" data-testid="rc-alternative-nothing">{tp('rcSheets.alt.nothing', { max: fmt(fcMax, 0) })}</span>{/if}
  {/if}
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
    {#if hints.length || alts.length}<span class="dim">{t('rcSheets.resize.note')}</span>{/if}
  {/if}
  {#if baseUnheld > 0 && onFoundation}
    <span class="hint none" data-testid="rc-wall-base-unheld">{tpn('rcSheets.resize.baseUnheld', baseUnheld)}</span>
    <button type="button" class="rcz-btn" onclick={() => holdWallBasesAndDesign(toHold)} disabled={sheetsSolve.busy} data-testid="rc-wall-hold-base">
      {toHold.length > 1 ? tp('rcSheets.resize.holdBases', { n: toHold.length }) : t('rcSheets.resize.holdBase')}
    </button>
  {:else if baseUnheld > 0}
    <span class="hint none" data-testid="rc-wall-base-unheld">{tpn('rcSheets.resize.baseUnheldAbove', baseUnheld)}</span>
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
  .alt { display: inline-flex; align-items: center; gap: 6px; }
  .sp { flex: 1; }
  .rcz-btn { font-size: 0.72rem; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; white-space: nowrap; }
  .rcz-btn:hover { border-color: var(--st-accent); }
</style>
