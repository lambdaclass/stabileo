<script lang="ts">
  import { i18n, t, tp, tpn } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { scaleBarLength, type PlanItem, type Pt, type StructurePlan } from '../../../lib/rc-sheets/structure-plan';
  import { placeStructureLabels } from '../../../lib/rc-sheets/structure-plan-labels';
  import type { CheckLine } from '../../../lib/rc-sheets/types';
  import { localizeCriterion } from '../../../lib/rc-sheets/criteria';

  let { plan, onopen }: { plan: StructurePlan; onopen: (key: string) => void } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let width = $state(1100);
  let hovered = $state<string | null>(null);

  const PAD = 48, BAR_BAND = 34, MAX_PX_PER_M = 70, CHAR_PX = 5.6, TEXT_PX = 11, GAP_PX = 3, BUBBLE_PX = 9;
  const W = $derived(Math.max(640, Math.floor(width)));
  const box = $derived(plan.bounds);
  const k = $derived(Math.min(MAX_PX_PER_M, (W - 2 * PAD) / Math.max(box.x1 - box.x0, 1)));
  const ox = $derived(PAD + (W - 2 * PAD - (box.x1 - box.x0) * k) / 2);
  const H = $derived((box.y1 - box.y0) * k + 2 * PAD + BAR_BAND);
  const sx = (x: number) => ox + (x - box.x0) * k;
  const sy = (y: number) => PAD + (box.y1 - y) * k;
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ');
  const cm = (m: number) => fmt(m * 100, 0);
  const text = (it: PlanItem) => (it.kind === 'wall' ? `${it.name} · e=${cm(it.thickness)} · ${it.bars}` : `${it.name} · ${it.bars}`);
  const bubbles = $derived(plan.axes.flatMap((a) => [a.a, a.b].map((p) => ({ name: a.name, at: p }))));
  const places = $derived(placeStructureLabels(plan.items, text, { char: CHAR_PX / k, height: TEXT_PX / k, gap: GAP_PX / k }, {
    lines: plan.axes.map((a) => [a.a, a.b] as [Pt, Pt]),
    boxes: bubbles.map((b) => ({ x0: b.at[0] - BUBBLE_PX / k, y0: b.at[1] - BUBBLE_PX / k, x1: b.at[0] + BUBBLE_PX / k, y1: b.at[1] + BUBBLE_PX / k })),
  }));
  const bar = $derived(scaleBarLength(k, 80));
  const checkText = (c: CheckLine | undefined) => (c
    ? `${t(c.label)}${c.clause ? ` (${localizeCriterion(c.clause, t)})` : ''}${c.demand ? `: ${c.demand}` : ''}${c.capacity ? ` / ${c.capacity}` : ''}${c.ratio !== undefined && Number.isFinite(c.ratio) ? ` · ${fmt(c.ratio, 2)}` : ''}`
    : t('rcSheets.structPlan.noCheck'));
  const tip = (it: PlanItem) => `${it.name} · ${t(`rcSheets.status.${it.status}`)} — ${checkText(it.check)}`;
  const shown = $derived(plan.items.find((it) => it.key === hovered));
  const onkey = (e: KeyboardEvent, key: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onopen(key); } };
  const family = $derived(t(`rcSheets.family.${plan.family}`));
</script>

