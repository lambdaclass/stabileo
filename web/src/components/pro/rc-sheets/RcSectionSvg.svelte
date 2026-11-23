<script lang="ts">
  import { i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { SectionDrawing } from '../../../lib/rc-sheets/drawing';

  let { drawing, title, notes = [], marks }: { drawing: SectionDrawing; title: string; notes?: string[]; marks?: { top: string[]; bottom: string[] } } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const BOX = 130, PAD = 26;
  const k = $derived(BOX / Math.max(drawing.b, drawing.h));
  const w = $derived(drawing.b * k), hh = $derived(drawing.h * k);
  const X = (x: number) => PAD + x * k;
  const Y = (y: number) => PAD + hh - y * k;
  const inset = $derived((drawing.cover + drawing.tieDia / 2000) * k);
  const MARKW = 34;
  /** The y of a face's outer bars on screen: where its marks stand. */
  const P = (pts: ReadonlyArray<[number, number]>) => pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const len = (m: number) => { const c = Math.round(m * 1000) / 10; return fmt(c, Number.isInteger(c) ? 0 : 1); };
  const sw = $derived(Math.max(1, drawing.tieDia / 1000 * k));
  const faceY = (top: boolean) => { const ys = drawing.bars.filter((b) => (top ? b.y > drawing.h / 2 : b.y <= drawing.h / 2)).map((b) => Y(b.y)); return ys.length ? (top ? Math.min(...ys) : Math.max(...ys)) : Y(top ? drawing.h : 0); };
</script>

<figure class="rcs-fig" data-testid="rc-section">
  <figcaption>{title}</figcaption>
  <svg viewBox="0 0 {w + 2 * PAD + (marks ? MARKW : 0)} {hh + 2 * PAD}" width={w + 2 * PAD + (marks ? MARKW : 0)} height={hh + 2 * PAD} role="img" aria-label={title}>
    <rect x={PAD} y={PAD} width={w} height={hh} class="conc" />
    {#if drawing.hoop}
      {@const hp = drawing.hoop}
      <polyline points={P(hp.pts)} class="hoop" style="stroke-width: {sw}px" data-testid="rc-section-hoop" />
      <g class="hdim" data-testid="rc-section-hoop-dims">
        <line x1={X(hp.pts[4]![0])} y1={PAD - 9} x2={X(hp.pts[3]![0])} y2={PAD - 9} class="lead" />
        <text x={PAD + w / 2} y={PAD - 12} class="dim">{len(hp.w)}</text>
        <line x1={PAD + w + 9} y1={Y(hp.pts[3]![1])} x2={PAD + w + 9} y2={Y(hp.pts[2]![1])} class="lead" />
        <text x={PAD + w + 12} y={PAD + hh / 2} class="dim" transform="rotate(90 {PAD + w + 12} {PAD + hh / 2})">{len(hp.h)}</text>
        {#if hp.mark}<text x={PAD - 2} y={PAD - 12} class="mk" text-anchor="end">{hp.mark}</text>{/if}
      </g>
    {:else}
      <rect x={PAD + inset} y={PAD + inset} width={Math.max(0, w - 2 * inset)} height={Math.max(0, hh - 2 * inset)} rx="3" class="hoop" style="stroke-width: {sw}px" />
    {/if}
    {#each drawing.ties as t, i (i)}
      <line x1={X(t.x1)} y1={Y(t.y1)} x2={X(t.x2)} y2={Y(t.y2)} class="tie" style="stroke-width: {sw}px" />
    {/each}
    {#each drawing.crossties ?? [] as c, i (i)}
      <polyline points={P(c.pts)} class="tie" style="stroke-width: {sw}px" data-testid="rc-section-crosstie" data-across={c.across} data-hooks="{c.hooks[0]}-{c.hooks[1]}" />
    {/each}
    {#each drawing.bars as b, i (i)}
      <circle cx={X(b.x)} cy={Y(b.y)} r={Math.max(3, (b.dia / 2000) * k)} class="bar" />
    {/each}
    {#each drawing.crossties ?? [] as c, i (i)}
      {#if c.mark && (i === 0 || drawing.crossties?.[i - 1]?.mark !== c.mark)}
        <text x={c.across === 'h' ? X(c.pts[1]![0]) + 3 : PAD + w / 2} y={c.across === 'h' ? PAD + hh / 2 : Y(c.pts[1]![1]) - 3} class="mk-s">{c.mark}</text>
      {/if}
    {/each}
    {#if marks}
      <g data-testid="rc-section-marks">
        {#each [{ top: true, list: marks.top }, { top: false, list: marks.bottom }] as f (f.top)}
          {#if f.list.length}
            <line x1={PAD + w - inset + 2} y1={faceY(f.top)} x2={PAD + w + 6} y2={faceY(f.top)} class="lead" />
            <text x={PAD + w + 8} y={faceY(f.top) + 3.5} class="mk">{f.list.join(' ')}</text>
          {/if}
        {/each}
      </g>
    {/if}
    <text x={PAD + w / 2} y={PAD + hh + 16} class="dim">{fmt(drawing.b * 100, 0)}</text>
    <text x={PAD - 8} y={PAD + hh / 2} class="dim" transform="rotate(-90 {PAD - 8} {PAD + hh / 2})">{fmt(drawing.h * 100, 0)}</text>
  </svg>
  {#each notes as n, i (i)}<div class="note">{n}</div>{/each}
</figure>

<style>
  .rcs-fig { margin: 0; display: inline-flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .hoop, .tie { fill: none; stroke: var(--st-text-2); }
  .bar { fill: var(--st-text); }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .note { font-size: 0.68rem; font-family: var(--st-mono); color: var(--st-text-2); max-width: 15rem; text-align: center; }
  .mk { font-size: 10px; font-weight: 700; fill: var(--st-text); font-family: var(--st-mono); }
  .lead { stroke: var(--st-text-3); stroke-width: 0.8; }
  .hoop { stroke-linejoin: round; stroke-linecap: round; }
  .tie { stroke-linecap: round; }
  .mk-s { font-size: 9px; font-weight: 700; fill: var(--st-accent, var(--st-text)); font-family: var(--st-mono); paint-order: stroke; stroke: var(--st-surface-2); stroke-width: 2px; }
</style>
