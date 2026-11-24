<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, tools, children, testid, hero = false }: { title: string; tools?: Snippet; children: Snippet; testid?: string; hero?: boolean } = $props();
</script>

<section class="mh-fig" class:mh-fig-hero={hero} data-testid={testid}>
  <header class="mh-fig-head">
    <h3>{title}</h3>
    {#if tools}<div class="mh-fig-tools">{@render tools()}</div>{/if}
  </header>
  <div class="mh-fig-body">{@render children()}</div>
</section>
