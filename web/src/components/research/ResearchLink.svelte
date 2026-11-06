<script lang="ts">
  import type { Snippet } from 'svelte';
  import PublicLink from '../landing/PublicLink.svelte';
  import { publicI18n } from '../../lib/i18n/store.svelte';
  import { publicHref } from '../../lib/i18n/public-routes';
  import { publishedLocale } from '../../lib/i18n/published';

  type Props = { to: string; class?: string; 'aria-label'?: string; children: Snippet };
  let { to, class: cls, children, ...rest }: Props = $props();
  const locale = $derived(publishedLocale(to, publicI18n.locale));
</script>

{#if locale === publicI18n.locale}
  <PublicLink {to} class={cls} {...rest}>{@render children()}</PublicLink>
{:else}
  <a href={publicHref(to, locale)} class={cls} {...rest}>{@render children()}</a>
{/if}
