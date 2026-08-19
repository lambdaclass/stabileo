<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  import { QUICK_START_URL, AI_WORKFLOW_URL, SOLVER_REF_URL } from './landing-utils';
  import Eyebrow from './Eyebrow.svelte';

  const cards = [
    { href: QUICK_START_URL, title: 'landing.docsC1T', body: 'landing.docsC1B' },
    { href: AI_WORKFLOW_URL, title: 'landing.docsC2T', body: 'landing.docsC2B' },
    { href: SOLVER_REF_URL, title: 'landing.docsC3T', body: 'landing.docsC3B' },
  ];
</script>

<section class="sec sec--ink docs reveal" data-section="docs" id="docs" aria-labelledby="docs-title">
  <div class="wrap">
    <Eyebrow n="12" label={t('landing.ebDocs')} />
    <h2 id="docs-title" class="display">{t('landing.docsH')}</h2>
    <p class="lead">{t('landing.docsP')}</p>

    <div class="card-row cols-3">
      {#each cards as c}
        <a class="card card-link" href={c.href} target="_blank" rel="noreferrer">
          <h3>{t(c.title)}</h3>
          <p>{t(c.body)}</p>
          <span class="link-arrow">{t('landing.docsOpenNew')}</span>
        </a>
      {/each}
    </div>
  </div>
</section>
