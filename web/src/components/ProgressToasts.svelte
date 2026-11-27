<script lang="ts">
  import type { Snippet } from 'svelte';
  import MeshProgressCard from './pro/plates/MeshProgressCard.svelte';
  import SolveProgressCard from './SolveProgressCard.svelte';
  import ExampleProgressCard from './pro/ExampleProgressCard.svelte';
  import { exampleProgress } from '../lib/store/example-progress.svelte';
  import { solveProgress } from '../lib/store/solve-progress.svelte';
  import RcSheetsProgressCard from './pro/rc-sheets/RcSheetsProgressCard.svelte';
  import { sheetsProgress } from '../lib/store/rc-sheets-progress.svelte';
  import { meshProgress } from '../lib/store/mesh-progress.svelte';

  let { hasToasts, container }: { hasToasts: boolean; container: Snippet<[Snippet?]> } = $props();
</script>

{#snippet cards()}
  {#if __PUBLIC_FEATURES__.proPlatesUnified}
    <ExampleProgressCard />
    <SolveProgressCard />
    {#if solveProgress.now?.phase !== 'mesh'}<MeshProgressCard />{/if}
  {/if}
  {#if __PUBLIC_FEATURES__.proRcSheets}<RcSheetsProgressCard />{/if}
{/snippet}
{#if hasToasts || (__PUBLIC_FEATURES__.proRcSheets && sheetsProgress.now) || (__PUBLIC_FEATURES__.proPlatesUnified && (meshProgress.now || solveProgress.now || exampleProgress.now))}
  {@render container(cards)}
{/if}
