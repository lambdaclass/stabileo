<script lang="ts">
  /** One run of the paper's text: prose, italics, bold, KaTeX math and citations linked to the references. */
  import katex from 'katex';
  import { segments } from '../../lib/paper/inline';

  let { t }: { t: string } = $props();
  const parts = $derived(segments(t));
  // KaTeX's own markup from the paper's own TeX: nothing a reader typed reaches it.
  const tie = (t: string) => t.replace(/\b(Table|Figure) (\d)/g, '$1\u00a0$2');
  const math = (tex: string) => katex.renderToString(tex, { throwOnError: false, output: 'htmlAndMathml' });
</script>

{#each parts as p, i (i)}{#if p.k === 'text'}{tie(p.t)}{:else if p.k === 'i'}<em>{p.t}</em>{:else if p.k === 'b'}<strong>{p.t}</strong>{:else if p.k === 'math'}{@html math(p.tex)}{:else}&nbsp;<span class="pp-cite">[{#each p.n as n, j (n)}{#if j > 0}{', '}{/if}<a href="#ref-{n}">{n}</a>{/each}]</span>{/if}{/each}
