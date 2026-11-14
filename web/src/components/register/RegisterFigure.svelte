<script lang="ts">
  import { tPublic as t } from '../../lib/i18n/store.svelte';
  // The moment diagram is the shape only; its values depend on the sections, which the editor computes.
</script>

<svg class="rg-figure" viewBox="0 0 760 420" role="img" aria-label={t('register.figureLabel')}>
  <g stroke="rgba(143,163,179,.13)" stroke-width="1">
    <path d="M0 60 H760 M0 120 H760 M0 180 H760 M0 240 H760 M0 300 H760 M0 360 H760" />
    <path d="M80 0 V420 M200 0 V420 M320 0 V420 M440 0 V420 M560 0 V420 M680 0 V420" />
  </g>
  <g stroke="#e5482a" stroke-width="1.6" fill="none">
    <path d="M200 70 H560" />
    <path d="M200 70 V108 M236 70 V108 M272 70 V108 M308 70 V108 M344 70 V108 M380 70 V108 M416 70 V108 M452 70 V108 M488 70 V108 M524 70 V108 M560 70 V108" />
  </g>
  <path fill="#e5482a" d="M196 102 L200 112 L204 102 Z M232 102 L236 112 L240 102 Z M268 102 L272 112 L276 102 Z M304 102 L308 112 L312 102 Z M340 102 L344 112 L348 102 Z M376 102 L380 112 L384 102 Z M412 102 L416 112 L420 102 Z M448 102 L452 112 L456 102 Z M484 102 L488 112 L492 102 Z M520 102 L524 112 L528 102 Z M556 102 L560 112 L564 102 Z" />
  <text x="380" y="58" fill="#f4f7fa" font-family="IBM Plex Mono, monospace" font-size="13" text-anchor="middle">q = 15 kN/m</text>
  <path d="M112 120 H188" stroke="#e5482a" stroke-width="2.4" />
  <path d="M182 114 L194 120 L182 126 Z" fill="#e5482a" />
  <text x="112" y="108" fill="#f4f7fa" font-family="IBM Plex Mono, monospace" font-size="13">H = 10 kN</text>
  <path d="M200 360 V120 H560 V360" stroke="#c7d3dd" stroke-width="5" fill="none" stroke-linejoin="round" />
  <path d="M180 362 H220 M184 370 L176 378 M196 370 L188 378 M208 370 L200 378 M220 370 L212 378" stroke="#8fa3b3" stroke-width="2" />
  <path d="M540 362 H580 M544 370 L536 378 M556 370 L548 378 M568 370 L560 378 M580 370 L572 378" stroke="#8fa3b3" stroke-width="2" />
  <path d="M200 120 L200 94 Q380 268 560 88 L560 120 Z" fill="rgba(229,72,42,.20)" stroke="#e5482a" stroke-width="2" />
  <path d="M200 120 L174 120 L218 360 L200 360 Z" fill="rgba(229,72,42,.20)" stroke="#e5482a" stroke-width="2" />
  <path d="M560 120 L590 120 L540 360 L560 360 Z" fill="rgba(229,72,42,.20)" stroke="#e5482a" stroke-width="2" />
  <path d="M200 398 H560 M200 390 V406 M560 390 V406" stroke="#8fa3b3" stroke-width="1" />
  <text x="380" y="416" fill="#8fa3b3" font-family="IBM Plex Mono, monospace" font-size="12" text-anchor="middle">6.00 m</text>
  <text x="616" y="244" fill="#8fa3b3" font-family="IBM Plex Mono, monospace" font-size="12">4.00 m</text>
</svg>

<style>
  .rg-figure { width: 100%; height: 100%; display: block; }
</style>
