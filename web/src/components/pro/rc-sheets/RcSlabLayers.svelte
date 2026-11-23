<script lang="ts">
  /**
   * A slab panel's four layers of bars: a plan of each face with its X and Y bars, and a cut
   * along X; each layer drawn at its own spacing and switched on and off on its own. X bars are
   * the outer layer of each face, as the row's effective depths take them.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { SLAB_FACES, type SlabRow } from '../../../lib/rc-sheets/slab-row';
  import { meshLabel } from '../../../lib/rc-sheets/bars';

  let { row, cover }: { row: SlabRow; cover: number } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  let on = $state<Record<string, boolean>>({ bottomX: true, bottomY: true, topX: true, topY: true });

  const PW = 220, PH = 190, PAD = 24, MAXLINES = 24;
  const k = $derived(Math.min((PW - 2 * PAD) / Math.max(row.lx, 0.1), (PH - 2 * PAD) / Math.max(row.ly, 0.1)));
  const w = $derived(row.lx * k), h = $derived(row.ly * k);
  const present = (f: (typeof SLAB_FACES)[number]) => row.adopted[f].dia > 0 && row.adopted[f].spacing > 0;
  /** Positions of a layer's bars across the span they are spaced over, every `every`-th drawn when they are too many to see. */
  const positions = (span: number, s: number) => {
    const n = Math.max(1, Math.floor((span - 2 * 0.05) / s) + 1);
    const every = Math.ceil(n / MAXLINES);
    const used = (n - 1) * s, start = (span - used) / 2;
    return { at: Array.from({ length: Math.ceil(n / every) }, (_, i) => start + i * every * s), n, every };
  };
  const layers = $derived(SLAB_FACES.filter(present).map((f) => {
    const m = row.adopted[f];
    const alongX = f.endsWith('X');
    const p = positions(alongX ? row.ly : row.lx, m.spacing);
    return { f, alongX, top: f.startsWith('top'), ...p, label: meshLabel(m) };
  }));

  const SW = 300;
  const ks = $derived((SW - 2 * PAD - 44) / Math.max(row.lx, 0.1));
  const kh = $derived(Math.max(ks, 40 / row.h));
  const sx = (x: number) => PAD + x * ks;
  const syTop = PAD;
  const sy = (y: number) => syTop + (row.h - y) * kh;
  const depthOf = (f: (typeof SLAB_FACES)[number]) => {
    const outer = f.endsWith('X');
    const face = f.startsWith('top') ? 'top' : 'bottom';
    const od = row.adopted[face === 'top' ? 'topX' : 'bottomX'].dia / 1000;
    const own = row.adopted[f].dia / 1000;
    const fromFace = cover + (outer ? own / 2 : od + own / 2);
    return face === 'top' ? row.h - fromFace : fromFace;
  };
</script>

