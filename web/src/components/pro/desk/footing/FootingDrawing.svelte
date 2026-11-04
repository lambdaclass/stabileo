<script lang="ts">
  /**
   * A footing drawn as it will be built: in plan, its outline, the columns or the wall it carries
   * and the bottom and top mats along its own axes; and in section along B, its thickness with the
   * bars at their depth.
   */
  import { t } from '../../../../lib/i18n';
  import type { GeneralFootingDesign, MatLayer } from '../../../../lib/engine/foundation/general-footing';
  import type { Footing } from '../../../../lib/model/footing';

  let { footing: f, design, sizes }: { footing: Footing; design: GeneralFootingDesign; sizes: Array<{ cx: number; cy: number }> } = $props();
  const W = 300, PAD = 14;
  const sc = $derived(Math.min((W - 2 * PAD) / f.B, (W - 2 * PAD) / f.L));
  const H = $derived(f.L * sc + 2 * PAD);
  const X = (x: number) => PAD + (x + f.B / 2) * sc;
  const Y = (y: number) => PAD + (f.L / 2 - y) * sc;
  const along = (l: MatLayer | null, dir: 'x' | 'y') => {
    if (!l) return [];
    const wid = dir === 'x' ? f.L : f.B, w0 = -wid / 2 + f.cover, step = (wid - 2 * f.cover) / Math.max(1, l.count - 1);
    return Array.from({ length: l.count }, (_, k) => w0 + k * step);
  };
  const tSc = $derived(Math.min(sc, 80 / f.thickness));
  const SH = $derived(f.thickness * tSc + 2 * PAD);
  const Z = (z: number) => PAD + (f.thickness - z) * tSc;
  const m = $derived(design.mats);
</script>

<div class="fd" data-testid="footing-drawing">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('fdnEd.plan')}>
    <rect x={X(-f.B / 2)} y={Y(f.L / 2)} width={f.B * sc} height={f.L * sc} class="fd-base" />
    {#each along(m.bottomX, 'x') as w}<line x1={X(-f.B / 2 + f.cover)} x2={X(f.B / 2 - f.cover)} y1={Y(w)} y2={Y(w)} class="fd-bot" />{/each}
    {#each along(m.bottomY, 'y') as w}<line y1={Y(-f.L / 2 + f.cover)} y2={Y(f.L / 2 - f.cover)} x1={X(w)} x2={X(w)} class="fd-bot" />{/each}
    {#each along(m.topX, 'x') as w}<line x1={X(-f.B / 2 + f.cover)} x2={X(f.B / 2 - f.cover)} y1={Y(w)} y2={Y(w)} class="fd-top" />{/each}
    {#each along(m.topY, 'y') as w}<line y1={Y(-f.L / 2 + f.cover)} y2={Y(f.L / 2 - f.cover)} x1={X(w)} x2={X(w)} class="fd-top" />{/each}
    {#each design.posts as p, k}
      {@const s = sizes[k] ?? { cx: 0.3, cy: 0.3 }}
      <rect x={X(p.x - s.cx / 2)} y={Y(p.y + s.cy / 2)} width={s.cx * sc} height={s.cy * sc} class="fd-col" />
    {/each}
  </svg>
  <svg viewBox="0 0 {W} {SH}" role="img" aria-label={t('fdnEd.section')}>
    <rect x={X(-f.B / 2)} y={Z(f.thickness)} width={f.B * sc} height={f.thickness * tSc} class="fd-base" />
    {#if m.bottomX}{@const z = f.cover + m.bottomX.diameterMm / 2000}<line x1={X(-f.B / 2 + f.cover)} x2={X(f.B / 2 - f.cover)} y1={Z(z)} y2={Z(z)} class="fd-bot" />{/if}
    {#each along(m.bottomY, 'y') as w}<circle cx={X(w)} cy={Z(f.cover + (m.bottomX?.diameterMm ?? 16) / 1000 + m.bottomY.diameterMm / 2000)} r="1.6" class="fd-dot" />{/each}
    {#if m.topX}{@const z = f.thickness - f.cover - m.topX.diameterMm / 2000}<line x1={X(-f.B / 2 + f.cover)} x2={X(f.B / 2 - f.cover)} y1={Z(z)} y2={Z(z)} class="fd-top" />{/if}
    {#each along(m.topY, 'y') as w}<circle cx={X(w)} cy={Z(f.thickness - f.cover - (m.topX?.diameterMm ?? 0) / 1000 - (m.topY?.diameterMm ?? 16) / 2000)} r="1.6" class="fd-dot" />{/each}
    {#each design.posts as p, k}
      {@const s = sizes[k] ?? { cx: 0.3, cy: 0.3 }}
      <rect x={X(p.x - s.cx / 2)} y={PAD - 10} width={s.cx * sc} height="10" class="fd-col" />
    {/each}
  </svg>
</div>

<style>
  .fd { display: flex; flex-direction: column; gap: 4px; }
  .fd svg { width: 100%; max-width: 300px; display: block; }
  .fd-base { fill: var(--st-surface-2); stroke: var(--st-text-2); stroke-width: 1; }
  .fd-col { fill: var(--st-surface-3); stroke: var(--st-text); stroke-width: 1; }
  .fd-bot { stroke: var(--st-value); stroke-width: 0.8; }
  .fd-top { stroke: var(--st-warn); stroke-width: 0.8; stroke-dasharray: 3 2; }
  .fd-dot { fill: var(--st-value); }
</style>
