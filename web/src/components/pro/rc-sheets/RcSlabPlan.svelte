<script lang="ts">
  import { i18n, t, tp } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { meshArea, meshLabel } from '../../../lib/rc-sheets/bars';
  import { planDrawing, type LevelPlan } from '../../../lib/rc-sheets/slab-plan';

  let { plan }: { plan: LevelPlan } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let show = $state({ bottom: true, top: true, base: false });

  const W = 1100, PAD = 44, LEG_PX = 14;
  const box = $derived.by(() => {
    const xs = [...plan.panels.flatMap((p) => [p.rect.x0, p.rect.x1]), ...plan.beams.flatMap((b) => [b.x1, b.x2])];
    const ys = [...plan.panels.flatMap((p) => [p.rect.y0, p.rect.y1]), ...plan.beams.flatMap((b) => [b.y1, b.y2])];
    return { x0: Math.min(...xs) - 0.5, x1: Math.max(...xs) + 0.5, y0: Math.min(...ys) - 0.5, y1: Math.max(...ys) + 0.5 };
  });
  const k = $derived((W - 2 * PAD) / Math.max(box.x1 - box.x0, 1));
  const H = $derived((box.y1 - box.y0) * k + 2 * PAD);
  const sx = (x: number) => PAD + (x - box.x0) * k;
  const sy = (y: number) => PAD + (box.y1 - y) * k;
  const hMax = $derived(Math.max(0.1, ...plan.panels.map((p) => p.h)));
  const fold = $derived(Math.max(1, LEG_PX / (0.7 * hMax * k)));
  const bars = $derived(planDrawing(plan, show, fmt, fold));
  const cm = (m: number) => fmt(m * 100, 0);
  const pts = (p: Array<[number, number]>) => p.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ');
  const arrow = (tip: [number, number], from: [number, number]) => {
    const [ax, ay] = [sx(tip[0]), sy(tip[1])], [bx, by] = [sx(from[0]), sy(from[1])];
    const l = Math.hypot(ax - bx, ay - by) || 1, ux = (ax - bx) / l, uy = (ay - by) / l, s = 6;
    return `${ax},${ay} ${ax - ux * s - uy * s / 2},${ay - uy * s + ux * s / 2} ${ax - ux * s + uy * s / 2},${ay - uy * s - ux * s / 2}`;
  };
  const short = $derived(plan.checks.filter((c) => !c.ok));
  const anchorsShort = $derived(plan.packages.filter((pk) => pk.anchor && !pk.anchor.ok));
  const reachShort = $derived(plan.packages.filter((pk) => pk.reach.some((r) => r.length < r.needed - 1e-6)));
  const has = (layer: 'bottom' | 'top') => plan.packages.some((pk) => pk.layer === layer);
</script>

