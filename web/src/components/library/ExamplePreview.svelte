<script lang="ts">
  import { examplePreviews } from '../../lib/examples/previews.svelte';
  import { PREVIEW_W, PREVIEW_H } from '../../lib/examples/preview-geometry';
  import { ROLE_COLOUR } from '../../lib/engine/generators/preview-projection';

  let { id }: { id: string } = $props();
  const p = $derived(examplePreviews.get(id));
  const supports = $derived.by(() => {
    const out: { x: number; y: number; fixed: boolean }[] = [];
    const flat = p?.p ?? [];
    for (let i = 0; i + 2 < flat.length; i += 3) out.push({ x: flat[i], y: flat[i + 1], fixed: flat[i + 2] === 1 });
    return out;
  });
  const nodes = $derived.by(() => {
    const out: [number, number][] = [];
    const flat = p?.n ?? [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
  });
  const R = 3.6;
  const dense = $derived(((p?.c ?? '') + (p?.b ?? '') + (p?.d ?? '')).split('M').length > 160);
  const tri = (x: number, y: number) => `${x},${y} ${x - R},${y + R * 1.5} ${x + R},${y + R * 1.5}`;
</script>

<svg class="xp" class:dense viewBox="0 0 {PREVIEW_W} {PREVIEW_H}" aria-hidden="true" focusable="false" data-preview={id}>
  {#if p}
    {#if p.s}<path class="xp-shell" d={p.s} />{/if}
    {#if p.d}<path class="xp-member xp-light" d={p.d} stroke={ROLE_COLOUR.diagonal} />{/if}
    {#if p.b}<path class="xp-member" d={p.b} stroke={ROLE_COLOUR.beam} />{/if}
    {#if p.c}<path class="xp-member" d={p.c} stroke={ROLE_COLOUR.column} />{/if}
    {#each nodes as [x, y], i (i)}<circle class="xp-node" cx={x} cy={y} r="1.6" />{/each}
    {#each supports as s, i (i)}<polygon class="xp-support" class:fixed={s.fixed} points={tri(s.x, s.y)} />{/each}
  {/if}
</svg>

<style>
  .xp {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 10;
    background: #071322;
  }
  .xp-member { fill: none; stroke-width: 1.7; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .xp-light { stroke-width: 1.1; }
  .dense .xp-member { stroke-width: 1; }
  .dense .xp-light { stroke-width: 0.7; }
  .xp-shell { fill: rgba(120, 160, 200, 0.1); stroke: rgba(120, 160, 200, 0.26); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
  .xp-node { fill: #dde7f2; }
  .xp-support { fill: #8fa0b4; }
  .xp-support.fixed { fill: #cdd8e4; stroke: #46586c; stroke-width: 0.5; }
</style>
