<script lang="ts">
  /** A column's storey in elevation: its bars, the lap of the bars from below, every tie where its code puts it, and the zones dimensioned (`rc-sheets/column-ties.ts`). */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { columnTieLayout, tieSegments, tiesIn } from '../../../lib/rc-sheets/column-ties';
  import type { ColumnRow } from '../../../lib/rc-sheets/column-row';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { row, code, endZones = false }: { row: ColumnRow; code: SheetCode; endZones?: boolean } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const layout = $derived(columnTieLayout(row, code, { endZones }));
  const segs = $derived(tieSegments(layout));

  const H = 380, PADT = 18, PADB = 30, LEFT = 46, STUB = 34, COLW = 64;
  const jb = $derived(Math.max(layout.jointBottom, 0.04)), jt = $derived(Math.max(layout.jointTop, 0.04));
  const total = $derived(layout.jointBottom + layout.clear + layout.jointTop);
  const k = $derived((H - PADT - PADB) / Math.max(jb + layout.clear + jt, 0.1));
  // Elevation height to scale; the width drawn at least COLW, so ties stay apart from the bars.
  const kx = $derived(Math.max(k, COLW / row.b));
  const w = $derived(row.b * kx);
  const x0 = LEFT + STUB, x1 = $derived(LEFT + STUB + w);
  const Y = (y: number) => PADT + (jt + layout.clear - y) * k;
  const inset = $derived((row.cover + layout.dia / 1000 + row.adopted.corner / 2000) * kx);
  const lapIn = 3;
  const faceBars = $derived(Array.from({ length: row.adopted.nx }, (_, i) => x0 + inset + ((i + 1) * (w - 2 * inset)) / (row.adopted.nx + 1)));
  const width = $derived(x1 + STUB + 150);
  const kindKey = (kind: string) => `rcSheets.elev.${kind}`;
  const cm = (m: number) => fmt(m * 100, 0);
  const sp = (m: number) => { const c = Math.round(m * 1000) / 10; return fmt(c, Number.isInteger(c) ? 0 : 1); };
  const notScale = $derived(kx > k * 1.05);
</script>