<figure class="rsp" data-testid="rc-slab-plan-level" data-level={plan.level}>
  <figcaption>{tp('rcSheets.planFig.title', { level: plan.level || '—' })}</figcaption>
  <div class="rsp-toggles" role="group" aria-label={t('rcSheets.slabFig.layers')}>
    <label class="tg tg-bottom" class:off={!has('bottom')}><input type="checkbox" bind:checked={show.bottom} disabled={!has('bottom')} data-testid="rc-plan-show-bottom" /> {t('rcSheets.planFig.bottom')}</label>
    <label class="tg tg-top" class:off={!has('top')}><input type="checkbox" bind:checked={show.top} disabled={!has('top')} data-testid="rc-plan-show-top" /> {t('rcSheets.planFig.top')}</label>
    {#if plan.baseMesh}<label class="tg"><input type="checkbox" bind:checked={show.base} data-testid="rc-plan-show-base" /> {t('rcSheets.planFig.base')}</label>{/if}
  </div>
  <svg viewBox="0 0 {W} {H}" width="100%" style="max-width: {W}px" role="img" aria-label={tp('rcSheets.planFig.title', { level: plan.level || '—' })} data-testid="rc-plan-svg">
    {#each plan.panels as p (p.key)}
      <rect x={sx(p.rect.x0)} y={sy(p.rect.y1)} width={(p.rect.x1 - p.rect.x0) * k} height={(p.rect.y1 - p.rect.y0) * k} class="panel st-{p.status}" />
      <text x={sx((p.rect.x0 + p.rect.x1) / 2)} y={sy(p.rect.y1) + 12} class="pname">{p.name} · h={cm(p.h)}</text>
    {/each}
    {#each plan.beams as b, i (i)}
      <line x1={sx(b.x1)} y1={sy(b.y1)} x2={sx(b.x2)} y2={sy(b.y2)} class="support {b.kind}" stroke-width={Math.max(2, b.b * k)} />
    {/each}
    {#each plan.columns as c, i (i)}
      <rect x={sx(c.x) - Math.max(3, c.b * k / 2)} y={sy(c.y) - Math.max(3, c.h * k / 2)} width={Math.max(6, c.b * k)} height={Math.max(6, c.h * k)} class="column" />
    {/each}
    {#each bars as b (b.id)}
      {@const main = b.legs.reduce((m, l, j) => (l.length > b.legs[m]!.length ? j : m), 0)}
      <g class="bar {b.layer}-{b.dir} k-{b.kind}" data-testid="rc-plan-bar" data-layer={b.layer} data-dir={b.dir} data-kind={b.kind} data-mark={b.mark}>
        <line x1={sx(b.band[0][0])} y1={sy(b.band[0][1])} x2={sx(b.band[1][0])} y2={sy(b.band[1][1])} class="band" />
        <polygon points={arrow(b.band[0], b.band[1])} class="tip" />
        <polygon points={arrow(b.band[1], b.band[0])} class="tip" />
        <polyline points={pts(b.pts)} class="rod" />
        {#each b.legs as l, j (j)}
          {#if j !== main}<text x={sx(l.at[0])} y={sy(l.at[1])} class="leg" dy="-2" data-testid="rc-plan-leg">{cm(l.length)}</text>{/if}
        {/each}
        {#if b.dir === 'x'}
          <text x={sx(b.at[0])} y={sy(b.at[1]) - 4} class="lbl">{b.mark} · {b.label}</text>
        {:else}
          <text x={sx(b.at[0]) - 4} y={sy(b.at[1])} class="lbl" transform="rotate(-90 {sx(b.at[0]) - 4} {sy(b.at[1])})">{b.mark} · {b.label}</text>
        {/if}
      </g>
    {/each}
  </svg>
  {#if plan.baseMesh && !show.base}<p class="note" data-testid="rc-plan-base-note">{tp('rcSheets.planFig.baseNote', { mesh: meshLabel(plan.baseMesh) })}</p>{/if}
  <p class="note">{t('rcSheets.planFig.folded')}</p>
  <p class="note">{tp('rcSheets.planFig.rules', { interior: fmt(plan.rules.reach.interior, 2), end: fmt(plan.rules.reach.end, 2), clause: plan.rules.clause.topReach })}</p>
  {#each plan.cantilevers as c (c.panel + c.dir)}<p class="note" data-testid="rc-plan-cantilever">{tp('rcSheets.planFig.cantilever', { panel: c.panel, length: fmt(c.length, 2) })}</p>{/each}
  <p class="note" class:bad={short.length > 0} data-testid="rc-plan-checks">{tp('rcSheets.planFig.checks', { ok: plan.checks.length - short.length, n: plan.checks.length })}</p>
  {#each short as c, i (i)}<p class="note bad" data-testid="rc-plan-short">{tp('rcSheets.planFig.short', { where: c.where, face: t(`rcSheets.face.${c.layer}${c.dir.toUpperCase()}`), provided: fmt(c.provided), required: fmt(c.required) })}</p>{/each}
  {#each reachShort as pk (pk.id)}{@const r = pk.reach.find((x) => x.length < x.needed - 1e-6)!}<p class="note bad" data-testid="rc-plan-short">{tp('rcSheets.planFig.reachShort', { mark: pk.mark, length: cm(r.length), needed: cm(r.needed) })}</p>{/each}
  {#each anchorsShort as pk (pk.id)}<p class="note warn">{tp('rcSheets.planFig.anchorShort', { mark: pk.mark, needed: cm(pk.anchor!.needed), available: cm(pk.anchor!.available) })}</p>{/each}
  <details>
    <summary>{t('rcSheets.planFig.schedule')} ({plan.packages.length})</summary>
    <table class="sched" data-testid="rc-plan-schedule">
      <thead><tr><th>{t('rcSheets.line.mark')}</th><th>{t('rcSheets.line.kind')}</th><th>Ø · s</th><th>n</th><th>L (m)</th><th>cm²/m</th><th>kg</th></tr></thead>
      <tbody>
        {#each plan.packages as pk (pk.id)}
          <tr><td>{pk.mark}</td><td>{t(`rcSheets.planFig.kind.${pk.kind}`)} ({t(pk.layer === 'top' ? 'rcSheets.col.top' : 'rcSheets.col.bottom')} {pk.dir.toUpperCase()})</td><td>{meshLabel(pk.bars)}</td><td>{pk.count}</td><td>{fmt(pk.length, 2)}</td><td>{fmt(meshArea(pk.bars))}</td><td>{fmt(pk.weight, 1)}</td></tr>
        {/each}
      </tbody>
    </table>
    <table class="sched">
      <thead><tr><th>Ø</th><th>ld</th><th>{t('rcSheets.planFig.ldTop')}</th><th>{t('rcSheets.planFig.ldh')}</th><th>{t('rcSheets.elev.lap')}</th></tr></thead>
      <tbody>{#each plan.anchorage as a (a.dia)}<tr><td>{a.dia}</td><td>{cm(a.ld)}</td><td>{cm(a.ldTop)}</td><td>{cm(a.ldh)}</td><td>{cm(a.lap)}</td></tr>{/each}</tbody>
    </table>
  </details>
</figure>

<style>
  .rsp { margin: 0; display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .rsp-toggles { display: flex; gap: 12px; font-size: 0.7rem; color: var(--st-text-2); }
  .tg { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .tg.off { opacity: 0.5; cursor: default; }
  svg { background: var(--st-surface); border-radius: 4px; }
  .panel { fill: var(--st-surface-3, rgba(128, 128, 128, 0.1)); stroke: var(--st-text-3); stroke-width: 0.8; }
  .panel.st-fail { stroke: var(--st-danger); }
  .pname { font-size: 9px; fill: var(--st-text-3); text-anchor: middle; }
  .support { stroke: var(--st-text-3); opacity: 0.55; stroke-linecap: butt; }
  .support.wall { opacity: 0.8; }
  .column { fill: var(--st-text-2); }
  .rod { fill: none; stroke: var(--c); stroke-width: 1.8; stroke-linejoin: round; }
  .band { stroke: var(--c); stroke-width: 0.8; stroke-dasharray: 4 3; }
  .tip { fill: var(--c); }
  .leg { font-size: 8px; fill: var(--c); text-anchor: middle; font-family: var(--st-mono); }
  .lbl { font-size: 9px; fill: var(--c); text-anchor: middle; font-family: var(--st-mono); font-weight: 600; }
  .bottom-x { --c: #2a9d8f; }
  .bottom-y { --c: #3d6fd6; }
  .top-x { --c: #d08a1e; }
  .top-y { --c: #c64a6a; }
  .k-bent .rod { stroke-width: 2.2; }
  .note { margin: 0; font-size: 0.68rem; color: var(--st-text-3); max-width: 110ch; }
  .note.bad { color: var(--st-danger); }
  .note.warn { color: var(--st-warn); }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); }
  .sched { border-collapse: collapse; font-size: 0.7rem; margin: 4px 0; }
  .sched th, .sched td { padding: 2px 6px; border-bottom: 1px solid var(--st-hair); text-align: left; white-space: nowrap; }
</style>
