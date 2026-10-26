<script lang="ts">
  /**
   * A joint drawn from its parts, seen along the first plate's normal: each part's extent projected
   * on the plate's two axes, plates and stiffeners as outlines, fillets filled, bolts and anchors
   * as circles.
   */
  import { t } from '../../../lib/i18n';
  import type { Part, V3 } from '../../../lib/connection/typology/types';

  let { parts }: { parts: readonly Part[] } = $props();
  const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const ref = $derived(parts.find((p) => p.kind === 'plate') ?? parts[0]!);
  const X = $derived(ref.u), Y = $derived(ref.v);
  const proj = $derived(parts.map((p) => {
    const w = cross(p.u, p.v);
    const half = (A: V3) => (Math.abs(dot(p.u, A)) * p.size[0] + Math.abs(dot(p.v, A)) * p.size[1] + Math.abs(dot(w, A)) * p.size[2]) / 2;
    return { kind: p.kind, x: dot(p.center, X), y: dot(p.center, Y), hx: half(X), hy: half(Y) };
  }));
  const box = $derived.by(() => {
    const xs = proj.flatMap((p) => [p.x - p.hx, p.x + p.hx]), ys = proj.flatMap((p) => [p.y - p.hy, p.y + p.hy]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const W = 280, PAD = 12;
  const sc = $derived(Math.min((W - 2 * PAD) / Math.max(box.x1 - box.x0, 1e-3), (W - 2 * PAD) / Math.max(box.y1 - box.y0, 1e-3)));
  const H = $derived((box.y1 - box.y0) * sc + 2 * PAD);
  const sx = (x: number) => PAD + (x - box.x0) * sc, sy = (y: number) => PAD + (box.y1 - y) * sc;
</script>

<svg viewBox="0 0 {W} {H}" class="jdw" role="img" aria-label={t('joint.typ.drawing')} data-testid="joint-typ-drawing">
  {#each proj as p, i (i)}
    {#if p.kind === 'bolt' || p.kind === 'anchor'}
      <circle cx={sx(p.x)} cy={sy(p.y)} r={Math.max(1.5, Math.min(p.hx, p.hy) * sc)} class="b" />
    {:else}
      <rect x={sx(p.x - p.hx)} y={sy(p.y + p.hy)} width={Math.max(0.6, 2 * p.hx * sc)} height={Math.max(0.6, 2 * p.hy * sc)} class={p.kind} />
    {/if}
  {/each}
</svg>

<style>
  .jdw { width: 100%; max-width: 280px; display: block; margin-top: 6px; }
  .plate, .stiffener { fill: var(--st-surface-2); stroke: var(--st-text-2); stroke-width: 1; }
  .stiffener { stroke-dasharray: 3 2; }
  .weld { fill: var(--st-warn); stroke: none; opacity: 0.8; }
  .b { fill: var(--st-text); }
</style>
