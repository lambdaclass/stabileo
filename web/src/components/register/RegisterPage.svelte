<script lang="ts">
  /**
   * `/register`: the page the ads land on. One aim, an account, with Google from this page in one
   * click (the popup must open from the click itself, so it cannot wait for the application to
   * load), and further down the real editor on the portal frame for whoever wants to try first.
   * The editor loads only when asked: booted on arrival it would download the whole application on
   * every visit and take the wheel from the page. Not indexed and not in the sitemap.
   */
  import './register-i18n';
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
  import Eyebrow from '../landing/Eyebrow.svelte';
  import TrussFigure from '../landing/TrussFigure.svelte';
  import SiteHeader from '../site/SiteHeader.svelte';
  import RegisterFigure from './RegisterFigure.svelte';
  import GoogleMark from './GoogleMark.svelte';
  import '../landing/landing.css';

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

  let prefersReducedMotion = $state(false);

  onMount(() => {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  <button type="button" class="btn btn-primary rg-google rg-google--{size}" class:btn-lg={size === 'lg'} onclick={() => start(placement)} disabled={step.kind === 'waiting'} data-testid="register-cta-{placement}">
    {#if !signedIn}<span class="rg-google-mark"><GoogleMark /></span>{/if}
    <span>{step.kind === 'waiting' ? t('register.waiting') : ctaLabel}</span>
  </button>
{/snippet}

<div class="landing rg" data-testid="register-page">
  <SiteHeader>
    {#snippet actions()}
      {#if !signedIn}
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => start('header')} data-testid="register-signin">{t('register.signIn')}</button>
      {/if}
    {/snippet}
  </SiteHeader>

  <section class="sec sec--ink hero" aria-labelledby="rg-title">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <Eyebrow n={t('register.eyebrowFree')} label={t('register.eyebrowLabel')} />
        <h1 id="rg-title">{t('register.title')}</h1>
        <p class="lead">{t('register.lead')}</p>
        <div class="hero-ctas">{@render googleButton('hero', 'lg')}</div>
        {#if error}<p class="rg-error" role="alert" data-testid="register-error">{error}</p>{/if}
        <ul class="hero-modes rg-features">
          <li><span class="hero-mode-name">{t('register.feature1')}</span><span class="hero-mode-st hero-mode-st-today">{t('register.tagWithAccount')}</span></li>
          <li><span class="hero-mode-name">{t('register.feature2')}</span><span class="hero-mode-st hero-mode-st-today">{t('register.tagFree')}</span></li>
        </ul>
      </div>
      <div class="hero-figure">
        <TrussFigure mode="animate" {prefersReducedMotion} />
      </div>
    </div>
  </section>

  <section class="sec sec--paper" id="try" aria-labelledby="rg-try-title">
    <div class="wrap">
      <Eyebrow n="02" label={t('register.tryEyebrow')} />
      <h2 class="display" id="rg-try-title">{t('register.tryTitle')}</h2>
      <p class="lead">{t('register.tryLead')}</p>
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

  <section class="sec sec--ink" aria-labelledby="rg-aud-title">
    <div class="wrap">
      <Eyebrow n="03" label={t('register.audEyebrow')} />
      <h2 class="display" id="rg-aud-title">{t('register.audTitle')}</h2>
      <div class="card-row cols-3 rg-cards">
        <article class="card">
          <p class="rg-kicker">{t('register.audStudents')}</p>
          <h3>{t('register.audStudentsTitle')}</h3>
          <p>{t('register.audStudentsBody')}</p>
        </article>
        <article class="card">
          <p class="rg-kicker">{t('register.audPros')}</p>
          <h3>{t('register.audProsTitle')}</h3>
          <p>{t('register.audProsBody')}</p>
        </article>
        <article class="card">
          <p class="rg-kicker">{t('register.audResearch')}</p>
          <h3>{t('register.audResearchTitle')}</h3>
          <p>{t('register.audResearchBody')}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="sec sec--ink rg-final" aria-labelledby="rg-final-title">
    <div class="wrap">
      <h2 class="display" id="rg-final-title">{t('register.finalTitle')}</h2>
      {@render googleButton('final', 'lg')}
      <p class="rg-trust">{t('register.trust')}</p>
    </div>
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
        <button type="submit" class="rg-submit" disabled={!accept || busy} data-testid="register-terms-submit">{t('register.termsSubmit')}</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .rg-google { gap: 0.8rem; }
  .hero-modes.rg-features { flex-direction: column; }
  .rg-google--lg { padding: 0.45rem 1.4rem 0.45rem 0.45rem; }
  .rg-google--md { padding: 0.4rem 1.1rem 0.4rem 0.4rem; }
  .rg-google-mark { width: 2.1rem; height: 2.1rem; background: #fff; border-radius: 2px; display: flex; align-items: center; justify-content: center; flex: none; }
  .rg-google--md .rg-google-mark { width: 1.8rem; height: 1.8rem; }
  .rg-error { margin: 0.9rem 0 0; color: #e8705f; font-size: 0.9rem; }
  .rg-frame { position: relative; margin-top: 2rem; border: 1px solid var(--hair); border-radius: 6px; overflow: hidden; background: #0c1620; aspect-ratio: 16 / 9; min-height: 340px; box-shadow: 0 24px 60px rgba(12, 22, 32, 0.18); }
  .rg-frame iframe { width: 100%; height: 100%; border: 0; display: block; }
  .rg-frame.live { aspect-ratio: auto; height: min(78vh, 760px); }
  .rg-open { position: absolute; inset: auto 0 0 0; margin: 0 auto 28px; width: max-content; max-width: calc(100% - 32px); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 26px; background: rgba(12, 22, 32, 0.88); color: #f4f7fa; border: 1px solid rgba(143, 163, 179, 0.38); border-radius: 6px; cursor: pointer; font: inherit; }
  .rg-play { color: #e5482a; font-size: 18px; }
  .rg-open-label { font-weight: 600; font-size: 16px; }
  .rg-open-note { font-size: 12px; color: #8fa3b3; }
  .rg-save { margin-top: 1.4rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; background: var(--card); border: 1px solid var(--hair); border-radius: 3px; padding: 18px 22px; }
  .rg-save > div { flex: 1 1 360px; }
  .rg-save-title { margin: 0; font-family: var(--lp-display); font-weight: 600; font-size: 1.2rem; color: var(--fg); }
  .rg-save-lead { margin: 4px 0 0; color: var(--fg-2); font-size: 0.92rem; }
  .rg-kicker { font-family: var(--lp-mono); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent-text, var(--lp-accent)); margin: 0 0 0.5rem; }
  .rg-final .wrap { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1.4rem; }
  .rg-trust { margin: 0; font-family: var(--lp-mono); font-size: 0.72rem; color: var(--fg-2); }
  @media (max-width: 900px) { .rg-cards { grid-template-columns: 1fr; } }
  .rg-overlay { position: fixed; inset: 0; background: rgba(5, 10, 16, 0.72); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 10001; }
  .rg-dialog { background: #f4f7fa; color: #0c1620; border-radius: 6px; padding: 24px; width: min(440px, 100%); box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; font-family: 'IBM Plex Sans', sans-serif; }
  .rg-dialog h2 { font-family: 'Space Grotesk', sans-serif; font-size: 22px; margin: 0; }
  .rg-dialog-lede, .rg-dialog-note { margin: 0; color: #43525e; font-size: 14px; }
  .rg-check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
  .rg-check input { width: 18px; height: 18px; margin-top: 2px; }
  .rg-check a { color: #255d9e; }
  .rg-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  .rg-ghost { background: none; border: 1px solid #c2cdd7; border-radius: 3px; padding: 8px 16px; font: inherit; cursor: pointer; min-height: 44px; }
  .rg-submit { background: #e5482a; color: #fff; border: 0; border-radius: 3px; padding: 8px 20px; font: inherit; font-weight: 600; cursor: pointer; min-height: 44px; }
  .rg-submit:disabled { opacity: 0.6; cursor: default; }
</style>
