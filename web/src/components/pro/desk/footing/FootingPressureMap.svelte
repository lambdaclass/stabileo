<script lang="ts">
  /**
   * The soil under a footing: the service pressure in plan, darker where it is higher and blank
   * where the base has lifted, with the pressure read at any point the pointer rests on. A pile cap
   * shows its piles and each one's reaction instead.
   */
  import { t, tp } from '../../../../lib/i18n';
  import type { GeneralFootingDesign } from '../../../../lib/engine/foundation/general-footing';
  import { pileCentres } from '../../../../lib/model/foundation/piles';
  import type { Footing } from '../../../../lib/model/footing';

  let { footing: f, design }: { footing: Footing; design: GeneralFootingDesign } = $props();
  const W = 300, PAD = 14;
  const sc = $derived(Math.min((W - 2 * PAD) / f.B, (W - 2 * PAD) / f.L));
  const H = $derived(f.L * sc + 2 * PAD);
  const X = (x: number) => PAD + (x + f.B / 2) * sc;
  const Y = (y: number) => PAD + (f.L / 2 - y) * sc;
  const N = 24;
  const field = $derived('rigid' in design.result ? design.result.rigid.service : null);
  const cells = $derived.by(() => {
    if (!field) return [];
    const out: Array<{ x: number; y: number; q: number }> = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = -f.B / 2 + ((i + 0.5) * f.B) / N, y = -f.L / 2 + ((j + 0.5) * f.L) / N;
      out.push({ x, y, q: field.at(x, y) });
    }
    return out;
  });
  const piles = $derived('cap' in design.result && f.piles ? pileCentres(f.piles).map(([x, y], k) => ({ x, y, r: (design.result as { cap: { reactions: { service: number[] } } }).cap.reactions.service[k] ?? 0 })) : []);
  let probe = $state<{ x: number; y: number; q: number } | null>(null);
  function move(e: PointerEvent) {
    if (!field) return;
    const svg = e.currentTarget as SVGSVGElement, r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    const x = (px - PAD) / sc - f.B / 2, y = f.L / 2 - (py - PAD) / sc;
    probe = Math.abs(x) <= f.B / 2 && Math.abs(y) <= f.L / 2 ? { x, y, q: field.at(x, y) } : null;
  }
</script>

<div class="pm" data-testid="footing-pressure-map">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('fdnEd.pressureMap')} onpointermove={move} onpointerleave={() => (probe = null)}>
    <rect x={X(-f.B / 2)} y={Y(f.L / 2)} width={f.B * sc} height={f.L * sc} class="pm-base" />
    {#each cells as c}
      {#if c.q > 0}<rect x={X(c.x - f.B / N / 2)} y={Y(c.y + f.L / N / 2)} width={(f.B / N) * sc + 0.3} height={(f.L / N) * sc + 0.3} class="pm-cell" shape-rendering="crispEdges" fill-opacity={field ? 0.12 + 0.78 * (c.q / field.qMax) : 0} />{/if}
    {/each}
    {#each design.posts as p}<circle cx={X(p.x)} cy={Y(p.y)} r="3" class="pm-post" />{/each}
    {#each piles as p}
      <circle cx={X(p.x)} cy={Y(p.y)} r={((f.piles?.diameter ?? 0.4) / 2) * sc} class="pm-pile" />
      <text x={X(p.x)} y={Y(p.y) + 3} class="pm-t" text-anchor="middle">{p.r.toFixed(0)}</text>
    {/each}
  </svg>
  <p class="pm-read" role="status" data-testid="footing-pressure-probe">
    {#if field}
      {#if probe}{tp('fdnEd.pressureAt', { x: probe.x.toFixed(2), y: probe.y.toFixed(2), q: probe.q.toFixed(1) })}
      {:else}{tp('fdnEd.pressureSummary', { q: field.qMax.toFixed(1), c: (field.contact * 100).toFixed(0) })}{/if}
    {:else}{t('fdnEd.pileReactions')}{/if}
  </p>
</div>

<style>
  .pm svg { width: 100%; max-width: 300px; display: block; touch-action: none; }
  .pm-base { fill: none; stroke: var(--st-text-2); stroke-width: 1; }
  .pm-cell { fill: var(--st-value); }
  .pm-post { fill: var(--st-text); }
  .pm-pile { fill: none; stroke: var(--st-info); stroke-width: 1.2; }
  .pm-t { font-size: 8px; fill: var(--st-text); }
  .pm-read { margin: 3px 0 0; font-size: 0.68rem; color: var(--st-text-2); font-variant-numeric: tabular-nums; }
</style>
