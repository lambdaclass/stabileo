<script lang="ts">
  /**
   * `/register`: the page the ads land on. One aim, an account, with Google from this page in one
   * click (the popup must open from the click itself, so it cannot wait for the application to
   * load), and further down the real editor on the portal frame for whoever wants to try first.
   * The editor loads only when asked: booted on arrival it would download the whole application on
   * every visit and take the wheel from the page. Not indexed and not in the sitemap.
   */
  import { onMount } from 'svelte';
  import { tPublic as t, tpPublic as tp, publicI18n } from '../../lib/i18n/store.svelte';
  import { applyPageMeta, restorePageMeta } from '../../lib/page-meta';
  import { authStore } from '../../lib/store/auth.svelte';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { GoogleSignInError } from '../../lib/auth/google-popup';
  import { ApiError } from '../../lib/api/client';
  import { legalHref, TERMS_PATH, PRIVACY_PATH } from '../../lib/legal/legal';
  import { tracking } from '../../lib/tracking/tracking';
  import { signupSource } from '../../lib/tracking/visit';
  import { pixelCookies } from '../../lib/tracking/attribution';
  import { modeToPath } from '../../lib/app-mode';
  import { enterApp } from '../landing/landing-utils';
  import BrandMark from '../landing/BrandMark.svelte';
  import RegisterFigure from './RegisterFigure.svelte';
  import GoogleMark from './GoogleMark.svelte';

  const EXAMPLE = 'portal-frame';
  const BRAND = 'Stabileo';
  const FULL_UI_WIDTH = 900;

  type Step = { kind: 'idle' } | { kind: 'waiting'; cancel: () => void } | { kind: 'terms'; token: string; email: string; placement: string };
  let step = $state<Step>({ kind: 'idle' });
  let accept = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let live = $state(false);
  let frameSrc = $state('');
  let frame: HTMLDivElement | undefined = $state();

  const signedIn = $derived(authStore.isAuthenticated);
  const loginOpen = $derived(authStore.userLoginEnabled);

  onMount(() => {
    void authStore.init();
    applyPageMeta({ title: t('register.metaTitle'), description: t('register.metaDescription'), locale: publicI18n.locale, path: '/register' });
    return restorePageMeta;
  });

  function toEditor() {
    history.pushState(null, '', `${modeToPath('basico')}?example=${EXAMPLE}`);
    enterApp();
  }

  function errorText(err: unknown): string {
    if (err instanceof GoogleSignInError && err.code === 'popup_blocked') return t('register.err.popupBlocked');
    if (err instanceof GoogleSignInError && err.code === 'email_in_use') return t('register.err.emailInUse');
    if (err instanceof GoogleSignInError && ['user_login_disabled', 'oauth_unavailable'].includes(err.code)) return t('register.err.closed');
    if (err instanceof ApiError && err.code === 'invalid_or_expired_code') return t('register.err.expired');
    return t('register.err.generic');
  }

  async function start(placement: string) {
    // Before the config arrives the click still goes to Google: a closed sign-in comes back as an error.
    if (signedIn || (authStore.configKnown && !loginOpen)) return toEditor();
    if (step.kind === 'waiting') return;
    error = null;
    tracking.signUpClick(placement);
    const attempt = authStore.signInWithGoogle();
    tracking.registrationStart(placement);
    step = { kind: 'waiting', cancel: attempt.cancel };
    try {
      const outcome = await attempt.result;
      if (outcome.kind === 'signedIn') {
        tracking.login();
        toEditor();
      } else {
        accept = false;
        step = { kind: 'terms', token: outcome.token, email: outcome.email, placement };
        tracking.registrationStep('terms');
      }
    } catch (err) {
      step = { kind: 'idle' };
      if (!(err instanceof GoogleSignInError && err.code === 'cancelled')) error = errorText(err);
    }
  }

  async function finish(e: SubmitEvent) {
    e.preventDefault();
    if (busy || step.kind !== 'terms' || !accept) return;
    busy = true;
    error = null;
    try {
      const account = await authStore.completeGoogleSignup({
        signup_token: step.token,
        accept_terms: true,
        usage_analytics: usageConsent.sharing,
        locale: publicI18n.locale,
        source: signupSource(`register.${step.placement}`),
        attribution: pixelCookies(),
      });
      tracking.completeRegistration(account.id);
      if (usageConsent.sharing) usageConsent.set('granted');
      step = { kind: 'idle' };
      toEditor();
    } catch (err) {
      error = errorText(err);
      if (err instanceof ApiError && err.code === 'invalid_or_expired_code') step = { kind: 'idle' };
    } finally {
      busy = false;
    }
  }

  function cancel() {
    if (step.kind === 'waiting') step.cancel();
    step = { kind: 'idle' };
  }

  function openEditor() {
    const wide = (frame?.clientWidth ?? 0) >= FULL_UI_WIDTH;
    frameSrc = `${modeToPath('basico')}?${wide ? '' : 'embed&'}example=${EXAMPLE}`;
    live = true;
  }

  const ctaLabel = $derived(signedIn ? t('register.openEditor') : t('register.cta'));
