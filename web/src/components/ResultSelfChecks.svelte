<script lang="ts">
  import { uiStore, resultsStore, modelStore } from '../lib/store';
  import SelfCheckBanner from './advanced/SelfCheckBanner.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);
  const cases = $derived([...(is3D ? resultsStore.perCase3D : resultsStore.perCase)]);
  const checkResults = $derived([...cases.map(([, result]) => result), is3D ? resultsStore.results3D : resultsStore.results,
    resultsStore.diagramType === 'modeShape' ? (is3D ? resultsStore.modalResult3D : resultsStore.modalResult) : null]);
  const caseLabels = $derived(cases.map(([id]) => modelStore.loadCases.find((c) => c.id === id)?.name ?? `#${id}`));
</script>

<SelfCheckBanner results={checkResults} labels={caseLabels} />
