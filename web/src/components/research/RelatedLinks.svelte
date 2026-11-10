<script lang="ts">
  import { publicI18n, tPublic } from '../../lib/i18n/store.svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import ResearchLink from './ResearchLink.svelte';
  import { RELATED_COPY, relatedPaths } from './related';
  import { LINK_NAMES } from './related-names';
  let { path }: { path: string } = $props();
  const route = $derived(path.replace(/\/+$/, ''));
  const copy = $derived(RELATED_COPY[publicI18n.locale]);
  const links = $derived(relatedPaths(route));
  const sections = $derived([...['/research', '/tools', '/blog'].map((to, i) => ({ to, label: copy[i + 1] })), { to: '/examples', label: tPublic('landing.navExamples') }].filter((s) => s.to !== route));
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
  .rs-related {
    --lp-gut: clamp(1rem, 3vw, 2.5rem);
    max-width: 96rem;
    padding-block: 2rem;
  }
  .rs-related p {
    margin: 0 0 0.75rem;
    color: var(--lp-slate-2);
    font-size: 0.82rem;
  }
  .rs-related ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav.rs-related :global(a:any-link) {
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    min-height: 44px;
    padding: 0.4rem 0.75rem;
    border: 1px solid rgba(143, 163, 179, 0.22);
    border-radius: var(--lp-radius);
    color: var(--lp-slate-2);
    font-size: 0.875rem;
    line-height: 1.3;
    text-decoration: none;
  }
  nav.rs-related :global(a:any-link:hover),
  nav.rs-related :global(a:any-link:focus-visible) {
    color: var(--lp-paper-2);
    border-color: rgba(143, 163, 179, 0.45);
  }
</style>
