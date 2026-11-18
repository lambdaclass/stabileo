<script lang="ts">
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { footingDetail } from '../../../lib/rc-sheets/footing-detail';
  import { meshText } from '../../../lib/rc-sheets/footing-mesh';
  import { rulesFor } from '../../../lib/rc-sheets/codes';
  import type { FootingRow } from '../../../lib/rc-sheets/footing-types';
  import type { SheetCode } from '../../../lib/rc-sheets/types';

  let { row, code }: { row: FootingRow; code: SheetCode } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const cm = (m: number) => fmt(m * 100, 0);
  const det = $derived(footingDetail(row, rulesFor(code).bends));

  const SIZE = 240, PAD = 26;
  // The plan's extent: the footing, and the strap beams past its edge toward their partners.
  const box = $derived.by(() => {
    const xs = [-det.B / 2, det.B / 2, ...det.straps.flatMap((s) => [s.rect.x0, s.rect.x1])], ys = [-det.L / 2, det.L / 2, ...det.straps.flatMap((s) => [s.rect.y0, s.rect.y1])];
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const k = $derived((SIZE - 2 * PAD) / Math.max(box.x1 - box.x0, box.y1 - box.y0));
  const PX = (x: number) => PAD + (x - box.x0) * k;
  const PY = (y: number) => PAD + (box.y1 - y) * k;
  const planW = $derived(2 * PAD + (box.x1 - box.x0) * k), planH = $derived(2 * PAD + (box.y1 - box.y0) * k);

  const lap = $derived(row.dowels?.lap ?? 0);
  const above = $derived(Math.max(0.3, lap + 0.1));
  const ks = $derived(Math.min(k, (SIZE - 2 * PAD) / (det.h + above)));
  const SX = (x: number) => PAD + (x + det.B / 2) * ks;
  const SZ = (z: number) => PAD + (det.h + above - z) * ks;
  const secW = $derived(2 * PAD + det.B * ks + 24), secH = $derived(2 * PAD + (det.h + above) * ks);
  const xLayer = $derived(det.layers.find((l) => l.dir === 'x'));
  const yLayer = $derived(det.layers.find((l) => l.dir === 'y'));
  const legOf = (pts: Array<[number, number]>) => Math.abs(pts.find((q) => Math.abs(q[1]) > 1e-9)?.[1] ?? 0);
  const hookUp = $derived(xLayer ? legOf(xLayer.shape.pts) : 0);
  const topLeg = $derived(det.top ? legOf(det.top.shape.pts) : 0);
</script>

<figure class="rft" data-testid="rc-footing-figure">
  <figcaption>{row.name} · {cm(det.B)} × {cm(det.L)} × {cm(det.h)} cm</figcaption>
  <div class="rft-views">
    <svg width={planW} height={planH} viewBox="0 0 {planW} {planH}" role="img" aria-label={t('rcSheets.footFig.plan')} data-testid="rc-footing-plan">
      <rect x={PX(-det.B / 2)} y={PY(det.L / 2)} width={det.B * k} height={det.L * k} class="conc" />
      {#each det.layers as l (l.dir)}
        {#if l.band}
          {#if l.dir === 'x'}
            <line x1={PX(-det.B / 2)} y1={PY(l.band.lo)} x2={PX(det.B / 2)} y2={PY(l.band.lo)} class="band" />
            <line x1={PX(-det.B / 2)} y1={PY(l.band.hi)} x2={PX(det.B / 2)} y2={PY(l.band.hi)} class="band" />
          {:else}
            <line x1={PX(l.band.lo)} y1={PY(-det.L / 2)} x2={PX(l.band.lo)} y2={PY(det.L / 2)} class="band" />
            <line x1={PX(l.band.hi)} y1={PY(-det.L / 2)} x2={PX(l.band.hi)} y2={PY(det.L / 2)} class="band" />
          {/if}
        {/if}
        {#each l.positions as p, i (i)}
          {#if l.dir === 'x'}<line x1={PX(l.from)} y1={PY(p)} x2={PX(l.to)} y2={PY(p)} class="bar x" data-testid="rc-footing-bar-x" />
          {:else}<line x1={PX(p)} y1={PY(l.from)} x2={PX(p)} y2={PY(l.to)} class="bar y" data-testid="rc-footing-bar-y" />{/if}
        {/each}
      {/each}
      {#if det.top}
        {#each det.top.positions as p, i (i)}
          {#if det.top.dir === 'x'}<line x1={PX(det.top.from)} y1={PY(p)} x2={PX(det.top.to)} y2={PY(p)} class="bar top" data-testid="rc-footing-bar-top" />
          {:else}<line x1={PX(p)} y1={PY(det.top.from)} x2={PX(p)} y2={PY(det.top.to)} class="bar top" data-testid="rc-footing-bar-top" />{/if}
        {/each}
      {/if}
      {#each det.straps as st, i (i)}
        <rect x={PX(st.rect.x0)} y={PY(st.rect.y1)} width={(st.rect.x1 - st.rect.x0) * k} height={(st.rect.y1 - st.rect.y0) * k} class="strap" data-testid="rc-footing-strap" />
        <text x={PX((st.rect.x0 + st.rect.x1) / 2)} y={PY(st.rect.y1) - 3} class="lbl small">{st.axis === 'x' ? `→ ${st.partner}` : ''}</text>
        {#if st.axis === 'y'}<text x={PX(st.rect.x1) + 3} y={PY((st.rect.y0 + st.rect.y1) / 2)} class="lbl small left">→ {st.partner}</text>{/if}
      {/each}
      {#if det.column}<rect x={PX(det.column.x0)} y={PY(det.column.y1)} width={(det.column.x1 - det.column.x0) * k} height={(det.column.y1 - det.column.y0) * k} class="col" data-testid="rc-footing-column" />{/if}
      {#if det.second}<rect x={PX(det.second.x0)} y={PY(det.second.y1)} width={(det.second.x1 - det.second.x0) * k} height={(det.second.y1 - det.second.y0) * k} class="col" data-testid="rc-footing-column" />{/if}
      {#each det.lines as ln, i (i)}
        {#if ln.axis === 'x'}
          <line x1={PX(ln.at)} y1={PAD - 14} x2={PX(ln.at)} y2={planH - PAD + 14} class="pline" data-testid="rc-footing-line" />
          <text x={PX(ln.at) + 3} y={planH - PAD + 12} class="lbl small left">{t('rcSheets.footFig.line')}</text>
        {:else}
          <line x1={PAD - 14} y1={PY(ln.at)} x2={planW - PAD + 14} y2={PY(ln.at)} class="pline" data-testid="rc-footing-line" />
          <text x={PAD - 12} y={PY(ln.at) - 3} class="lbl small left">{t('rcSheets.footFig.line')}</text>
        {/if}
      {/each}
      <text x={PX(0)} y={PAD - 8} class="lbl">B = {cm(det.B)}</text>
      <text x={PAD - 8} y={PY(0)} class="lbl" transform="rotate(-90 {PAD - 8} {PY(0)})">L = {cm(det.L)}</text>
      <text x={PX(0)} y={planH - 6} class="lbl small">X {xLayer ? meshText(row.adopted.x) : '—'} · Y {yLayer ? meshText(row.adopted.y) : '—'}</text>
    </svg>
    <svg width={secW} height={secH} viewBox="0 0 {secW} {secH}" role="img" aria-label={t('rcSheets.footFig.section')} data-testid="rc-footing-section">
      <rect x={SX(-det.B / 2)} y={SZ(det.h)} width={det.B * ks} height={det.h * ks} class="conc" />
      {#each det.straps.filter((st) => st.axis === 'x') as st, i (i)}
        <rect x={SX(Math.max(-det.B / 2, st.rect.x0))} y={SZ(Math.min(st.h, det.h + above))} width={(Math.min(det.B / 2, st.rect.x1) - Math.max(-det.B / 2, st.rect.x0)) * ks} height={Math.min(st.h, det.h + above) * ks} class="strap" data-testid="rc-footing-section-strap" />
      {/each}
      {#each [det.column, det.second] as c, i (i)}
        {#if c}<rect x={SX(c.x0)} y={SZ(det.h + above)} width={(c.x1 - c.x0) * ks} height={above * ks} class="col" />{/if}
      {/each}
      {#if xLayer}
        <polyline points={[...(xLayer.ends[0] ? [[xLayer.from, xLayer.z + hookUp]] : []), [xLayer.from, xLayer.z], [xLayer.to, xLayer.z], ...(xLayer.ends[1] ? [[xLayer.to, xLayer.z + hookUp]] : [])].map(([x, z]) => `${SX(x!)},${SZ(z!)}`).join(' ')} class="bar x" data-testid="rc-footing-section-x" />
      {/if}
      {#if det.top && det.top.dir === 'x'}
        <polyline points={[[det.top.from, det.top.z - topLeg], [det.top.from, det.top.z], [det.top.to, det.top.z], [det.top.to, det.top.z - topLeg]].map(([x, z]) => `${SX(x!)},${SZ(z!)}`).join(' ')} class="bar top" data-testid="rc-footing-section-top" />
      {:else if det.top}
        {#each det.top.positions as p, i (i)}<circle cx={SX(p)} cy={SZ(det.top.z)} r={Math.max(1.5, (det.top.dia / 2000) * ks)} class="dot top" />{/each}
      {/if}
      {#each det.lines.filter((ln) => ln.axis === 'x') as ln, i (i)}
        <line x1={SX(ln.at)} y1={PAD - 6} x2={SX(ln.at)} y2={secH - PAD + 6} class="pline" />
      {/each}
      {#if yLayer}
        {#each yLayer.positions as p, i (i)}<circle cx={SX(p)} cy={SZ(yLayer.z)} r={Math.max(1.5, (yLayer.dia / 2000) * ks)} class="dot" />{/each}
      {/if}
      {#if det.dowels}
        {@const dw = det.dowels}
        {#each dw.xs as x, i (i)}
          {@const s = i === 0 ? -1 : 1}
          <polyline points="{SX(x + s * dw.foot)},{SZ(dw.z)} {SX(x)},{SZ(dw.z)} {SX(x)},{SZ(dw.z + dw.rise)}" class="bar dowel" data-testid="rc-footing-dowel" />
        {/each}
        <text x={SX(dw.xs[1]!) + 4} y={SZ(det.h + lap / 2)} class="lbl small left">{dw.count} Ø{dw.dia} · {cm(lap)}</text>
      {/if}
      <text x={SX(-det.B / 2) - 4} y={SZ(det.h / 2)} class="lbl small right">h {cm(det.h)}</text>
      <text x={SX(det.B / 2) + 2} y={SZ(0) - 2} class="lbl small left">c {fmt(det.cover * 100, 1)}</text>
    </svg>
  </div>
</figure>

<style>
  .rft { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .rft-views { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
  .conc { fill: var(--st-surface-3); stroke: var(--st-text-2); stroke-width: 1; }
  .col { fill: var(--st-hair-strong); stroke: var(--st-text-2); stroke-width: 1; }
  .bar { fill: none; stroke-width: 1.2; }
  .bar.x { stroke: var(--st-accent); }
  .bar.y { stroke: var(--st-warn); }
  .bar.dowel { stroke: var(--st-danger); stroke-width: 1.6; }
  .dot { fill: var(--st-warn); }
  .band { stroke: var(--st-text-3); stroke-width: 1; stroke-dasharray: 4 3; }
  .bar.top { stroke: var(--st-ok); stroke-dasharray: 5 2; }
  .dot.top { fill: var(--st-ok); }
  .strap { fill: color-mix(in srgb, var(--st-hair-strong) 45%, transparent); stroke: var(--st-text-2); stroke-width: 1; stroke-dasharray: 3 2; }
  .pline { stroke: var(--st-danger); stroke-width: 1.6; stroke-dasharray: 8 3 2 3; }
  .lbl { font-size: 10px; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .lbl.small { font-size: 9px; fill: var(--st-text-2); }
  .lbl.left { text-anchor: start; }
  .lbl.right { text-anchor: end; }
</style>
