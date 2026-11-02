<script lang="ts">
  import type { Component } from 'svelte';

  let { path }: { path: string } = $props();
  const kind = $derived(path === '/tools' || path.startsWith('/tools/') ? 'tools' : path === '/examples' || path.startsWith('/examples/') ? 'examples' : 'research');
  let pages = $state<Partial<Record<'research' | 'tools' | 'examples', Component<{ path: string }>>>>({});
  $effect(() => {
    const selected = kind;
    if (pages[selected]) return;
    const loading = selected === 'tools'
      ? import('../tools/load-page').then(m => m.loadToolsPage())
      : selected === 'examples' ? import('../examples/load-page').then(m => m.loadExamplesPage())
      : import('./load-page').then(m => m.loadResearchPage());
    void loading.then(page => { pages[selected] = page; });
  });
  const Page = $derived(pages[kind]);
</script>

{#if Page}<Page {path} />{/if}
