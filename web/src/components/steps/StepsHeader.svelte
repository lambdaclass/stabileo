<script lang="ts">
  /**
   * Where a step-by-step view sits, said in the Advanced panel's header (`panel-trail`), the same
   * row a running function uses: the topic or catalog it was opened from, its own name, and
   * "← Back" to where it was opened from. The panel's own ✕ is the only close.
   */
  import { t } from '../../lib/i18n';
  import { dsmStepsStore, fmStepsStore } from '../../lib/store';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import { panelTrail, type Crumb } from '../../lib/advanced/panel-trail.svelte';
  import { proseParts } from '../../lib/engine/steps/format';

  let { name, fromCatalog, onBack, backTitle, backTestid, help }: {
    /** What is on screen: the method's title, or none for the catalog itself. */
    name?: string;
    /** Opened from the catalog, so the catalog (at its topic) is the level above. */
    fromCatalog: boolean;
    onBack: () => void;
    backTitle: string;
    backTestid: string;
    help?: string;
  } = $props();

  function leaveAll() {
    explainedSteps.close();
    dsmStepsStore.close();
    fmStepsStore.close();
  }

  const catalog = $derived<Crumb>({
    label: explainedSteps.catalogFocus ? t(`steps.group.${explainedSteps.catalogFocus}`) : t('steps.catalog.title'),
    go: () => { dsmStepsStore.close(); fmStepsStore.close(); explainedSteps.reopenCatalog(); },
  });

  const plain = (text: string) => proseParts(text).map((p) => p.text).join('');

  $effect(() => panelTrail.publish({
    crumbs: name === undefined ? [catalog] : fromCatalog ? [catalog, { label: plain(name) }] : [{ label: plain(name) }],
    back: { run: onBack, title: backTitle, testid: backTestid },
    home: leaveAll,
    help,
  }));
</script>
