<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { groupDetail } from '../../../lib/rc-sheets/footing-group-detail';
  import { meshText } from '../../../lib/rc-sheets/footing-mesh';
  import { rulesFor } from '../../../lib/rc-sheets/codes';
  import type { FootingRow } from '../../../lib/rc-sheets/footing-types';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { row, code }: { row: FootingRow; code: SheetCode } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const cm = (m: number) => fmt(m * 100, 0);
  const det = $derived(groupDetail(row, rulesFor(code).bends));
  const g = $derived(row.group!);

  const SIZE = 420, PAD = 26;
  const k = $derived((SIZE - 2 * PAD) / Math.max(row.B, row.L));
  const PX = (x: number) => PAD + (x + row.B / 2) * k;
  const PY = (y: number) => PAD + (row.L / 2 - y) * k;
  const planW = $derived(2 * PAD + row.B * k), planH = $derived(2 * PAD + row.L * k);
  const above = $derived(row.pedestal + 0.4);
  const below = $derived(Math.max(0, ...det.drops.map((d) => d.hd)));
  const ks = $derived(Math.min(k, 140 / (row.h + above + below)));
  const SX = (x: number) => PAD + (x + row.B / 2) * ks;
  const SZ = (z: number) => PAD + (row.h + above - z) * ks;
  const secW = $derived(2 * PAD + row.B * ks + 24), secH = $derived(2 * PAD + (row.h + above + below) * ks);
  const legXs = (c: (typeof det.cages)[number]) => [...new Set(c.legs.map((q) => Math.round(q.x * 1000) / 1000))];
  const leg = (pts: Array<[number, number]>) => Math.abs(pts.find((q) => Math.abs(q[1]) > 1e-9)?.[1] ?? 0);
  const cut = $derived([...det.layers, ...det.drops.flatMap((d) => d.layers)].filter((l) => l.dir === 'x'));
</script>

