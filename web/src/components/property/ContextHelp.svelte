<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const CONTEXTUAL_HELP = $derived.by(() => ({
    'no-model': {
      title: t('ctxHelp.firstSteps'),
      steps: [t('ctxHelp.step.createNodes'), t('ctxHelp.step.connectBars'), t('ctxHelp.step.addSupports'), t('ctxHelp.step.applyLoads'), t('ctxHelp.step.pressCalculate'), t('ctxHelp.step.exploreDiagrams')],
      tip: t('ctxHelp.tip.loadExample'),
    },
    'node': {
      title: t('ctxHelp.createNodes'),
      steps: [t('ctxHelp.createNodes.step1'), t('ctxHelp.createNodes.step2'), t('ctxHelp.createNodes.step3')],
      tip: t('ctxHelp.createNodes.tip'),
    },
    'element': {
      title: t('ctxHelp.createElements'),
      steps: [t('ctxHelp.createElements.step1'), t('ctxHelp.createElements.step2'), t('ctxHelp.createElements.step3')],
      tip: t('ctxHelp.createElements.tip'),
    },
    'support': {
      title: t('ctxHelp.createSupports'),
      steps: [t('ctxHelp.createSupports.step1'), t('ctxHelp.createSupports.step2')],
      tip: t('ctxHelp.createSupports.tip'),
    },
    'load': {
      title: t('ctxHelp.applyLoads'),
      steps: [t('ctxHelp.applyLoads.step1'), t('ctxHelp.applyLoads.step2'), t('ctxHelp.applyLoads.step3')],
      tip: t('ctxHelp.applyLoads.tip'),
    },
    'select': {
      title: t('ctxHelp.selectTool'),
      steps: [t('ctxHelp.selectTool.step1'), t('ctxHelp.selectTool.step2'), t('ctxHelp.selectTool.step3')],
      tip: t('ctxHelp.selectTool.tip'),
    },
    'influenceLine': {
      title: t('ctxHelp.influenceLine'),
      steps: [t('ctxHelp.influenceLine.step1'), t('ctxHelp.influenceLine.step2'), t('ctxHelp.influenceLine.step3')],
      tip: t('ctxHelp.influenceLine.tip'),
    },
    'pan': {
      title: t('ctxHelp.panView'),
      steps: [t('ctxHelp.panView.step1'), t('ctxHelp.panView.step2'), t('ctxHelp.panView.step3')],
      tip: t('ctxHelp.panView.tip'),
    },
    'results': {
      title: t('ctxHelp.results'),
      steps: [t('ctxHelp.results.step1'), t('ctxHelp.results.step2'), t('ctxHelp.results.step3'), t('ctxHelp.results.step4')],
      tip: t('ctxHelp.results.tip'),
    },
  }));

  const helpContext = $derived.by(() => {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    if (n === 0 && e === 0) return CONTEXTUAL_HELP['no-model'];
    if (resultsStore.results && uiStore.currentTool === 'select') return CONTEXTUAL_HELP['results'];
    return CONTEXTUAL_HELP[uiStore.currentTool] ?? CONTEXTUAL_HELP['select'];
  });
</script>

{#if uiStore.showHelpPanel && helpContext}
  <div class="help-panel">
    <h3 class="help-title">{helpContext.title}</h3>
    <ul class="help-steps">
      {#each helpContext.steps as step}
        <li>{step}</li>
      {/each}
    </ul>
    <p class="help-tip">{helpContext.tip}</p>
  </div>
{/if}

<style>
  .help-panel {
    background: #1a2a3e;
    border: 1px solid #2a4a6e;
    border-radius: 6px;
    padding: 0.75rem;
    margin-top: 0.5rem;
  }

  .help-title {
    font-size: 0.8rem;
    color: #4ecdc4;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 0.5rem;
  }

  .help-steps {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .help-steps li {
    font-size: 0.75rem;
    color: #bbb;
    padding-left: 0.5rem;
    border-left: 2px solid #2a4a6e;
  }

  .help-tip {
    font-size: 0.72rem;
    color: #f0a500;
    font-style: italic;
    margin: 0;
    padding-top: 0.25rem;
    border-top: 1px solid #2a4a6e;
  }
</style>
