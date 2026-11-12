<script lang="ts">
  /** A wall's bars in elevation and in a horizontal cut, as `rc-sheets/wall-detail.ts` lays them out, each kind switched on and off on its own. */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { wallDetail } from '../../../lib/rc-sheets/wall-detail';
  import type { WallRow } from '../../../lib/rc-sheets/wall-row';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { row, code }: { row: WallRow; code: SheetCode } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const d = $derived(wallDetail(row, code));
  let on = $state({ vertical: true, horizontal: true, ends: true, ties: true });

  const EW = 380, EH = 230, PAD = 26, MAXLINES = 70;
  const ke = $derived(Math.min((EW - 2 * PAD) / Math.max(d.length, 0.1), (EH - 2 * PAD) / Math.max(row.height, 0.1)));
  const ew = $derived(d.length * ke), eh = $derived(row.height * ke);
  const EX = (x: number) => PAD + x * ke, EY = (y: number) => PAD + eh - y * ke;
  const face = $derived(d.verticals.filter((v) => Math.abs(v.y - Math.min(...d.verticals.map((q) => q.y))) < 1e-6));
  const levels = (span: number, s: number) => { const n = Math.max(1, Math.floor((span - s / 2) / s) + 1); const every = Math.ceil(n / MAXLINES); return Array.from({ length: Math.ceil(n / every) }, (_, i) => s / 2 + i * every * s); };
  const hLevels = $derived(levels(row.height, d.horizontals.spacing));
  const tieLevels = $derived(d.boundary?.ties ? levels(row.height, d.boundary.ties.spacing) : []);
  const crossGrid = $derived(d.crossTies ? { xs: levels(d.length, d.crossTies.along), ys: levels(row.height, d.crossTies.up) } : null);

  const PW = 380, PAD2 = 18;
  const kx = $derived((PW - 2 * PAD2) / Math.max(d.length, 0.1));
  // The thickness drawn at least 60 px, so both curtains and the U-bars stay apart.
  const ky = $derived(Math.max(kx, 60 / Math.max(d.thickness, 0.05)));
  const PH = $derived(d.thickness * ky + 2 * PAD2 + 12);
  const PX = (x: number) => PAD2 + x * kx, PY = (y: number) => PAD2 + y * ky;
  const uLeg = $derived(Math.min(d.ends.lap, d.length / 2));
  const ubar = (end: 0 | 1) => {
    if (d.horizontals.y.length < 2) return '';
    const [ya, yb] = [PY(d.horizontals.y[0]!) + 2, PY(d.horizontals.y[1]!) - 2];
    const xe = end === 0 ? PX(d.cover + d.horizontals.dia / 2000) + 2 : PX(d.length - d.cover - d.horizontals.dia / 2000) - 2;
    const xl = end === 0 ? PX(uLeg) : PX(d.length - uLeg);
    const r = Math.min(6, (yb - ya) / 2);
    const dir = end === 0 ? 1 : -1;
    return `M ${xl} ${ya} L ${xe + dir * r} ${ya} Q ${xe} ${ya} ${xe} ${ya + r} L ${xe} ${yb - r} Q ${xe} ${yb} ${xe + dir * r} ${yb} L ${xl} ${yb}`;
  };
  const cm = (m: number) => fmt(m * 100, 0);
  const sp = (m: number) => { const c = Math.round(m * 1000) / 10; return fmt(c, Number.isInteger(c) ? 0 : 1); };
  /** A note's numbers in the reader's decimals. */
  const local = (p: Record<string, string | number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? fmt(v, 1) : typeof v === 'string' && /^\d+\.\d+$/.test(v) ? fmt(Number(v), v.split('.')[1]!.length) : v]));
</script>

