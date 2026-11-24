<script lang="ts">
  /**
   * A punching joint in plan: the column, the slab around it with its free edges, the code's
   * control perimeter (straight at d/2, or rounded at 2d in EN 1992-1-1) cut at the free edges,
   * and the lines of stirrups when the concrete alone does not carry the shear.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { PunchingFigure } from '../../../lib/rc-sheets/punching-row';

  let { fig, name }: { fig: PunchingFigure; name: string } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));

  type Side = 'px' | 'py' | 'nx' | 'ny';
  const DIRS: Array<[Side, number]> = [['px', 0], ['py', 90], ['nx', 180], ['ny', 270]];
  const gap = (a: number, b: number) => { const d = Math.abs((((a - b) % 360) + 360) % 360); return Math.min(d, 360 - d); };
  /** The sides the slab stops at the column face: the one the free edge faces, or the two of a corner. */
  const free = $derived.by((): Set<Side> => {
    if (fig.position === 'interior' || fig.openBearingDeg === null) return new Set();
    const by = [...DIRS].sort((p, q) => gap(p[1], fig.openBearingDeg!) - gap(q[1], fig.openBearingDeg!));
    return new Set(by.slice(0, fig.position === 'corner' ? 2 : 1).map((x) => x[0]));
  });

  const SIZE = 250, PAD = 34;
  const bx = $derived(fig.b / 2), by = $derived(fig.h / 2);
  const reach = $derived(fig.offset + (fig.reinforcement ? Math.max(0, fig.reinforcement.extent - fig.offset) : 0));
  const margin = $derived(Math.max(0.25, 0.6 * reach));
  // The slab drawn: out to the perimeter and a margin, stopped at the column face on a free side.
  const box = $derived({
    x0: free.has('nx') ? -bx : -(bx + reach + margin), x1: free.has('px') ? bx : bx + reach + margin,
    y0: free.has('ny') ? -by : -(by + reach + margin), y1: free.has('py') ? by : by + reach + margin,
  });
  const k = $derived((SIZE - 2 * PAD) / Math.max(box.x1 - box.x0, box.y1 - box.y0));
  const X = (x: number) => PAD + (x - box.x0) * k;
  const Y = (y: number) => PAD + (box.y1 - y) * k;
  const W = $derived(2 * PAD + (box.x1 - box.x0) * k), H = $derived(2 * PAD + (box.y1 - box.y0) * k);

  /** A ring at `off` from the faces, cut where the slab stops, as an SVG path; rounded corners when asked. */
  function ring(off: number, rounded: boolean): string {
    const ex = bx + off, ey = by + off;
    const xa = free.has('nx') ? -bx : -ex, xb = free.has('px') ? bx : ex;
    const ya = free.has('ny') ? -by : -ey, yb = free.has('py') ? by : ey;
    const parts: string[] = [];
    const seg = (x1: number, y1: number, x2: number, y2: number) => parts.push(`M ${X(x1)} ${Y(y1)} L ${X(x2)} ${Y(y2)}`);
    const arc = (cx: number, cy: number, a0: number, a1: number) => {
      const p0 = [cx + off * Math.cos(a0), cy + off * Math.sin(a0)], p1 = [cx + off * Math.cos(a1), cy + off * Math.sin(a1)];
      parts.push(`M ${X(p0[0]!)} ${Y(p0[1]!)} A ${off * k} ${off * k} 0 0 1 ${X(p1[0]!)} ${Y(p1[1]!)}`);
    };
    const r = rounded;
    if (!free.has('ny')) seg(r && !free.has('nx') ? -bx : xa, -ey, r && !free.has('px') ? bx : xb, -ey);
    if (!free.has('px')) seg(ex, r && !free.has('ny') ? -by : ya, ex, r && !free.has('py') ? by : yb);
    if (!free.has('py')) seg(r && !free.has('px') ? bx : xb, ey, r && !free.has('nx') ? -bx : xa, ey);
    if (!free.has('nx')) seg(-ex, r && !free.has('py') ? by : yb, -ex, r && !free.has('ny') ? -by : ya);
    if (r) {
      if (!free.has('ny') && !free.has('px')) arc(bx, -by, -Math.PI / 2, 0);
      if (!free.has('px') && !free.has('py')) arc(bx, by, 0, Math.PI / 2);
      if (!free.has('py') && !free.has('nx')) arc(-bx, by, Math.PI / 2, Math.PI);
      if (!free.has('nx') && !free.has('ny')) arc(-bx, -by, Math.PI, (3 * Math.PI) / 2);
    }
    return parts.join(' ');
  }
  const lines = $derived(fig.reinforcement ? Array.from({ length: fig.reinforcement.lines }, (_, i) => fig.reinforcement!.spacing / 2 + i * fig.reinforcement!.spacing) : []);
  const cm = (m: number) => fmt(m * 100, 0);
  const offLabel = $derived(fig.rounded ? `2d = ${cm(fig.offset)} cm` : `d/2 = ${cm(fig.offset)} cm`);
  const edges = $derived([...free].map((s) => s === 'px' ? { x1: X(bx), y1: Y(box.y0), x2: X(bx), y2: Y(box.y1) } : s === 'nx' ? { x1: X(-bx), y1: Y(box.y0), x2: X(-bx), y2: Y(box.y1) } : s === 'py' ? { x1: X(box.x0), y1: Y(by), x2: X(box.x1), y2: Y(by) } : { x1: X(box.x0), y1: Y(-by), x2: X(box.x1), y2: Y(-by) }));
