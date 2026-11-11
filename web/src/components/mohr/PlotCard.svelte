<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tm } from './i18n';
  import { downloadSvg, downloadPng } from './export';

  let { title, file, tools, children, testid }: { title: string; file: string; tools?: Snippet; children: Snippet; testid?: string } = $props();
  let body = $state<HTMLDivElement>();

  function plot() { return body?.querySelector('svg.mh-plot') as SVGSVGElement | null; }
</script>

<section class="mh-card" data-testid={testid}>
  <header class="mh-card-head">
    <h3>{title}</h3>
    <div class="mh-card-tools">
      {#if tools}{@render tools()}{/if}
      <button type="button" class="mh-btn mh-btn-sm" aria-label={tm('mohr.download', { what: title, format: 'SVG' })} title={tm('mohr.download', { what: title, format: 'SVG' })}
        onclick={() => { const s = plot(); if (s) downloadSvg(s, file); }}>↓ SVG</button>
      <button type="button" class="mh-btn mh-btn-sm" aria-label={tm('mohr.download', { what: title, format: 'PNG' })} title={tm('mohr.download', { what: title, format: 'PNG' })}
        onclick={() => { const s = plot(); if (s) void downloadPng(s, file); }}>↓ PNG</button>
    </div>
  </header>
  <div class="mh-card-body" bind:this={body}>{@render children()}</div>
</section>
