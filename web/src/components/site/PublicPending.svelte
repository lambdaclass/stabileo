<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';

  let { kind }: { kind: string } = $props();
  const KEYS: Record<string, string> = { tools: 'landing.navTools', blog: 'landing.navBlog', paper: 'landing.navPaper' };
</script>

<div class="landing blog" aria-busy="true">
  <main class="sec sec--ink"><div class="wrap" style="padding-top: 7rem"><h1>Stabileo {t(KEYS[kind] ?? 'landing.navResearch')}</h1></div></main>
</div>
