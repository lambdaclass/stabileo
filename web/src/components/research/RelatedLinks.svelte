<script lang="ts">
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ResearchLink from './ResearchLink.svelte';
  import { RELATED_COPY, relatedPaths } from './related';
  import { LINK_NAMES } from './related-names';
  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, ''));
  const copy = $derived(RELATED_COPY[publicI18n.locale]);
  const links = $derived(relatedPaths(route));
  const sections = $derived(['/research', '/tools', '/blog'].map((to, i) => ({ to, label: copy[i + 1] })).filter((s) => s.to !== route));
</script>

<nav class="wrap rs-related" aria-label={copy[0]}>
  <p>{copy[0]}</p>
  <ul>
    {#each links as target (target)}
      <li>
        {#if target.startsWith('/research')}<ResearchLink to={target}>{LINK_NAMES[publicI18n.locale][target.split('/').at(-1)!]}</ResearchLink>
        {:else}<PublicLink to={target}>{LINK_NAMES[publicI18n.locale][target.split('/').at(-1)!]}</PublicLink>{/if}
      </li>
    {/each}
    {#each sections as s (s.to)}
      <li>{#if s.to === '/research'}<ResearchLink to={s.to}>{s.label}</ResearchLink>{:else}<PublicLink to={s.to}>{s.label}</PublicLink>{/if}</li>
    {/each}
  </ul>
</nav>

<style>
  .rs-related { padding-block: 2rem; }
</style>
