<script lang="ts">
  import { t } from '../../lib/i18n';
  import { REPO_URL, enterApp } from './landing-utils';

  const releaseCards = [
    { date: 'Feb 2026', key: 'landing.cl202602', tone: 'amber' },
    { date: 'Jan 2026', key: 'landing.cl202601', tone: 'plum' },
    { date: 'Dec 2025', key: 'landing.cl202512', tone: 'ink' },
  ] as const;
</script>

<section class="changelog-section reveal">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag">{t('landing.changelog')}</span>
      <h2>{t('landing.changelog')}</h2>
      <p class="section-sub">{t('landing.changelogDesc')}</p>
    </div>

    <div class="cl-grid">
      <article class="cl-featured">
        <span class="cl-date">Mar 2026</span>
        <h3>{t('landing.buildFeatureTitle')}</h3>
        <p>{t('landing.cl202603')}</p>
        <div class="cl-actions">
          <button class="btn-primary" onclick={() => enterApp()}>{t('landing.launchEditor')}</button>
          <a class="btn-link" href={REPO_URL} target="_blank" rel="noreferrer">{t('landing.viewOnGithub')}</a>
        </div>
      </article>

      <div class="cl-stack">
        {#each releaseCards as item}
          <article class="cl-card" data-tone={item.tone}>
            <span class="cl-date">{item.date}</span>
            <p>{t(item.key)}</p>
          </article>
        {/each}
      </div>
    </div>
  </div>
</section>