<figure class="rft" data-testid="rc-footing-group-figure">
  <figcaption>{row.name} · {cm(row.B)} × {cm(row.L)} × {cm(row.h)} cm · z = {fmt(row.founding, 2)} m</figcaption>
  <div class="rft-views">
    <svg width={planW} height={planH} viewBox="0 0 {planW} {planH}" role="img" aria-label={t('rcSheets.footFig.plan')} data-testid="rc-footing-group-plan">
      <rect x={PX(-row.B / 2)} y={PY(row.L / 2)} width={row.B * k} height={row.L * k} class="conc" />
      {#each det.layers as l, li (li)}
        {#each l.positions as p, i (i)}
          {#if l.dir === 'x'}<line x1={PX(l.from)} y1={PY(p)} x2={PX(l.to)} y2={PY(p)} class="bar x" class:top={l.face === 'top'} class:extra={l.set.startsWith('extra')} />
          {:else}<line x1={PX(p)} y1={PY(l.from)} x2={PX(p)} y2={PY(l.to)} class="bar y" class:top={l.face === 'top'} class:extra={l.set.startsWith('extra')} />{/if}
        {/each}
      {/each}
      {#each g.strips as s, i (i)}
        {#each [s.at - s.width / 2, s.at + s.width / 2] as b, j (j)}
          {#if s.dir === 'x'}<line x1={PX(-row.B / 2)} y1={PY(b)} x2={PX(row.B / 2)} y2={PY(b)} class="band" />
          {:else}<line x1={PX(b)} y1={PY(-row.L / 2)} x2={PX(b)} y2={PY(row.L / 2)} class="band" />{/if}
        {/each}
      {/each}
      {#each det.drops as d (d.key)}<rect x={PX(d.rect.x0)} y={PY(d.rect.y1)} width={(d.rect.x1 - d.rect.x0) * k} height={(d.rect.y1 - d.rect.y0) * k} class="drop" data-testid="rc-footing-drop"><title>{d.name} · {cm(d.hd)} cm</title></rect>{/each}
      {#each det.cages as c (c.key)}{#each c.legs as q, i (i)}<circle cx={PX(q.x)} cy={PY(q.y)} r="1.6" class="leg" data-testid="rc-footing-leg" />{/each}{/each}
      {#each g.columns as c (c.key)}
        <rect x={PX(c.x - c.b / 2)} y={PY(c.y + c.h / 2)} width={c.b * k} height={c.h * k} class="col" class:fail={!!c.punching && c.punching.utilization > 1 + 1e-6} data-testid="rc-footing-group-column"><title>{c.name}{c.punching ? ` · ${fmt(c.punching.utilization, 2)}` : ''}</title></rect>
        <text x={PX(c.x)} y={PY(c.y + c.h / 2) - 3} class="lbl small">{c.name}</text>
      {/each}
      {#if g.anchor[0]}<line x1={PX((g.anchor[0] * row.B) / 2)} y1={PAD - 14} x2={PX((g.anchor[0] * row.B) / 2)} y2={planH - PAD + 14} class="pline" data-testid="rc-footing-line" />{/if}
      {#if g.anchor[1]}<line x1={PAD - 14} y1={PY((g.anchor[1] * row.L) / 2)} x2={planW - PAD + 14} y2={PY((g.anchor[1] * row.L) / 2)} class="pline" data-testid="rc-footing-line" />{/if}
      <text x={PX(0)} y={PAD - 8} class="lbl">B = {cm(row.B)}</text>
      <text x={PAD - 8} y={PY(0)} class="lbl" transform="rotate(-90 {PAD - 8} {PY(0)})">L = {cm(row.L)}</text>
      <text x={PX(0)} y={planH - 6} class="lbl small">X {meshText(row.adopted.x)}{row.adopted.tops?.x ? ` / ${meshText(row.adopted.tops.x)}` : ''} · Y {meshText(row.adopted.y)}{row.adopted.tops?.y ? ` / ${meshText(row.adopted.tops.y)}` : ''}</text>
    </svg>
    <svg width={secW} height={secH} viewBox="0 0 {secW} {secH}" role="img" aria-label={t('rcSheets.footFig.section')} data-testid="rc-footing-group-section">
      <rect x={SX(-row.B / 2)} y={SZ(row.h)} width={row.B * ks} height={row.h * ks} class="conc" />
      {#each det.drops as d (d.key)}<rect x={SX(d.rect.x0)} y={SZ(0)} width={(d.rect.x1 - d.rect.x0) * ks} height={d.hd * ks} class="conc" />{/each}
      {#each det.cages as c (c.key)}{#each legXs(c) as x (x)}<line x1={SX(x)} y1={SZ(c.z0)} x2={SX(x)} y2={SZ(row.h - c.z0)} class="leg-s" />{/each}{/each}
      {#each g.columns as c (c.key)}<rect x={SX(c.x - c.b / 2)} y={SZ(row.h + above)} width={c.b * ks} height={above * ks} class="col" />{/each}
      {#each cut as l, i (i)}
        {@const u = leg(l.shape.pts) * (l.face === 'top' ? -1 : 1)}
        <polyline points="{SX(l.from)},{SZ(l.z + u)} {SX(l.from)},{SZ(l.z)} {SX(l.to)},{SZ(l.z)} {SX(l.to)},{SZ(l.z + u)}" class="bar x" class:top={l.face === 'top'} />
      {/each}
      {#if row.pedestal > 1e-3}<text x={SX(row.B / 2) + 2} y={SZ(row.h + row.pedestal / 2)} class="lbl small left">{t('rcSheets.foot.pedestal')} {cm(row.pedestal)}</text>{/if}
      <text x={SX(-row.B / 2) - 4} y={SZ(row.h / 2)} class="lbl small right">h {cm(row.h)}</text>
      <text x={SX(row.B / 2) + 2} y={SZ(0) - 2} class="lbl small left">z {fmt(row.founding, 2)}</text>
    </svg>
  </div>
</figure>

<style>
  .rft { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); max-width: 100%; overflow-x: auto; }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .rft-views { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
  .conc { fill: var(--st-surface-3); stroke: var(--st-text-2); stroke-width: 1; }
  .col { fill: var(--st-hair-strong); stroke: var(--st-text-2); stroke-width: 1; }
  .col.fail { stroke: var(--st-danger); stroke-width: 2; }
  .bar { fill: none; stroke-width: 0.8; }
  .drop { fill: none; stroke: var(--st-text-2); stroke-width: 1; stroke-dasharray: 4 3; }
  .leg { fill: var(--st-danger); }
  .leg-s { stroke: var(--st-danger); stroke-width: 0.8; }
  .bar.x { stroke: var(--st-accent); }
  .bar.y { stroke: var(--st-warn); }
  .bar.top { stroke-dasharray: 5 2; opacity: 0.8; }
  .bar.extra { stroke-width: 1.6; }
  .band { stroke: var(--st-text-3); stroke-width: 1; stroke-dasharray: 4 3; }
  .pline { stroke: var(--st-danger); stroke-width: 1.6; stroke-dasharray: 8 3 2 3; }
  .lbl { font-size: 10px; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .lbl.small { font-size: 9px; fill: var(--st-text-2); }
  .lbl.left { text-anchor: start; }
  .lbl.right { text-anchor: end; }
</style>
