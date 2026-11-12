<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tm } from './i18n';
  import { downloadSvg, downloadPng } from './export';

  let { title, file, tools, children, testid, hero = false }: { title: string; file: string; tools?: Snippet; children: Snippet; testid?: string; hero?: boolean } = $props();
  let body = $state<HTMLDivElement>();

  function plot() { return body?.querySelector('svg.mh-plot') as SVGSVGElement | null; }
</script>

<section class="mh-fig" class:mh-fig-hero={hero} data-testid={testid}>
  <header class="mh-fig-head">
    <h3>{title}</h3>
    <div class="mh-fig-tools">
      {#if tools}{@render tools()}{/if}
      <span class="mh-export" role="group" aria-label={tm('mohr.download', { what: title, format: 'SVG / PNG' })}>
        <button type="button" class="mh-btn mh-btn-ghost" aria-label={tm('mohr.download', { what: title, format: 'SVG' })} title={tm('mohr.download', { what: title, format: 'SVG' })}
          onclick={() => { const s = plot(); if (s) downloadSvg(s, file); }}><span aria-hidden="true">↓</span> SVG</button>
        <button type="button" class="mh-btn mh-btn-ghost" aria-label={tm('mohr.download', { what: title, format: 'PNG' })} title={tm('mohr.download', { what: title, format: 'PNG' })}
          onclick={() => { const s = plot(); if (s) void downloadPng(s, file); }}><span aria-hidden="true">↓</span> PNG</button>
      </span>
    </div>
  </header>
  <div class="mh-fig-body" bind:this={body}>{@render children()}</div>
</section>