<figure class="rce-fig" data-testid="rc-column-elevation">
  <figcaption>{tp('rcSheets.elev.title', { name: row.name })}</figcaption>
  <svg viewBox="0 0 {width} {H}" width={width} height={H} role="img" aria-label={tp('rcSheets.elev.title', { name: row.name })}>
    <rect x={LEFT} y={Y(layout.clear + jt)} width={w + 2 * STUB} height={jt * k} class="beam" />
    <rect x={LEFT} y={Y(0)} width={w + 2 * STUB} height={jb * k} class="beam" />
    <rect x={x0} y={Y(layout.clear)} width={w} height={layout.clear * k} class="conc" />

    {#if layout.lap}
      {@const lf = layout.lap.from}
      {@const lt = layout.lap.to}
      {#each [x0 + inset, x1 - inset] as bx, i (i)}
        <line x1={bx} y1={Y(-jb)} x2={bx} y2={Y(lt)} class="bar below" data-testid="rc-elev-lap-bar" />
        <line x1={bx + (i ? -lapIn : lapIn)} y1={Y(lf)} x2={bx + (i ? -lapIn : lapIn)} y2={Y(layout.clear + jt)} class="bar" />
      {/each}
      <line x1={x0 - 6} y1={Y(lf)} x2={x0 - 6} y2={Y(lt)} class="dimline" />
      <text x={x0 - 10} y={(Y(lf) + Y(lt)) / 2} class="dim lapdim" transform="rotate(-90 {x0 - 10} {(Y(lf) + Y(lt)) / 2})">{tp('rcSheets.elev.lapLength', { l: cm(lt - lf) })}</text>
    {:else}
      {#each [x0 + inset, x1 - inset] as bx, i (i)}<line x1={bx} y1={Y(-jb)} x2={bx} y2={Y(layout.clear + jt)} class="bar" />{/each}
    {/if}
    {#each faceBars as bx, i (i)}<line x1={bx} y1={Y(-jb)} x2={bx} y2={Y(layout.clear + jt)} class="bar face" />{/each}

    {#each layout.ties as y, i (i)}
      <line x1={x0 + inset - 4} y1={Y(y)} x2={x1 - inset + 4} y2={Y(y)} class="tie" data-testid="rc-elev-tie" />
    {/each}

    <line x1={LEFT - 14} y1={Y(0)} x2={LEFT - 14} y2={Y(layout.clear)} class="dimline" />
    <text x={LEFT - 18} y={(Y(0) + Y(layout.clear)) / 2} class="dim" transform="rotate(-90 {LEFT - 18} {(Y(0) + Y(layout.clear)) / 2})">lu = {cm(layout.clear)}</text>

    {#each segs as z, i (i)}
      {@const ya = Y(z.from)}
      {@const yb = Y(z.to)}
      <g class="seg seg-{z.kind}" data-testid="rc-elev-zone" data-kind={z.kind} data-spacing={z.spacing}>
        <line x1={x1 + STUB + 6} y1={ya} x2={x1 + STUB + 6} y2={yb} class="zone" />
        <line x1={x1 + STUB + 2} y1={ya} x2={x1 + STUB + 10} y2={ya} class="zone" />
        <line x1={x1 + STUB + 2} y1={yb} x2={x1 + STUB + 10} y2={yb} class="zone" />
        {#if ya - yb > 20}
          <text x={x1 + STUB + 14} y={(ya + yb) / 2 - 2} class="lbl">{t(kindKey(z.kind))} · {cm(z.to - z.from)}</text>
          <text x={x1 + STUB + 14} y={(ya + yb) / 2 + 10} class="lbl strong">Ø{layout.dia} c/{sp(z.spacing)} ({tiesIn(layout, z)})</text>
        {:else}
          <text x={x1 + STUB + 14} y={(ya + yb) / 2 + 3} class="lbl strong">Ø{layout.dia} c/{sp(z.spacing)}</text>
        {/if}
      </g>
    {/each}

    <text x={x0 + w / 2} y={H - 10} class="dim">{cm(row.b)}{notScale ? ` · ${t('rcSheets.elev.widthNotToScale')}` : ''}</text>
  </svg>
  <ul class="rce-notes">
    {#each segs as z, i (i)}<li>{t(kindKey(z.kind))}: Ø{layout.dia} c/{sp(z.spacing)} — {z.clause}</li>{/each}
    <li class="dimnote">{tp('rcSheets.elev.totals', { n: layout.ties.length, h: cm(total) })}</li>
    {#each layout.notes as n, i (i)}<li class="why" data-testid="rc-elev-note">{t(n)}</li>{/each}
  </ul>
</figure>

<style>
  .rce-fig { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .beam { fill: rgba(128, 128, 128, 0.2); stroke: var(--st-text-3); stroke-width: 1; stroke-dasharray: 3 2; }
  .bar { stroke: var(--st-text); stroke-width: 2.2; }
  .bar.face { stroke-width: 1.4; stroke-dasharray: 5 3; opacity: 0.7; }
  .bar.below { stroke: var(--st-text-2); }
  .tie { stroke: var(--st-accent, #4ecdc4); stroke-width: 1.3; }
  .zone { stroke: var(--st-text-3); stroke-width: 1; }
  .seg-end .zone, .seg-lap .zone, .seg-joint .zone { stroke: var(--st-accent, #4ecdc4); }
  .dimline { stroke: var(--st-text-3); stroke-width: 1; }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .lbl { font-size: 10px; fill: var(--st-text-2); font-family: var(--st-mono); }
  .lbl.strong { fill: var(--st-text); font-weight: 600; }
  .rce-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); font-family: var(--st-mono); max-width: 46ch; }
  .dimnote { color: var(--st-text-3); }
  .why { color: var(--st-text-2); font-family: var(--st-font, inherit); list-style: none; margin-left: -14px; margin-top: 2px; }
</style>
