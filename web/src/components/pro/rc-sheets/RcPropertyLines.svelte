<script lang="ts">
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { designData, patchDesignData } from '../../../lib/store/design-data';
  import { PROPERTY_SIDES, type PropertyLines, type PropertySide } from '../../../lib/model/foundation/edges';
  import type { FootingRow } from '../../../lib/rc-sheets/footing-types';
  import { footingCorners } from '../../../lib/rc-sheets/footing-overlaps';

  let { rows }: { rows: readonly FootingRow[] } = $props();

  const W = 220, H = 150, PAD = 22;
  const lines = $derived.by((): PropertyLines => { void modelStore.designData; return designData().propertyLines ?? {}; });
  const SIDE: Record<PropertySide, string> = { minX: '−X', maxX: '+X', minY: '−Y', maxY: '+Y' };

  const none = $derived(!PROPERTY_SIDES.some((k) => lines[k]));
  const all = $derived(PROPERTY_SIDES.every((k) => lines[k]));
  const setAll = (on: boolean) => patchDesignData({ propertyLines: on ? Object.fromEntries(PROPERTY_SIDES.map((k) => [k, true])) : undefined });
  function toggle(k: PropertySide) {
    const on = PROPERTY_SIDES.filter((s) => (s === k ? !lines[s] : lines[s]));
    patchDesignData({ propertyLines: on.length ? Object.fromEntries(on.map((s) => [s, true])) : undefined });
  }

  const plan = $derived.by(() => {
    const pts = rows.flatMap((r) => (r.demand.group?.members ?? (r.demand.carried ? [r.demand, r.demand.carried] : [r.demand])).map((m) => ({ r, name: m.name, key: m.key, pier: m.pier, x: m.at.x, y: m.at.y })));
    if (!pts.length) return null;
    const outlines = rows.filter((r) => r.B > 0 && r.L > 0).map((r) => ({ key: r.key, name: r.name, kind: r.cap ? 'pileCap' : r.group?.kind ?? (r.combined ? 'combined' : r.edge?.position ?? 'centred'), fail: r.status === 'fail', pts: footingCorners(r) }));
    const ext = [...pts, ...outlines.flatMap((o) => o.pts)];
    const x0 = Math.min(...ext.map((p) => p.x)), x1 = Math.max(...ext.map((p) => p.x));
    const y0 = Math.min(...ext.map((p) => p.y)), y1 = Math.max(...ext.map((p) => p.y));
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-6), (H - 2 * PAD) / Math.max(y1 - y0, 1e-6));
    const w = (x1 - x0) * k, h = (y1 - y0) * k;
    const ox = (W - w) / 2, oy = (H - h) / 2;
    const sx = (x: number) => ox + (x - x0) * k, sy = (y: number) => oy + h - (y - y0) * k;
    const cx0 = Math.min(...pts.map((p) => p.x)), cx1 = Math.max(...pts.map((p) => p.x)), cy0 = Math.min(...pts.map((p) => p.y)), cy1 = Math.max(...pts.map((p) => p.y));
    const sides: Record<PropertySide, [number, number, number, number]> = {
      minX: [sx(cx0), sy(cy0), sx(cx0), sy(cy1)], maxX: [sx(cx1), sy(cy0), sx(cx1), sy(cy1)],
      minY: [sx(cx0), sy(cy0), sx(cx1), sy(cy0)], maxY: [sx(cx0), sy(cy1), sx(cx1), sy(cy1)],
    };
    const dots = pts.map((p) => {
      const a = p.r.group ? [0, 0] : p.r.edge?.anchor ?? [0, 0];
      const outline = p.pier?.outline?.map((q) => `${sx(q.x).toFixed(1)},${sy(q.y).toFixed(1)}`).join(' ');
      return { key: p.key, name: p.name, x: sx(p.x), y: sy(p.y), ax: a[0], ay: -a[1], position: p.r.group ? 'centred' : p.r.edge?.position ?? 'centred', byHand: p.r.edge?.source === 'row', ...(outline ? { outline } : {}) };
    });
    const shapes = outlines.map((o) => ({ ...o, points: o.pts.map((q) => `${sx(q.x).toFixed(1)},${sy(q.y).toFixed(1)}`).join(' ') }));
    return { sides, dots, shapes };
  });
  const counts = $derived({
    edge: rows.filter((r) => r.edge?.position === 'edge').length,
    corner: rows.filter((r) => r.edge?.position === 'corner').length,
  });
</script>

