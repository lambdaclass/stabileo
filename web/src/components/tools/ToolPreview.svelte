<script lang="ts">
  import type { ToolId } from './calculators';
  import type { BatchId } from './batch';
  let { id }: { id: ToolId | BatchId } = $props();
</script>

<svg viewBox="0 0 600 300" fill="none" aria-hidden="true">
  {#if id === 'portal-frame'}
    <path d="M100 250V80H500V250 M75 250H125 M475 250H525" stroke="var(--fg-2)" stroke-width="3"/><path d="M100 250Q100 160 145 80H545Q500 160 500 250 M20 80H85L70 70 M85 80L70 90" stroke="var(--lp-accent)" stroke-width="3"/>
  {:else if id === 'truss-2d'}
    <path d="M60 220H540L420 80H180L60 220 M180 80V220 M300 80V220 M420 80V220 M180 80L300 220L420 80" stroke="var(--lp-accent)" stroke-width="3"/>
  {:else}
  <path d="M70 160H530" stroke="var(--fg-2)" stroke-width="3" />
  {#if id !== 'cantilever-beam'}
    <path d="M70 160L55 185H85Z M530 160L515 185H545Z M510 193H550 M50 193H90" stroke="var(--fg-2)" stroke-width="2" />
  {:else}
    <path d="M70 125V195 M50 140L70 125 M50 155L70 140 M50 170L70 155 M50 185L70 170 M50 200L70 185" stroke="var(--fg-2)" stroke-width="2" />
  {/if}
  {#if id === 'continuous-beam'}<path d="M300 160L285 185H315Z" stroke="var(--fg-2)" stroke-width="2"/>{/if}
  {#if id === 'column-buckling' || id === 'beam-natural-frequency'}
    <path d="M70 160Q300 20 530 160" stroke="var(--lp-accent)" stroke-width="3" />
    {#if id === 'column-buckling'}<path d="M575 160H540L550 150 M540 160L550 170" stroke="var(--lp-accent)" stroke-width="3" />{/if}
  {:else}
    {#each [110, 170, 230, 290, 350, 410, 470, 525] as x}
      <path d={`M${x} 75V145 m-6 -8 l6 8 l6 -8`} stroke="var(--fg-2)" stroke-width="2" />
    {/each}
    <path d={id === 'cantilever-beam' ? 'M70 160C230 160 390 220 530 245' : id === 'continuous-beam' ? 'M70 160C160 240 230 175 300 160C370 175 440 240 530 160' : id === 'influence-line' ? 'M70 160L300 250L530 160' : 'M70 160Q300 280 530 160'} stroke="var(--lp-accent)" stroke-width="3" />
  {/if}
  {/if}
</svg>
<style>svg { display: block; width: 100%; }</style>
