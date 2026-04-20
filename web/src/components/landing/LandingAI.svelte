<script lang="ts">
  import { t } from '../../lib/i18n';
</script>

<section class="ai-section reveal" id="ai">
  <div class="section-inner">
    <div class="section-head">
      <span class="tag tag-ai">{t('landing.aiTag')}</span>
      <h2>{t('landing.aiTitle')}</h2>
      <p class="section-sub">{t('landing.aiSub')}</p>
    </div>

    <div class="ai-pipeline">
      <div class="ai-pipeline-label">{t('landing.aiHow')}</div>
      <div class="ai-steps">
        <div class="ai-step">
          <div class="ai-step-num">1</div>
          <div class="ai-step-body">
            <strong>{t('landing.aiStep1title')}</strong>
            <p>{t('landing.aiStep1')}</p>
          </div>
        </div>
        <div class="ai-step-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </div>
        <div class="ai-step">
          <div class="ai-step-num">2</div>
          <div class="ai-step-body">
            <strong>{t('landing.aiStep2title')}</strong>
            <p>{t('landing.aiStep2')}</p>
          </div>
        </div>
        <div class="ai-step-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </div>
        <div class="ai-step">
          <div class="ai-step-num">3</div>
          <div class="ai-step-body">
            <strong>{t('landing.aiStep3title')}</strong>
            <p>{t('landing.aiStep3')}</p>
          </div>
        </div>
        <div class="ai-step-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </div>
        <div class="ai-step">
          <div class="ai-step-num">4</div>
          <div class="ai-step-body">
            <strong>{t('landing.aiStep4title')}</strong>
            <p>{t('landing.aiStep4')}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="ai-why">
      <h3>{t('landing.aiWhy')}</h3>
      <div class="ai-points">
        <div class="ai-point">
          <div class="ai-point-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <path d="M16 18l2-2-2-2"/><path d="M8 6L6 8l2 2"/><path d="M14.5 4l-5 16"/>
            </svg>
          </div>
          <p>{t('landing.aiPoint1')}</p>
        </div>
        <div class="ai-point">
          <div class="ai-point-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <p>{t('landing.aiPoint2')}</p>
        </div>
        <div class="ai-point">
          <div class="ai-point-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-9"/>
            </svg>
          </div>
          <p>{t('landing.aiPoint3')}</p>
        </div>
        <div class="ai-point">
          <div class="ai-point-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <p>{t('landing.aiPoint4')}</p>
        </div>
      </div>
    </div>
  </div>
</section>