</script>

<figure class="rpu-fig" data-testid="rc-punching-figure" data-position={fig.position}>
  <figcaption>{tp('rcSheets.punchFig.title', { name })}</figcaption>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={tp('rcSheets.punchFig.title', { name })}>
    <rect x={X(box.x0)} y={Y(box.y1)} width={(box.x1 - box.x0) * k} height={(box.y1 - box.y0) * k} class="slab" />
    {#each edges as e, i (i)}<line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} class="edge" data-testid="rc-punching-edge" />{/each}
    {#each lines as off, i (i)}<path d={ring(off, false)} class="studs" data-testid="rc-punching-line" />{/each}
    <path d={ring(fig.offset, fig.rounded)} class="perim" data-testid="rc-punching-perimeter" />
    <rect x={X(-bx)} y={Y(by)} width={fig.b * k} height={fig.h * k} class="col" />
    <text x={X(0)} y={Y(0) + 3} class="lbl">{cm(fig.b)}×{cm(fig.h)}</text>
    {#if !free.has('px')}
      <line x1={X(bx)} y1={Y(0)} x2={X(bx + fig.offset)} y2={Y(0)} class="dim" />
      <text x={X(bx + fig.offset / 2)} y={Y(0) - 4} class="lbl small">{offLabel}</text>
    {/if}
  </svg>
  <ul class="rpu-notes">
    <li>{tp('rcSheets.punchFig.perimeter', { bo: fmt(fig.bo), d: cm(fig.d) })} — {fig.clause}</li>
    <li>{t(`rcSheets.punchFig.pos.${fig.position}`)}</li>
    {#if fig.reinforcement}
      <li class="warn">{tp('rcSheets.punchFig.stirrups', { n: fig.reinforcement.lines, dia: fig.reinforcement.legDiameter, s: cm(fig.reinforcement.spacing), legs: fig.reinforcement.legs, ext: cm(fig.reinforcement.extent) })} — §22.6.7</li>
      {#if fig.reinforcement.overCeiling}<li class="bad">{t('rcSheets.punchFig.overCeiling')}</li>{/if}
    {/if}
  </ul>
</figure>

<style>
  .rpu-fig { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .slab { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: none; }
  .edge { stroke: var(--st-text-2); stroke-width: 2; }
  .col { fill: rgba(128, 128, 128, 0.45); stroke: var(--st-text-2); stroke-width: 1; }
  .perim { fill: none; stroke: var(--st-accent, #4ecdc4); stroke-width: 1.8; stroke-dasharray: 6 3; }
  .studs { fill: none; stroke: #e0a03c; stroke-width: 1.2; }
  .dim { stroke: var(--st-text-3); stroke-width: 1; }
  .lbl { font-size: 10px; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .lbl.small { font-size: 9px; fill: var(--st-text-2); }
  .rpu-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); max-width: 42ch; }
  .warn { color: var(--st-warn); }
  .bad { color: var(--st-danger); }
</style>
