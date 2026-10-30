<script lang="ts">
  import SiteHeader from './SiteHeader.svelte';
  let { kind }: { kind: string } = $props();
</script>

<div class="landing blog" aria-busy="true">
  <SiteHeader />
  <main class="sec sec--ink"><div class="wrap" style="padding-top: 7rem"><h1>Stabileo {kind === 'tools' ? 'Tools' : kind === 'blog' ? 'Blog' : kind === 'paper' ? 'Paper' : 'Research'}</h1></div></main>
</div>