<figure class="rst" data-testid="rc-struct-plan" data-family={plan.family} data-level={plan.level}>
  <figcaption>{tp('rcSheets.structPlan.title', { family, level: plan.level || '—' })}</figcaption>
  <div class="rst-legend">
    {#each ['ok', 'warn', 'fail'] as s (s)}<span class="lg st-{s}"><i></i>{t(`rcSheets.status.${s}`)}</span>{/each}
    <span class="dim">{t(`rcSheets.structPlan.key.${plan.family}`)}</span>
  </div>
  <div class="rst-fit" bind:clientWidth={width}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={tp('rcSheets.structPlan.title', { family, level: plan.level || '—' })} data-testid="rc-struct-svg">
      {#each plan.slabs as r, i (i)}
        <rect x={sx(r.x0)} y={sy(r.y1)} width={(r.x1 - r.x0) * k} height={(r.y1 - r.y0) * k} class="slab" />
      {/each}
      {#each plan.axes as a, i (i)}
        <line x1={sx(a.a[0])} y1={sy(a.a[1])} x2={sx(a.b[0])} y2={sy(a.b[1])} class="axis" />
      {/each}
      {#each bubbles as b, i (i)}
        <circle cx={sx(b.at[0])} cy={sy(b.at[1])} r={BUBBLE_PX} class="bubble" />
        <text x={sx(b.at[0])} y={sy(b.at[1])} class="bname" data-testid="rc-struct-axis">{b.name}</text>
      {/each}
      {#each plan.items as it (it.key)}
        {@const at = places.get(it.key)}
        <g class="item st-{it.status}" class:hov={hovered === it.key} role="button" tabindex="0" aria-label={tip(it)}
          onclick={() => onopen(it.key)} onkeydown={(e) => onkey(e, it.key)} onmouseenter={() => (hovered = it.key)} onmouseleave={() => (hovered = null)} onfocus={() => (hovered = it.key)} onblur={() => (hovered = null)}
          data-testid="rc-struct-item" data-key={it.key} data-status={it.status}>
          <title>{tip(it)}</title>
          {#if it.kind === 'beam'}
            {#each it.spans as s, j (j)}
              <line x1={sx(s.a[0])} y1={sy(s.a[1])} x2={sx(s.b[0])} y2={sy(s.b[1])} class="beam" stroke-width={Math.max(3, s.width * k)} />
              <line x1={sx(s.a[0])} y1={sy(s.a[1])} x2={sx(s.b[0])} y2={sy(s.b[1])} class="beam-axis" />
            {/each}
            {#each it.cuts as c, j (j)}<circle cx={sx(c[0])} cy={sy(c[1])} r="2.2" class="cut" data-testid="rc-struct-cut" />{/each}
            {#each it.splices as [p, q], j (j)}<line x1={sx(p[0])} y1={sy(p[1])} x2={sx(q[0])} y2={sy(q[1])} class="splice" data-testid="rc-struct-splice" />{/each}
          {:else if it.kind === 'column'}
            <polygon points={pts(it.outline)} class="solid" />
            {#each it.rebars as r, j (j)}<circle cx={sx(r.at[0])} cy={sy(r.at[1])} r={Math.max(1, (r.dia / 2000) * k)} class="rebar" />{/each}
          {:else}
            <polygon points={pts(it.outline)} class="solid" />
          {/if}
          {#if at}
            <text x={sx(at.at[0])} y={sy(at.at[1])} class="lbl" transform={at.rot ? `rotate(${-at.rot} ${sx(at.at[0])} ${sy(at.at[1])})` : undefined} data-testid="rc-struct-label">{text(it)}</text>
          {/if}
        </g>
      {/each}
      <g class="scale" data-testid="rc-struct-scale" data-length={bar}>
        <line x1={ox} y1={H - 18} x2={ox + bar * k} y2={H - 18} />
        <line x1={ox} y1={H - 22} x2={ox} y2={H - 14} />
        <line x1={ox + bar * k} y1={H - 22} x2={ox + bar * k} y2={H - 14} />
        <text x={ox + bar * k + 6} y={H - 18} class="sct">{fmt(bar, bar < 1 ? 1 : 0)} m</text>
      </g>
    </svg>
  </div>
  <p class="note" data-testid="rc-struct-hover">{shown ? tip(shown) : t('rcSheets.structPlan.hint')}</p>
  {#if plan.unplaced.length}<p class="note bad" data-testid="rc-struct-unplaced">{tpn('rcSheets.structPlan.unplaced', plan.unplaced.length)}</p>{/if}
</figure>

<style>
  .rst { margin: 0; display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .rst-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.68rem; color: var(--st-text-2); }
  .lg { display: inline-flex; align-items: center; gap: 4px; }
  .lg i { width: 10px; height: 10px; border-radius: 2px; background: var(--c); }
  .dim { color: var(--st-text-3); }
  .rst-fit { width: 100%; overflow-x: auto; }
  svg { background: var(--st-surface); border-radius: 4px; }
  .st-ok { --c: var(--st-ok); }
  .st-warn { --c: var(--st-text-2); }
  .st-fail { --c: var(--st-danger); }
  .slab { fill: var(--st-surface-3, rgba(128, 128, 128, 0.08)); stroke: var(--st-text-3); stroke-width: 0.6; opacity: 0.45; }
  .axis { stroke: var(--st-text-3); stroke-width: 0.7; stroke-dasharray: 10 3 2 3; opacity: 0.7; }
  .bubble { fill: var(--st-surface); stroke: var(--st-text-3); stroke-width: 0.8; }
  .bname { font-size: 9px; fill: var(--st-text-2); text-anchor: middle; dominant-baseline: central; }
  .item { cursor: pointer; outline: none; }
  .beam { stroke: var(--c); opacity: 0.35; stroke-linecap: butt; }
  .beam-axis { stroke: var(--c); stroke-width: 1.2; }
  .cut { fill: var(--st-surface); stroke: var(--c); stroke-width: 1; }
  .splice { stroke: var(--c); stroke-width: 1.2; }
  .solid { fill: color-mix(in srgb, var(--c) 35%, transparent); stroke: var(--c); stroke-width: 1.2; }
  .rebar { fill: var(--c); }
  .lbl { font-size: 9px; fill: var(--c); text-anchor: middle; dominant-baseline: central; font-family: var(--st-mono); font-weight: 600; }
  .item.hov .beam { opacity: 0.6; }
  .item.hov .solid { fill: color-mix(in srgb, var(--c) 60%, transparent); }
  .item.hov .lbl, .item:focus-visible .lbl { text-decoration: underline; }
  .scale line { stroke: var(--st-text-2); stroke-width: 1.2; }
  .sct { font-size: 9px; fill: var(--st-text-2); dominant-baseline: central; font-family: var(--st-mono); }
  .note { margin: 0; font-size: 0.68rem; color: var(--st-text-3); max-width: 110ch; min-height: 1.2em; }
  .note.bad { color: var(--st-danger); }
</style>