</script>

<svelte:head><meta name="robots" content="noindex, follow" /></svelte:head>

{#snippet googleButton(placement: string, size: 'lg' | 'md')}
  <button type="button" class="rg-google rg-google--{size}" onclick={() => start(placement)} disabled={step.kind === 'waiting'} data-testid="register-cta-{placement}">
    {#if !signedIn}<span class="rg-google-mark"><GoogleMark /></span>{/if}
    <span>{step.kind === 'waiting' ? t('register.waiting') : ctaLabel}</span>
  </button>
{/snippet}

<div class="rg" data-testid="register-page">
  <header class="rg-wrap rg-head">
    <a class="rg-brand" href="/" aria-label={BRAND}><BrandMark /><span>{BRAND.toLowerCase()}</span></a>
    {#if !signedIn}
      <button type="button" class="rg-signin" onclick={() => start('header')} data-testid="register-signin">{t('register.signIn')}</button>
    {/if}
  </header>

  <section class="rg-wrap rg-hero">
    <div class="rg-copy">
      <p class="rg-eyebrow"><span class="rg-rule" aria-hidden="true"></span><span class="rg-accent">{t('register.eyebrowFree')}</span><span>{t('register.eyebrowLabel')}</span></p>
      <h1>{t('register.title')}</h1>
      <p class="rg-lead">{t('register.lead')}</p>
      {@render googleButton('hero', 'lg')}
      <p class="rg-note">{t('register.ctaNote')}</p>
      {#if error}<p class="rg-error" role="alert" data-testid="register-error">{error}</p>{/if}
      <ul class="rg-features">
        <li><span>{t('register.feature1')}</span><span class="rg-tag">{t('register.tagWithAccount')}</span></li>
        <li><span>{t('register.feature2')}</span><span class="rg-tag">{t('register.tagWithAccount')}</span></li>
        <li><span>{t('register.feature3')}</span><span class="rg-tag">{t('register.tagFree')}</span></li>
      </ul>
    </div>
    <figure class="rg-truss" aria-hidden="true">
      <svg viewBox="0 0 520 300" width="100%">
        <path d="M30 260 H490" stroke="rgba(143,163,179,.32)" stroke-width="1" />
        <g stroke="#e5482a" stroke-width="2.4" fill="none"><path d="M60 240 H460" /><path d="M120 120 V240" /><path d="M260 78 V240" /><path d="M400 120 V240" /></g>
        <g stroke="#2c6cb4" stroke-width="2.4" fill="none"><path d="M60 240 L120 120 L260 78 L400 120 L460 240" /><path d="M120 120 L260 240" /><path d="M400 120 L260 240" /></g>
        <g fill="#8fa3b3"><circle cx="60" cy="240" r="4" /><circle cx="120" cy="240" r="4" /><circle cx="260" cy="240" r="4" /><circle cx="400" cy="240" r="4" /><circle cx="460" cy="240" r="4" /><circle cx="120" cy="120" r="4" /><circle cx="260" cy="78" r="4" /><circle cx="400" cy="120" r="4" /></g>
      </svg>
    </figure>
  </section>

  <p class="rg-scroll">{t('register.scrollHint')} ↓</p>

  <section class="rg-paper" id="try">
    <div class="rg-wrap">
      <p class="rg-eyebrow rg-eyebrow--paper"><span class="rg-rule" aria-hidden="true"></span><span class="rg-accent">02</span><span>{t('register.tryEyebrow')}</span></p>
      <h2>{t('register.tryTitle')}</h2>
      <p class="rg-paper-lead">{t('register.tryLead')}</p>
      <div class="rg-frame" class:live bind:this={frame}>
        {#if live}
          <iframe src={frameSrc} title={t('register.tryTitle')} data-testid="register-editor"></iframe>
        {:else}
          <RegisterFigure />
          <button type="button" class="rg-open" onclick={openEditor} data-testid="register-open-editor">
            <span class="rg-play" aria-hidden="true">▶</span>
            <span class="rg-open-label">{t('register.tryOpen')}</span>
            <span class="rg-open-note">{t('register.tryNote')}</span>
          </button>
        {/if}
      </div>
      <div class="rg-save">
        <div>
          <p class="rg-save-title">{t('register.saveTitle')}</p>
          <p class="rg-save-lead">{t('register.saveLead')}</p>
        </div>
        {@render googleButton('save', 'md')}
      </div>
    </div>
  </section>

  <section class="rg-wrap rg-audiences">
    <div class="rg-card">
      <p class="rg-kicker">{t('register.audStudents')}</p>
      <h3>{t('register.audStudentsTitle')}</h3>
      <p>{t('register.audStudentsBody')}</p>
    </div>
    <div class="rg-card">
      <p class="rg-kicker">{t('register.audPros')}</p>
      <h3>{t('register.audProsTitle')}</h3>
      <p>{t('register.audProsBody')}</p>
    </div>
    <div class="rg-card">
      <p class="rg-kicker">{t('register.audResearch')}</p>
      <h3>{t('register.audResearchTitle')}</h3>
      <p>{t('register.audResearchBody')}</p>
    </div>
  </section>

  <section class="rg-wrap rg-final">
    <h2>{t('register.finalTitle')}</h2>
    {@render googleButton('final', 'lg')}
    <p class="rg-trust">{t('register.trust')}</p>
  </section>
</div>

{#if step.kind === 'terms'}
  <div class="rg-overlay" role="presentation">
    <form class="rg-dialog" role="dialog" aria-modal="true" aria-labelledby="rg-terms-title" onsubmit={finish} data-testid="register-terms">
      <h2 id="rg-terms-title">{t('register.termsTitle')}</h2>
      <p class="rg-dialog-lede" data-testid="register-terms-email">{tp('register.termsLede', { email: step.email })}</p>
      <label class="rg-check">
        <input type="checkbox" bind:checked={accept} data-testid="register-accept-terms" />
        <span>
          {t('legal.acceptTerms')}
          <a href={legalHref(TERMS_PATH, publicI18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.termsLink')}</a> ·
          <a href={legalHref(PRIVACY_PATH, publicI18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.privacyLink')}</a>
        </span>
      </label>
      <p class="rg-dialog-note">{t('legal.usageIncluded')}</p>
      {#if error}<p class="rg-error" role="alert">{error}</p>{/if}
      <div class="rg-dialog-actions">
        <button type="button" class="rg-ghost" onclick={cancel}>{t('register.termsCancel')}</button>
        <button type="submit" class="rg-google rg-google--md" disabled={!accept || busy} data-testid="register-terms-submit">{t('register.termsSubmit')}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .rg {
    --ink: #0c1620;
    --ink-2: #0f1e2b;
    --paper: #e7ecf1;
    --paper-2: #f4f7fa;
    --fg: #f4f7fa;
    --fg-2: #8fa3b3;
    --fg-3: #64798a;
    --hair: rgba(143, 163, 179, 0.22);
    --accent: #e5482a;
    --accent-hover: #f05a3c;
    --accent-paper: #b3341c;
    --ok: #2aa869;
    background: var(--ink);
    color: var(--fg);
    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 15px;
    line-height: 1.55;
    position: fixed;
    inset: 0;
    z-index: 10000;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .rg-wrap { max-width: 1180px; margin: 0 auto; padding-inline: 24px; box-sizing: border-box; }
  .rg-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-block: 22px; }
  .rg-brand { display: flex; align-items: center; gap: 10px; color: var(--fg); text-decoration: none; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
  .rg-signin { background: none; color: var(--fg); border: 1px solid rgba(143, 163, 179, 0.38); border-radius: 3px; padding: 8px 16px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; min-height: 40px; }
  .rg-hero { display: flex; flex-wrap: wrap; gap: 56px; align-items: center; padding-block: 56px 72px; }
  .rg-copy { flex: 1 1 520px; min-width: 0; }
  .rg-truss { flex: 1 1 380px; min-width: 0; margin: 0; border: 1px solid rgba(143, 163, 179, 0.16); border-radius: 3px; background: var(--ink-2); padding: 22px; }
  .rg-eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 22px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--fg-2); }
  .rg-rule { width: 34px; height: 1px; background: var(--accent); flex: none; }
  .rg-accent { color: var(--accent); }
  h1 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: clamp(36px, 5vw, 56px); line-height: 1.04; letter-spacing: -0.03em; margin: 0 0 20px; max-width: 16ch; }
  .rg-lead { color: var(--fg-2); font-size: 17px; line-height: 1.6; margin: 0 0 32px; max-width: 52ch; }
  .rg-google { display: inline-flex; align-items: center; justify-content: center; gap: 14px; background: var(--accent); color: #fff; border: 0; border-radius: 3px; font: inherit; font-weight: 600; cursor: pointer; min-height: 44px; }
  .rg-google:hover:not(:disabled) { background: var(--accent-hover); }
  .rg-google:disabled { opacity: 0.7; cursor: default; }
  .rg-google--lg { font-size: 17px; padding: 10px 26px 10px 10px; }
  .rg-google--md { font-size: 15px; padding: 8px 20px 8px 8px; }
  .rg-google-mark { width: 36px; height: 36px; background: #fff; border-radius: 2px; display: flex; align-items: center; justify-content: center; }
  .rg-google--md .rg-google-mark { width: 30px; height: 30px; }
  .rg-note { margin: 14px 0 0; font-size: 13px; color: var(--fg-2); }
  .rg-error { margin: 12px 0 0; color: #e8705f; font-size: 14px; }
  .rg-features { list-style: none; padding: 0; margin: 34px 0 0; border-top: 1px solid var(--hair); }
  .rg-features li { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--hair); font-family: 'Space Grotesk', sans-serif; font-weight: 600; }
  .rg-tag { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ok); white-space: nowrap; }
  .rg-scroll { text-align: center; padding: 0 24px 18px; margin: 0; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--fg-2); }
  .rg-paper { background: var(--paper); color: var(--ink); padding-block: 64px 72px; }
  .rg-eyebrow--paper { color: #43525e; margin-bottom: 16px; }
  .rg-eyebrow--paper .rg-rule { background: var(--accent-paper); }
  .rg-eyebrow--paper .rg-accent { color: var(--accent-paper); }
  h2 { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: clamp(26px, 3.4vw, 36px); letter-spacing: -0.03em; line-height: 1.08; margin: 0 0 10px; max-width: 24ch; }
  .rg-paper-lead { color: #43525e; margin: 0 0 28px; max-width: 64ch; }
  .rg-frame { position: relative; border: 1px solid #c2cdd7; border-radius: 6px; overflow: hidden; background: var(--ink); aspect-ratio: 16 / 9; min-height: 360px; box-shadow: 0 24px 60px rgba(12, 22, 32, 0.18); }
  .rg-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
  .rg-frame.live { aspect-ratio: auto; height: min(78vh, 760px); }
  .rg-open { position: absolute; inset: auto 0 0 0; margin: 0 auto 28px; width: max-content; max-width: calc(100% - 32px); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 26px; background: rgba(12, 22, 32, 0.88); color: var(--fg); border: 1px solid rgba(143, 163, 179, 0.38); border-radius: 6px; cursor: pointer; font: inherit; }
  .rg-play { color: var(--accent); font-size: 18px; }
  .rg-open-label { font-weight: 600; font-size: 16px; }
  .rg-open-note { font-size: 12px; color: var(--fg-2); }
  .rg-save { margin-top: 22px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; background: var(--paper-2); border: 1px solid #c2cdd7; border-radius: 3px; padding: 18px 22px; }
  .rg-save > div { flex: 1 1 360px; }
  .rg-save-title { margin: 0; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 19px; }
  .rg-save-lead { margin: 4px 0 0; color: #43525e; font-size: 14px; }
  .rg-audiences { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; padding-block: 64px 40px; }
  .rg-card { background: var(--ink-2); border: 1px solid rgba(143, 163, 179, 0.16); border-radius: 3px; padding: 22px; }
  .rg-kicker { margin: 0 0 10px; font-family: 'IBM Plex Mono', monospace; font-size: 10px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); }
  h3 { margin: 0 0 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 18px; }
  .rg-card p:last-child { margin: 0; color: var(--fg-2); font-size: 14px; }
  .rg-final { text-align: center; padding-block: 32px 80px; }
  .rg-final h2 { margin: 0 auto 22px; }
  .rg-trust { margin: 22px 0 0; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--fg-3); }
  .rg-overlay { position: fixed; inset: 0; background: rgba(5, 10, 16, 0.72); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10001; }
  .rg-dialog { background: var(--paper-2); color: var(--ink); border-radius: 6px; padding: 24px; width: min(440px, 100%); box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; font-family: 'IBM Plex Sans', sans-serif; }
  .rg-dialog h2 { font-size: 22px; margin: 0; }
  .rg-dialog-lede, .rg-dialog-note { margin: 0; color: #43525e; font-size: 14px; }
  .rg-check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
  .rg-check input { width: 18px; height: 18px; margin-top: 2px; }
  .rg-check a { color: #255d9e; }
  .rg-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  .rg-ghost { background: none; border: 1px solid #c2cdd7; border-radius: 3px; padding: 8px 16px; font: inherit; cursor: pointer; min-height: 44px; }
  .rg-dialog .rg-google--md { padding: 8px 20px; }
</style>
