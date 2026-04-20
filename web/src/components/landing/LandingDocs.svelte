<script lang="ts">
  import { t } from '../../lib/i18n';
  import { QUICK_START_URL, AI_WORKFLOW_URL, SOLVER_REF_URL } from './landing-utils';
</script>

<section class="docs-section reveal" id="docs">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.docsTag')}</span>
      <h2>{t('landing.docsTitle')}</h2>
      <p class="section-sub">{t('landing.docsSub')}</p>
    </div>

    <div class="docs-grid">
      <a class="docs-card" data-tone="amber" href={QUICK_START_URL} target="_blank" rel="noreferrer">
        <span class="docs-kicker">{t('landing.docsQuickKicker')}</span>
        <h3>{t('landing.docsQuickTitle')}</h3>
        <p>{t('landing.docsQuickDesc')}</p>
        <ul>
          <li>{t('landing.docsQuick1')}</li>
          <li>{t('landing.docsQuick2')}</li>
        </ul>
        <span class="docs-open">{t('landing.docsOpen')}</span>
      </a>

      <a class="docs-card" data-tone="plum" href={AI_WORKFLOW_URL} target="_blank" rel="noreferrer">
        <span class="docs-kicker">{t('landing.docsAiKicker')}</span>
        <h3>{t('landing.docsAiTitle')}</h3>
        <p>{t('landing.docsAiDesc')}</p>
        <ul>
          <li>{t('landing.docsAi1')}</li>
          <li>{t('landing.docsAi2')}</li>
        </ul>
        <span class="docs-open">{t('landing.docsOpen')}</span>
      </a>

      <a class="docs-card" data-tone="ink" href={SOLVER_REF_URL} target="_blank" rel="noreferrer">
        <span class="docs-kicker">{t('landing.docsRefKicker')}</span>
        <h3>{t('landing.docsRefTitle')}</h3>
        <p>{t('landing.docsRefDesc')}</p>
        <ul>
          <li>{t('landing.docsRef1')}</li>
          <li>{t('landing.docsRef2')}</li>
        </ul>
        <span class="docs-open">{t('landing.docsOpen')}</span>
      </a>
    </div>
  </div>
</section>