<figure class="rwd-fig" data-testid="rc-wall-detail">
  <figcaption>{tp('rcSheets.wallFig.title', { name: row.name })}</figcaption>
  <div class="rwd-toggles" role="group" aria-label={t('rcSheets.wallFig.layers')}>
    <label class="tg tg-v"><input type="checkbox" bind:checked={on.vertical} data-testid="rc-wall-layer-vertical" /><span class="sw"></span>{t('rcSheets.wallFig.vertical')}</label>
    <label class="tg tg-h"><input type="checkbox" bind:checked={on.horizontal} data-testid="rc-wall-layer-horizontal" /><span class="sw"></span>{t('rcSheets.wallFig.horizontal')}</label>
    <label class="tg tg-u"><input type="checkbox" bind:checked={on.ends} data-testid="rc-wall-layer-ends" /><span class="sw"></span>{t(d.ends.kind === 'ubar' ? 'rcSheets.wallFig.ubars' : 'rcSheets.wallFig.hooks')}</label>
    <label class="tg tg-t" class:off={!d.boundary?.ties && !d.crossTies}><input type="checkbox" bind:checked={on.ties} disabled={!d.boundary?.ties && !d.crossTies} data-testid="rc-wall-layer-ties" /><span class="sw"></span>{t('rcSheets.wallFig.ties')}</label>
  </div>

  <svg viewBox="0 0 {EW} {EH}" width={EW} height={EH} role="img" aria-label={t('rcSheets.wallFig.elevation')} data-testid="rc-wall-elevation">
    <rect x={PAD} y={PAD} width={ew} height={eh} class="conc" />
    {#if d.boundary}
      <rect x={EX(0)} y={PAD} width={d.boundary.length * ke} height={eh} class="zone" />
      <rect x={EX(d.length - d.boundary.length)} y={PAD} width={d.boundary.length * ke} height={eh} class="zone" />
    {/if}
    {#if on.vertical}
      <g class="v" data-testid="rc-wall-elev-vertical">
        {#each face as v, i (i)}<line x1={EX(v.x)} y1={EY(0)} x2={EX(v.x)} y2={EY(row.height)} class:bnd={v.boundary} />{/each}
      </g>
    {/if}
    {#if on.horizontal}
      <g class="h" data-testid="rc-wall-elev-horizontal">
        {#each hLevels as y, i (i)}<line x1={EX(d.cover)} y1={EY(y)} x2={EX(d.length - d.cover)} y2={EY(y)} />{/each}
      </g>
    {/if}
    {#if on.ends && d.ends.kind === 'ubar'}
      <g class="u" data-testid="rc-wall-elev-ends">
        {#each hLevels as y, i (i)}
          <line x1={EX(d.cover)} y1={EY(y) - 2} x2={EX(d.cover + uLeg)} y2={EY(y) - 2} />
          <line x1={EX(d.length - d.cover)} y1={EY(y) - 2} x2={EX(d.length - d.cover - uLeg)} y2={EY(y) - 2} />
        {/each}
      </g>
    {/if}
    {#if on.ties && d.boundary?.ties}
      <g class="t" data-testid="rc-wall-elev-boundary-ties">
        {#each tieLevels as y, i (i)}
          <line x1={EX(d.cover)} y1={EY(y)} x2={EX(d.boundary.length)} y2={EY(y)} />
          <line x1={EX(d.length - d.boundary.length)} y1={EY(y)} x2={EX(d.length - d.cover)} y2={EY(y)} />
        {/each}
      </g>
    {/if}
    {#if on.ties && crossGrid}
      <g class="x" data-testid="rc-wall-elev-crossties">
        {#each crossGrid.ys as y, i (i)}{#each crossGrid.xs as x, j (j)}<circle cx={EX(x)} cy={EY(y)} r="2.4" />{/each}{/each}
      </g>
    {/if}
    <text x={PAD + ew / 2} y={PAD + eh + 15} class="dim">lw = {fmt(d.length, 2)} m</text>
    <text x={PAD - 9} y={PAD + eh / 2} class="dim" transform="rotate(-90 {PAD - 9} {PAD + eh / 2})">hw = {fmt(row.height, 2)} m</text>
  </svg>

  <svg viewBox="0 0 {PW} {PH}" width={PW} height={PH} role="img" aria-label={t('rcSheets.wallFig.plan')} data-testid="rc-wall-plan">
    <rect x={PX(0)} y={PY(0)} width={d.length * kx} height={d.thickness * ky} class="conc" />
    {#if d.boundary}
      <rect x={PX(0)} y={PY(0)} width={d.boundary.length * kx} height={d.thickness * ky} class="zone" />
      <rect x={PX(d.length - d.boundary.length)} y={PY(0)} width={d.boundary.length * kx} height={d.thickness * ky} class="zone" />
    {/if}
    {#if on.horizontal}
      <g class="h">{#each d.horizontals.y as y, i (i)}<line x1={PX(d.cover)} y1={PY(y)} x2={PX(d.length - d.cover)} y2={PY(y)} />{/each}</g>
    {/if}
    {#if on.ends}
      <g class="u" data-testid="rc-wall-plan-ends">
        {#if d.ends.kind === 'ubar'}
          <path d={ubar(0)} /><path d={ubar(1)} />
        {:else}
          {@const y = PY(d.horizontals.y[0]!)}
          <path d="M {PX(0.15)} {y} L {PX(d.cover)} {y} L {PX(d.cover)} {y - 8}" />
          <path d="M {PX(d.length - 0.15)} {y} L {PX(d.length - d.cover)} {y} L {PX(d.length - d.cover)} {y - 8}" />
        {/if}
      </g>
    {/if}
    {#if on.ties && d.boundary?.ties}
      {@const i0 = PY(d.cover)}
      {@const i1 = PY(d.thickness - d.cover)}
      {@const legs = d.boundary.ties.legs ?? 2}
      <g class="t" data-testid="rc-wall-plan-boundary-ties">
        <rect x={PX(d.cover)} y={i0} width={(d.boundary.length - d.cover) * kx} height={i1 - i0} />
        <rect x={PX(d.length - d.boundary.length)} y={i0} width={(d.boundary.length - d.cover) * kx} height={i1 - i0} />
        {#each Array.from({ length: Math.max(0, legs - 2) }, (_, k) => d.cover + ((k + 1) * (d.boundary.length - 2 * d.cover)) / (legs - 1)) as x, k (k)}
          <line x1={PX(x)} y1={i0} x2={PX(x)} y2={i1} />
          <line x1={PX(d.length - x)} y1={i0} x2={PX(d.length - x)} y2={i1} />
        {/each}
      </g>
    {/if}
    {#if on.ties && crossGrid && d.horizontals.y.length === 2}
      <g class="x">{#each crossGrid.xs as x, j (j)}<line x1={PX(x)} y1={PY(d.horizontals.y[0]!)} x2={PX(x)} y2={PY(d.horizontals.y[1]!)} />{/each}</g>
    {/if}
    {#if on.vertical}
      <g class="v" data-testid="rc-wall-plan-vertical">{#each d.verticals as v, i (i)}<circle cx={PX(v.x)} cy={PY(v.y)} r={Math.max(1.8, (v.dia / 2000) * ky)} class:bnd={v.boundary} />{/each}</g>
    {/if}
    <text x={PX(d.length) + 2} y={PY(d.thickness) + 12} class="dim end">t = {cm(d.thickness)}</text>
  </svg>

  <ul class="rwd-notes">
    <li>{t('rcSheets.wallFig.vertical')}: {row.adopted.curtains} × Ø{row.adopted.vertical.diameter} c/{sp(row.adopted.vertical.spacing)} · {t('rcSheets.wallFig.horizontal')}: Ø{d.horizontals.dia} c/{sp(d.horizontals.spacing)}</li>
    {#each d.notes as n, i (i)}<li data-testid="rc-wall-note">{n.params ? tp(n.key, local(n.params)) : t(n.key)}{n.clause ? ` — ${n.clause}` : ''}</li>{/each}
  </ul>
</figure>

<style>
  .rwd-fig { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); max-width: 100%; }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .rwd-toggles { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.68rem; color: var(--st-text-2); }
  .tg { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .tg.off { opacity: 0.5; cursor: default; }
  .sw { width: 14px; height: 0; border-top: 2px solid var(--c); display: inline-block; }
  .tg-v, .v { --c: #4ecdc4; }
  .tg-h, .h { --c: #5b8def; }
  .tg-u, .u { --c: #e0a03c; }
  .tg-t, .t, .x { --c: #d9607a; }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .zone { fill: rgba(217, 96, 122, 0.08); stroke: none; }
  .v line { stroke: var(--c); stroke-width: 1; opacity: 0.8; }
  .v line.bnd { stroke-width: 2.2; opacity: 1; }
  .v circle { fill: var(--c); }
  .v circle.bnd { fill: var(--st-text); }
  .h line { stroke: var(--c); stroke-width: 1; }
  .u line, .u path { stroke: var(--c); stroke-width: 1.6; fill: none; }
  .t line, .t rect, .x line { stroke: var(--c); stroke-width: 1.2; fill: none; }
  .x circle { fill: var(--c); }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .dim.end { text-anchor: end; }
  .rwd-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); max-width: 64ch; }
</style>
