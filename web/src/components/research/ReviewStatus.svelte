<script lang="ts">
  import { rs } from './i18n';
  import { reviewStatus, type ReviewPaper } from './reviews';
  let { paper, href }: { paper: ReviewPaper; href?: string } = $props();
  const label = $derived(reviewStatus(paper, rs()));
</script>

<p class="rs-review-status">
  {#if href}<a {href}>{label}</a>{:else}{label}{/if}
</p>

<style>
  .rs-review-status {
    max-width: 100%;
    width: fit-content;
    box-sizing: border-box;
    white-space: normal;
    overflow-wrap: anywhere;
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.25rem 0.5rem;
    font: 0.85rem/1.5 var(--st-sans);
    color: var(--fg-2);
  }
  a { color: inherit; text-underline-offset: 2px; }
</style>
