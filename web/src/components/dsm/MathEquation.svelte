<script lang="ts">
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  let { equation = '', displayMode = false }: { equation: string; displayMode?: boolean } = $props();

  let html = $derived(katex.renderToString(equation, {
    displayMode,
    throwOnError: false,
    output: 'html',
  }));
</script>

<span class="math-eq" class:display={displayMode}>
  {@html html}
</span>

<style>
  .math-eq {
    color: var(--st-text);
  }
  .math-eq.display {
    display: block;
    text-align: center;
    margin: 0.5rem 0;
  }
  .math-eq :global(.katex) {
    font-size: 0.95em;
  }
  .math-eq.display :global(.katex) {
    font-size: 1.1em;
  }
</style>