<figure class="rsl-fig" data-testid="rc-slab-layers">
  <figcaption>{tp('rcSheets.slabFig.title', { name: row.name })}</figcaption>
  <div class="rsl-toggles" role="group" aria-label={t('rcSheets.slabFig.layers')}>
    {#each SLAB_FACES as f (f)}
      <label class="rsl-tg rsl-{f}" class:off={!present(f)}>
        <input type="checkbox" bind:checked={on[f]} disabled={!present(f)} data-testid="rc-slab-layer-{f}" />
        <span class="sw"></span>{t(`rcSheets.face.${f}`)}<span class="v">{present(f) ? meshLabel(row.adopted[f]) : '—'}</span>
      </label>
    {/each}
  </div>
  <div class="rsl-plans" data-testid="rc-slab-plan">
    {#each ['bottom', 'top'] as face (face)}
      <svg viewBox="0 0 {PW} {PH}" width={PW} height={PH} role="img" aria-label={t(`rcSheets.slabFig.${face}Face`)} data-testid="rc-slab-plan-{face}">
        <text x={PAD} y={14} class="ttl">{t(`rcSheets.slabFig.${face}Face`)}</text>
        <rect x={PAD} y={PAD} width={w} height={h} class="conc" />
        {#each layers.filter((L) => (face === 'top') === L.top) as L (L.f)}
          {#if on[L.f]}
            <g class="layer layer-{L.f}" data-testid="rc-slab-plan-{L.f}" data-bars={L.n}>
              {#each L.at as p, i (i)}
                {#if L.alongX}
                  <line x1={PAD + 3} y1={PAD + h - p * k} x2={PAD + w - 3} y2={PAD + h - p * k} />
                {:else}
                  <line x1={PAD + p * k} y1={PAD + 3} x2={PAD + p * k} y2={PAD + h - 3} />
                {/if}
              {/each}
            </g>
          {/if}
        {/each}
        <text x={PAD + w / 2} y={PAD + h + 14} class="dim">Lx = {fmt(row.lx, 2)} m</text>
        <text x={PAD - 8} y={PAD + h / 2} class="dim" transform="rotate(-90 {PAD - 8} {PAD + h / 2})">Ly = {fmt(row.ly, 2)} m</text>
        {#if !layers.some((L) => (face === 'top') === L.top)}<text x={PAD + w / 2} y={PAD + h / 2} class="dim">{t('rcSheets.slabFig.none')}</text>{/if}
      </svg>
    {/each}
  </div>
  <svg viewBox="0 0 {SW} {row.h * kh + 2 * PAD}" width={SW} height={row.h * kh + 2 * PAD} role="img" aria-label={t('rcSheets.slabFig.cut')} data-testid="rc-slab-cut">
    <rect x={sx(0)} y={sy(row.h)} width={row.lx * ks} height={row.h * kh} class="conc" />
    {#each layers as L (L.f)}
      {#if on[L.f]}
        {@const y = sy(depthOf(L.f))}
        <g class="layer layer-{L.f}">
          {#if L.alongX}
            <line x1={sx(0.03)} y1={y} x2={sx(row.lx - 0.03)} y2={y} />
          {:else}
            {#each L.at as p, i (i)}<circle cx={sx(p)} cy={y} r={Math.max(1.6, (row.adopted[L.f].dia / 2000) * kh)} />{/each}
          {/if}
        </g>
      {/if}
    {/each}
    <text x={sx(row.lx) + 4} y={sy(row.h / 2) + 3} class="dim start">h = {fmt(row.h * 100, 0)}</text>
  </svg>
  {#if layers.some((L) => L.every > 1)}<div class="note">{t('rcSheets.slabFig.thinned')}</div>{/if}
</figure>

<style>
  .rsl-fig { margin: 0; display: inline-flex; flex-direction: column; gap: 4px; padding: 6px 8px; border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface-2); }
  figcaption { font-size: 0.7rem; font-weight: 600; color: var(--st-text-2); }
  .rsl-toggles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 10px; font-size: 0.68rem; color: var(--st-text-2); }
  .rsl-tg { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .rsl-tg.off { opacity: 0.5; cursor: default; }
  .rsl-tg .v { font-family: var(--st-mono); color: var(--st-text-3); margin-left: 2px; }
  .sw { width: 14px; height: 0; border-top: 2px solid var(--c); display: inline-block; }
  .conc { fill: var(--st-surface-3, rgba(128, 128, 128, 0.12)); stroke: var(--st-text-3); stroke-width: 1; }
  .layer line { stroke: var(--c); stroke-width: 1.1; opacity: 0.9; }
  .layer circle { fill: var(--c); }
  .rsl-bottomX, .layer-bottomX { --c: #4ecdc4; }
  .rsl-bottomY, .layer-bottomY { --c: #5b8def; }
  .rsl-topX, .layer-topX { --c: #e0a03c; }
  .rsl-topY, .layer-topY { --c: #d9607a; }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .dim.start { text-anchor: start; }
  .axes line { stroke: var(--st-text-3); }
  .axes text { font-size: 9px; fill: var(--st-text-3); }
  .note { font-size: 0.66rem; color: var(--st-text-3); }
  .rsl-plans { display: flex; flex-wrap: wrap; gap: 4px; }
  .ttl { font-size: 10px; fill: var(--st-text-2); font-weight: 600; }
</style>