{#if plan}
  <div class="rpl" data-testid="rc-property-lines">
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="group" aria-label={t('fdn.propertyLines')}>
      {#each PROPERTY_SIDES as k (k)}
        {@const s = plan.sides[k]}
        <line class="side" class:on={!!lines[k]} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} />
        <line class="hit" x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} role="button" tabindex="0" aria-pressed={!!lines[k]} aria-label={tp('rcSheets.footLines.side', { side: SIDE[k] })}
          onclick={() => toggle(k)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(k); } }} data-testid="rc-property-line-{k}"><title>{tp('rcSheets.footLines.side', { side: SIDE[k] })}</title></line>
      {/each}
      {#each plan.shapes as f (f.key)}
        <polygon class="fdn {f.kind}" class:fail={f.fail} points={f.points} data-testid="rc-property-footing" data-kind={f.kind}><title>{f.name}</title></polygon>
      {/each}
      {#each plan.dots as d (d.key)}
        {#if d.outline}
          <polygon class="pier {d.position}" points={d.outline} data-testid="rc-property-pier"><title>{d.name} · {t(`rcSheets.footPos.${d.position}`)}</title></polygon>
        {:else}
        <g class="dot {d.position}" class:hand={d.byHand} transform="translate({d.x} {d.y})">
          {#if d.position === 'centred'}
            <rect x="-3" y="-3" width="6" height="6" />
          {:else}
            <rect x={d.ax > 0 ? -8 : d.ax < 0 ? -3 : -5.5} y={d.ay > 0 ? -8 : d.ay < 0 ? -3 : -5.5} width="11" height="11" />
            <rect class="col" x="-3" y="-3" width="6" height="6" />
          {/if}
          <title>{d.name} · {t(`rcSheets.footPos.${d.position}`)}</title>
        </g>
        {/if}
      {/each}
    </svg>
    <div class="rpl-side">
      <div class="rpl-chips" role="group" aria-label={t('fdn.propertyLines')}>
        {#each PROPERTY_SIDES as k (k)}
          <button type="button" class:on={!!lines[k]} aria-pressed={!!lines[k]} onclick={() => toggle(k)} data-testid="rc-property-chip-{k}">{SIDE[k]}</button>
        {/each}
        <button type="button" class:on={all} aria-pressed={all} onclick={() => setAll(!all)} data-testid="rc-property-chip-all">{t('rcSheets.footLines.all')}</button>
      </div>
      {#if none}<span class="rpl-none" data-testid="rc-property-lines-none">{t('rcSheets.footLines.none')}</span>{/if}
      <span class="rpl-note">{t('rcSheets.footLines.hint')} · {tp('rcSheets.footLines.count', { edge: counts.edge, corner: counts.corner })}</span>
    </div>
  </div>
{/if}

<style>
  .rpl { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  svg { background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: 6px; }
  .side { stroke: var(--st-text-3); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .side.on { stroke: var(--st-warn); stroke-width: 4; stroke-dasharray: none; }
  .hit { stroke: transparent; stroke-width: 14; cursor: pointer; }
  .hit:focus-visible { stroke: color-mix(in srgb, var(--st-accent) 35%, transparent); outline: none; }
  .dot rect { fill: color-mix(in srgb, var(--st-text-2) 25%, transparent); stroke: var(--st-text-2); stroke-width: 1; }
  .dot.edge rect:first-child, .dot.corner rect:first-child { fill: color-mix(in srgb, var(--st-warn) 30%, transparent); stroke: var(--st-warn); }
  .dot.hand rect:first-child { stroke-dasharray: 2 1.5; }
  .dot rect.col { fill: var(--st-text-2); stroke: none; }
  .fdn { fill: color-mix(in srgb, var(--st-accent) 10%, transparent); stroke: var(--st-accent); stroke-width: 0.8; }
  .fdn.mat, .fdn.strip, .fdn.combined { fill: color-mix(in srgb, var(--st-accent) 18%, transparent); stroke-width: 1.2; }
  .fdn.fail { stroke: var(--st-danger); }
  .pier { fill: color-mix(in srgb, var(--st-text-2) 45%, transparent); stroke: var(--st-text-2); stroke-width: 1; }
  .pier.edge, .pier.corner { stroke: var(--st-warn); }
  .rpl-side { display: flex; flex-direction: column; gap: 6px; max-width: 32ch; }
  .rpl-chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .rpl-chips button { font-size: 0.72rem; padding: 2px 8px; border: 1px solid var(--st-hair); border-radius: 4px; background: var(--st-surface-2); color: var(--st-text-2); cursor: pointer; }
  .rpl-chips button.on { border-color: var(--st-warn); color: var(--st-warn); font-weight: 600; }
  .rpl-none { font-size: 0.72rem; color: var(--st-warn); }
  .rpl-note { font-size: 0.72rem; color: var(--st-text-3); }
</style>
