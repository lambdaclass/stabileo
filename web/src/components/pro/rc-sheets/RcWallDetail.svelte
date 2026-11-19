<script lang="ts">
  /** A wall's bars in elevation and in a horizontal cut, as `rc-sheets/wall-detail.ts` lays them out, each kind switched on and off on its own. */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { columnTag, firstLevel, wallDetail, wallLevels } from '../../../lib/rc-sheets/wall-detail';
  import type { WallRow } from '../../../lib/rc-sheets/wall-row';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { row, code }: { row: WallRow; code: SheetCode } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const d = $derived(wallDetail(row, code));
  let on = $state({ vertical: true, horizontal: true, ends: true, ties: true });
  const uid = $props.id();

  const EW = 380, EH = 230, PAD = 26, MAXLINES = 70;
  const ke = $derived(Math.min((EW - 2 * PAD) / Math.max(d.length, 0.1), (EH - 2 * PAD) / Math.max(row.height, 0.1)));
  const ew = $derived(d.length * ke), eh = $derived(row.height * ke);
  const EX = (x: number) => PAD + x * ke, EY = (y: number) => PAD + eh - y * ke;
  const face = $derived(d.verticals.filter((v) => Math.abs(v.y - Math.min(...d.verticals.map((q) => q.y))) < 1e-6));
  const levels = (span: number, s: number, up = false) => wallLevels(span, s, MAXLINES, up ? firstLevel(row, s) : s / 2);
  const hLevels = $derived(levels(row.height, d.horizontals.spacing, true));
  const tieLevels = $derived(d.boundary?.ties ? levels(row.height, d.boundary.ties.spacing, true) : []);
  const crossGrid = $derived(d.crossTies ? { xs: levels(d.length, d.crossTies.along), ys: levels(row.height, d.crossTies.up, true) } : null);
  const dowelLap = (dia: number) => row.vLaps?.find((x) => x.dia === dia)?.lap ?? 0;

  const PW = 380, PAD2 = 18, TOP = 14, MIN_T_PX = 36, DETAIL_H = 150;
  type View = { id: string; k: number; wx0: number; wx1: number; clip: boolean };
  const ext = $derived(d.columns.flatMap((c) => c.outline));
  const x0 = $derived(Math.min(0, ...ext.map((p) => p.x))), x1 = $derived(Math.max(d.length, ...ext.map((p) => p.x)));
  const y0 = $derived(Math.min(0, ...ext.map((p) => p.y))), y1 = $derived(Math.max(d.thickness, ...ext.map((p) => p.y)));
  const overview = $derived<View>({ id: 'all', k: (PW - 2 * PAD2) / Math.max(x1 - x0, 0.1), wx0: x0, wx1: x1, clip: false });
  const uLeg = $derived(Math.min(d.ends.lap, d.length / 2));
  const details = $derived.by<View[]>(() => {
    if (d.thickness * overview.k >= MIN_T_PX) return [];
    const spans = d.columns.length
      ? d.columns.map((c) => [Math.min(...c.outline.map((p) => p.x)), Math.max(...c.outline.map((p) => p.x))] as const)
      : [[0, Math.max(d.boundary?.length ?? 0, uLeg, d.cover)] as const];
    return spans.map(([a, b], i) => {
      const wx0 = Math.max(x0, a - 0.3), wx1 = Math.min(x1, b + 0.3);
      return { id: `d${i}`, k: Math.min((PW - 2 * PAD2) / Math.max(wx1 - wx0, 0.1), DETAIL_H / Math.max(y1 - y0, 0.05)), wx0, wx1, clip: true };
    }).filter((v) => v.k > overview.k * 1.3);
  });
  const zoneX = (c: (typeof d.columns)[number]) => { const xs = c.outline.map((p) => Math.min(d.length, Math.max(0, p.x))); return [Math.min(...xs), Math.max(...xs)] as const; };
  const W = (v: View) => (v.wx1 - v.wx0) * v.k + 2 * PAD2;
  const H = (v: View) => (y1 - y0) * v.k + 2 * PAD2 + TOP;
  const X = (v: View, x: number) => PAD2 + (x - v.wx0) * v.k, Y = (v: View, y: number) => PAD2 + TOP + (y - y0) * v.k;
  const R = (v: View, dia: number) => Math.max(1.5, (dia / 2000) * v.k);
  const pts = (v: View, ps: ReadonlyArray<{ x: number; y: number }>) => ps.map((p) => `${X(v, p.x)},${Y(v, p.y)}`).join(' ');
  const ubar = (v: View, end: 0 | 1) => {
    if (d.horizontals.y.length < 2) return '';
    const [ya, yb] = [Y(v, d.horizontals.y[0]!), Y(v, d.horizontals.y[1]!)];
    const xe = end === 0 ? X(v, d.cover + d.horizontals.dia / 2000) : X(v, d.length - d.cover - d.horizontals.dia / 2000);
    const xl = end === 0 ? X(v, uLeg) : X(v, d.length - uLeg);
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
    {#each d.columns as c (c.key)}
      {@const [a, b] = zoneX(c)}
      <rect x={EX(a)} y={PAD} width={(b - a) * ke} height={eh} class="col" data-testid="rc-wall-elev-column" />
    {/each}
    {#if on.vertical}
      <g class="v" data-testid="rc-wall-elev-vertical">
        {#each face as v, i (i)}<line x1={EX(v.x)} y1={EY(0)} x2={EX(v.x)} y2={EY(row.height)} class:bnd={v.boundary} />{/each}
      </g>
      {#if row.onFooting}
        <g class="dw" data-testid="rc-wall-elev-dowels">
          {#each face as v, i (i)}<line x1={EX(v.x) + 2} y1={EY(0) + 8} x2={EX(v.x) + 2} y2={EY(Math.min(row.height, dowelLap(v.dia)))} />{/each}
        </g>
      {/if}
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

  {#snippet plan(v: View)}
    <svg viewBox="0 0 {W(v)} {H(v)}" width={W(v)} height={H(v)} role="img" aria-label={v.clip ? t('rcSheets.wallFig.planDetail') : t('rcSheets.wallFig.plan')} data-testid={v.clip ? 'rc-wall-plan-detail' : 'rc-wall-plan'} data-scale={v.k}>
      {#if v.clip}<defs><clipPath id="rwd-{uid}-{v.id}"><rect x={PAD2} y={0} width={W(v) - 2 * PAD2} height={H(v)} /></clipPath></defs>{/if}
      <g clip-path={v.clip ? `url(#rwd-${uid}-${v.id})` : undefined}>
        <rect x={X(v, 0)} y={Y(v, 0)} width={d.length * v.k} height={d.thickness * v.k} class="conc" />
        {#if d.boundary}
          <rect x={X(v, 0)} y={Y(v, 0)} width={d.boundary.length * v.k} height={d.thickness * v.k} class="zone" />
          <rect x={X(v, d.length - d.boundary.length)} y={Y(v, 0)} width={d.boundary.length * v.k} height={d.thickness * v.k} class="zone" />
        {/if}
        {#if on.horizontal}
          <g class="h">{#each d.horizontals.y as y, i (i)}<line x1={X(v, d.cover)} y1={Y(v, y)} x2={X(v, d.length - d.cover)} y2={Y(v, y)} />{/each}</g>
        {/if}
        {#if on.ends}
          <g class="u" data-testid="rc-wall-plan-ends">
            {#if d.ends.kind === 'ubar'}
              <path d={ubar(v, 0)} /><path d={ubar(v, 1)} />
            {:else}
              {@const y = Y(v, d.horizontals.y[0]!)}
              <path d="M {X(v, 0.15)} {y} L {X(v, d.cover)} {y} L {X(v, d.cover)} {y - 8}" />
              <path d="M {X(v, d.length - 0.15)} {y} L {X(v, d.length - d.cover)} {y} L {X(v, d.length - d.cover)} {y - 8}" />
            {/if}
          </g>
        {/if}
        {#if on.ties && d.boundary?.ties}
          {@const i0 = Y(v, d.cover)}
          {@const i1 = Y(v, d.thickness - d.cover)}
          {@const legs = d.boundary.ties.legs ?? 2}
          {@const bl = d.boundary.length}
          <g class="t" data-testid="rc-wall-plan-boundary-ties">
            <rect x={X(v, d.cover)} y={i0} width={(d.boundary.length - d.cover) * v.k} height={i1 - i0} />
            <rect x={X(v, d.length - d.boundary.length)} y={i0} width={(d.boundary.length - d.cover) * v.k} height={i1 - i0} />
            {#each Array.from({ length: Math.max(0, legs - 2) }, (_, k) => d.cover + ((k + 1) * (bl - 2 * d.cover)) / (legs - 1)) as x, k (k)}
              <line x1={X(v, x)} y1={i0} x2={X(v, x)} y2={i1} />
              <line x1={X(v, d.length - x)} y1={i0} x2={X(v, d.length - x)} y2={i1} />
            {/each}
          </g>
        {/if}
        {#if on.ties && crossGrid && d.horizontals.y.length === 2}
          <g class="x">{#each crossGrid.xs as x, j (j)}<line x1={X(v, x)} y1={Y(v, d.horizontals.y[0]!)} x2={X(v, x)} y2={Y(v, d.horizontals.y[1]!)} />{/each}</g>
        {/if}
        {#each d.columns as c (c.key)}
          <polygon points={pts(v, c.outline)} class="col" data-testid="rc-wall-plan-column" data-key={c.key} />
          {#if on.vertical}<g class="v">{#each c.bars as b, i (i)}<circle cx={X(v, b.x)} cy={Y(v, b.y)} r={R(v, b.dia)} class="bnd" />{/each}</g>{/if}
        {/each}
        {#if on.vertical}
          <g class="v" data-testid="rc-wall-plan-vertical">{#each d.verticals as b, i (i)}<circle cx={X(v, b.x)} cy={Y(v, b.y)} r={R(v, b.dia)} class:bnd={b.boundary} />{/each}</g>
        {/if}
      </g>
      {#each d.columns as c (c.key)}
        {@const xs = c.outline.map((p) => X(v, p.x))}
        {@const cx = Math.min(Math.max((Math.min(...xs) + Math.max(...xs)) / 2, PAD2 + 30), W(v) - PAD2 - 30)}
        <text x={cx} y={Math.min(...c.outline.map((p) => Y(v, p.y))) - 4} class="dim tag" data-testid="rc-wall-plan-column-tag">{columnTag(c)}</text>
      {/each}
      {#if !v.clip}<text x={X(v, d.length) + 2} y={Y(v, d.thickness) + 12} class="dim end">t = {cm(d.thickness)}</text>{/if}
    </svg>
  {/snippet}
  {@render plan(overview)}
  {#if details.length}
    <div class="rwd-detail">
      <span class="rwd-k">{t('rcSheets.wallFig.planDetail')}</span>
      {#each details as v (v.id)}{@render plan(v)}{/each}
    </div>
  {/if}

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
  .col { fill: rgba(91, 141, 239, 0.1); stroke: var(--st-text-2); stroke-width: 1; stroke-dasharray: 3 2; }
  .v line { stroke: var(--c); stroke-width: 1; opacity: 0.8; }
  .v line.bnd { stroke-width: 2.2; opacity: 1; }
  .v circle { fill: var(--c); }
  .v circle.bnd { fill: var(--st-text); }
  .h line { stroke: var(--c); stroke-width: 1; }
  .dw { --c: #e8705f; }
  .dw line { stroke: var(--c); stroke-width: 1.2; }
  .u line, .u path { stroke: var(--c); stroke-width: 1.6; fill: none; }
  .t line, .t rect, .x line { stroke: var(--c); stroke-width: 1.2; fill: none; }
  .x circle { fill: var(--c); }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .dim.end { text-anchor: end; }
  .dim.tag { fill: var(--st-text-2); font-weight: 600; }
  .rwd-detail { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px 12px; }
  .rwd-k { flex-basis: 100%; font-size: 0.66rem; color: var(--st-text-3); }
  svg { max-width: 100%; height: auto; }
  .rwd-notes { margin: 0; padding-left: 14px; font-size: 0.66rem; color: var(--st-text-2); max-width: 64ch; }
</style>
