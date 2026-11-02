<script lang="ts">
  import type { Component } from 'svelte';

  let { path }: { path: string } = $props();
  const kind = $derived(path === '/tools' || path.startsWith('/tools/') ? 'tools' : 'research');
  let pages = $state<Partial<Record<'research' | 'tools', Component<{ path: string }>>>>({});
  $effect(() => {
    const selected = kind;
    if (pages[selected]) return;
    const loading = selected === 'tools'
      ? import('../tools/load-page').then(m => m.loadToolsPage())
      : import('./load-page').then(m => m.loadResearchPage());
    void loading.then(page => { pages[selected] = page; });
  });
  const Page = $derived(pages[kind]);
</script>

{#if Page}<Page {path} />{/if}
