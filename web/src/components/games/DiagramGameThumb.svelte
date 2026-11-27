<script lang="ts">
  const CARD_WIDTH = 100;
  const CARD_GAP = 8;
  const OPTIONS = ['M8 4q42 52 84 0', 'M8 4l42 40 42-40', 'M8 30h84'];
</script>

<svg class="thumb" viewBox="0 0 348 180" aria-hidden="true">
  <g class="loads">
    {#each [70, 110, 150, 190, 230, 270] as x (x)}<path d={`M${x} 18v18m-4-6 4 6 4-6`} />{/each}
    <path d="M60 18h220" />
  </g>
  <path class="beam" d="M60 46h220" />
  <path class="support" d="M60 46l-9 14h18zM280 46l-9 14h18zM48 66h24M268 66h24" />
  {#each OPTIONS as d, i (d)}
    <g transform={`translate(${16 + i * (CARD_WIDTH + CARD_GAP)} 96)`} class:right={i === 0}>
      <rect class="option" width={CARD_WIDTH} height="64" rx="6" />
      <g transform="translate(0 12)"><path class="axis" d="M8 4h84" /><path class="diagram" {d} /></g>
    </g>
  {/each}
</svg>

<style>
  .thumb { display: block; width: 100%; height: auto; max-height: 15rem; padding: 1.25rem; box-sizing: border-box; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .loads path { stroke: var(--st-interactive); stroke-width: 2; }
  .beam { stroke: var(--fg); stroke-width: 4; }
  .support { stroke: var(--fg-2); stroke-width: 2; }
  .option { stroke: var(--card-hair); stroke-width: 1.5; fill: var(--card); }
  .right .option { stroke: var(--st-ok); stroke-width: 3; }
  .axis { stroke: var(--fg-2); stroke-width: 1.5; }
  .diagram { stroke: var(--st-accent); stroke-width: 2.5; fill: color-mix(in srgb, var(--st-accent) 18%, transparent); }
</style>
