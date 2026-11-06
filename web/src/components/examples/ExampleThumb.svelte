<script lang="ts">
  let { id }: { id: string } = $props();
</script>

<svg class="thumb" viewBox="0 0 240 140" aria-hidden="true" focusable="false">
  {#if id === 'beam-frame'}
    <path class="member" d="M40 40 V115 M40 40 H200 M200 40 V115" />
    <path class="ground" d="M28 115 H52 M188 115 H212" />
    <path class="diagram" d="M40 40 C70 92 170 92 200 40" />
    <path class="load" d="M60 14 V34 M100 14 V34 M140 14 V34 M180 14 V34 M52 14 H188" />
  {:else if id === 'slab-on-columns'}
    {#each [0, 1, 2, 3, 4, 5, 6, 7] as r}
      {#each [0, 1, 2, 3, 4, 5, 6, 7] as c}
        {@const d = Math.sin(Math.PI * (r + .5) / 4) ** 2 * Math.sin(Math.PI * (c + .5) / 4) ** 2}
        <rect x={56 + c * 16} y={6 + r * 16} width="15" height="15" style={`opacity:${.15 + .85 * d}`} class="cell" />
      {/each}
    {/each}
    {#each [0, 1, 2] as r}{#each [0, 1, 2] as c}<circle cx={56 + c * 64} cy={6 + r * 64} r="4" class="column" />{/each}{/each}
  {:else if id === 'rc-column'}
    <rect class="member" x="40" y="20" width="80" height="100" />
    <rect class="load" x="48" y="28" width="64" height="84" />
    {#each [56, 80, 104] as x}<circle class="column" cx={x} cy="36" r="5" /><circle class="column" cx={x} cy="104" r="5" />{/each}
    <path class="diagram" d="M140 128 C200 100 214 60 196 36 L170 14" />
  {:else if id === 'outrigger'}
    <path class="ground" d="M20 132 H220" />
    <path class="member" d="M120 132 V8 M64 132 V70 M176 132 V70" />
    <path class="load" d="M64 70 H176" />
    <path class="diagram" d="M120 132 C122 100 128 70 134 50 C138 32 140 20 141 8" />
  {:else if id === 'tower'}
    <path class="ground" d="M60 132 H180" />
    <path class="member" d="M120 132 V10" />
    <path class="diagram" d="M120 132 C120 90 140 40 156 10" />
    <path class="load" d="M120 132 C118 100 104 70 120 50 C134 30 112 18 104 10" />
  {:else}
    <path class="ground" d="M20 128 H220" />
    <path class="member" d="M80 128 V92 H160 V128 M80 92 V56 H160 V92 M80 56 V20 H160 V56" />
    <path class="diagram" d="M80 128 L88 92 L100 56 L116 20 H196 L180 56 L168 92 L160 128" />
  {/if}
</svg>

<style>
  .thumb { width: min(100%, 18rem); height: auto; }
  .member, .ground, .load { fill: none; stroke: var(--fg-2, #9aa); stroke-width: 3; stroke-linecap: round; }
  .load { stroke-width: 1.5; }
  .diagram { fill: none; stroke: var(--lp-accent, #e5482a); stroke-width: 3; }
  .cell { fill: var(--lp-accent, #e5482a); }
  .column { fill: var(--fg, #eee); }
</style>
