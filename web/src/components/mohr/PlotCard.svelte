<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tm } from './i18n';
  import { downloadSvg, downloadPng } from './export';
  import MohrMenu from './MohrMenu.svelte';
  import MohrIcon from './MohrIcon.svelte';

  let { title, file, tools, children, foot, testid, hero = false }: { title: string; file: string; tools?: Snippet; children: Snippet; foot?: Snippet; testid?: string; hero?: boolean } = $props();
  let body = $state<HTMLDivElement>();
  let exportOpen = $state(false);

  function plot() { return body?.querySelector('svg.mh-plot') as SVGSVGElement | null; }
  function save(format: 'SVG' | 'PNG') {
    const s = plot();
    exportOpen = false;
    if (!s) return;
    if (format === 'SVG') downloadSvg(s, file);
    else void downloadPng(s, file);
  }
</script>

<section class="mh-fig" class:mh-fig-hero={hero} data-testid={testid}>
  <header class="mh-fig-head">
    <h3>{title}</h3>
    <div class="mh-fig-tools">
      {#if tools}{@render tools()}{/if}
      <MohrMenu label={tm('mohr.exportWhat', { what: title })} bind:open={exportOpen} testid={testid ? `${testid}-export` : undefined}>
        {#snippet summary()}<MohrIcon name="download" />{/snippet}
        <p class="mh-menu-title">{tm('mohr.export')}</p>
        {#each ['SVG', 'PNG'] as const as format (format)}
          <button type="button" class="mh-menu-item" aria-label={tm('mohr.download', { what: title, format })} onclick={() => save(format)}>{format}<span>{tm(format === 'SVG' ? 'mohr.svgNote' : 'mohr.pngNote')}</span></button>
        {/each}
      </MohrMenu>
    </div>
  </header>
  <div class="mh-fig-body" bind:this={body}>{@render children()}</div>
  {#if foot}{@render foot()}{/if}
</section>
