<script lang="ts">
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { publicHref } from '../../lib/i18n/public-routes';
  import { RELATED_COPY, relatedPaths } from './related';
  import { LINK_NAMES } from './related-names';
  let { path }: { path: string } = $props();
  const copy = $derived(RELATED_COPY[publicI18n.locale]);
  const links = $derived(relatedPaths(path));
</script>
<nav class="wrap" aria-label={copy[0]} style="padding-block: 2rem">
  <p>{copy[0]}</p>
  <ul>
    {#each links as target}
      <li><a href={publicHref(target, publicI18n.locale)}>{LINK_NAMES[publicI18n.locale][target.split('/').at(-1)!]}</a></li>
    {/each}
    {#each ['/research', '/tools', '/blog'] as target, i}
      {#if path.replace(/\/$/, '') !== target}<li><a href={publicHref(target, publicI18n.locale)}>{copy[i + 1]}</a></li>{/if}
    {/each}
  </ul>
</nav>
