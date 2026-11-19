<script lang="ts">
  import { onMount } from 'svelte';
  import type { SolverInput } from '../../lib/engine/types';
  import { tBatch as t } from './batch-i18n';

  let { model, name, massPerLength }: { model: SolverInput | null; name: string; massPerLength?: number } = $props();
  let encode = $state<typeof import('./share').editorUrl>();

  onMount(() => {
    void import('./share').then(({ editorUrl }) => { encode = editorUrl; });
  });

  const href = $derived(model && encode?.(model, name, massPerLength === undefined ? undefined : { massPerLength }));
</script>

{#if href}
  <a class="btn btn-primary open-editor" {href}>{t('tools.open')} ↗</a>
{/if}
