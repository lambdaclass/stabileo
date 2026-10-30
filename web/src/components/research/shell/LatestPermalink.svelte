<script lang="ts">
  /**
   * An experiment's latest permanent link, for its gallery card: the newest snapshot (/@<commit>/)
   * holding the page, from the host's index. Renders nothing until one exists.
   */
  import { citeStrings } from './cite-i18n';
  import { onMount } from 'svelte';
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { permalinkUrl, pickSnapshot, snapshotIndex, type Permalink } from './permalink';

  let { path }: { path: string } = $props();
  let link = $state<Permalink | null>(null);
  onMount(() => {
    void snapshotIndex().then((entries) => (link = pickSnapshot(entries, path)));
  });
  const label = $derived(citeStrings(publicI18n.locale).permalink);
</script>

{#if link}
  <p class="rs-permalink">
    {label}:
    <a href={permalinkUrl(link.snapshot, path, publicI18n.locale)} data-testid="gallery-permalink"><code>@{link.snapshot.short}</code></a>
  </p>
{/if}

<style>
  .rs-permalink {
    font-size: 0.8rem;
    color: var(--fg-2, #8fa3b3);
    margin: 0.5rem 0 0;
  }
  .rs-permalink a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-permalink code {
    font-family: var(--lp-mono, ui-monospace, monospace);
  }
</style>
