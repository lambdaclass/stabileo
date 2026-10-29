<script lang="ts">
  /**
   * What an experiment has been checked against, in words: the authors' code and the paper's own
   * figures are separate questions, and a "no" is stated as a fact with its reason, not a badge.
   */
  import { rs } from '../i18n';
  import type { Check } from './context';
  let { reference, published }: { reference: Check; published: Check } = $props();
  const s = $derived(rs());
</script>

<dl class="rs-verify">
  {#each [[s.againstCode, reference], [s.againstPaper, published]] as [label, c] (label)}
    {@const check = c as Check}
    <div>
      <dt>{label}</dt>
      <dd>
        {#if check.kind === 'checks'}
          <span class="ok" aria-hidden="true">✓</span>
          {check.passed} {s.of} {check.total} {s.checksPass}{#if check.href} · <a href={check.href}>{s.seeChecks}</a>{/if}
        {:else}
          <span class="no" aria-hidden="true">–</span> {check.why}
        {/if}
      </dd>
    </div>
  {/each}
</dl>
<p class="rs-disclaimer">{s.disclaimer}</p>

<style>
  .rs-verify {
    margin: var(--rs-space-5, 1.5rem) 0 var(--rs-space-3, 0.75rem);
    font: var(--rs-small) / 1.45 var(--st-sans);
    max-width: 52rem;
  }
  .rs-verify > div {
    display: grid;
    grid-template-columns: 13rem minmax(0, 1fr);
    gap: 0.25rem 1rem;
    padding: 0.2rem 0;
  }
  dt {
    color: var(--fg-2);
  }
  dd {
    margin: 0;
    color: var(--fg);
  }
  .ok {
    color: var(--st-ok);
  }
  .no {
    color: var(--fg-2);
  }
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .rs-disclaimer {
    border-left: 2px solid var(--st-amber);
    padding-left: 0.75rem;
    color: var(--fg);
    font-size: var(--rs-small);
    margin: 0 0 var(--rs-space-5, 1.5rem);
  }
  @media (max-width: 40rem) {
    .rs-verify > div {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
