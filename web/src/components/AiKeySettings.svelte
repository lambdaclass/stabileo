<script lang="ts">
  import { t, tp } from '../lib/i18n';
  import { aiKeys, AI_PROVIDERS, type AiProviderId } from '../lib/ai/keys.svelte';

  let { onDone }: { onDone?: () => void } = $props();

  const PROVIDER_NAME: Record<AiProviderId, string> = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI' };
  const PROVIDER_ACCOUNT: Record<AiProviderId, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
  const PROVIDER_HOST: Record<AiProviderId, string> = { anthropic: 'api.anthropic.com', openai: 'api.openai.com' };
  const KEY_PLACEHOLDER: Record<AiProviderId, string> = { anthropic: 'sk-ant-…', openai: 'sk-…' };

  let draft = $state('');
  let forgetFailed = $state(false);
  const provider = $derived(aiKeys.provider);
  const saved = $derived(aiKeys.keys[provider]);

  function save(e: SubmitEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;
    aiKeys.setKey(provider, key);
    draft = '';
    onDone?.();
  }

  function pick(p: AiProviderId) {
    aiKeys.setProvider(p);
    forgetFailed = false;
    draft = '';
  }
</script>

<section class="ai-key" data-testid="ai-key-settings" aria-labelledby="ai-key-title">
  <h3 id="ai-key-title" class="ai-key-title">{t('ai.key.title')}</h3>
  <p class="ai-key-lead">{t('ai.key.lead')}</p>

  <div class="ai-key-providers" role="radiogroup" aria-label={t('ai.key.provider')}>
    {#each AI_PROVIDERS as p (p)}
      <button
        type="button"
        role="radio"
        aria-checked={provider === p}
        class="ai-key-provider"
        class:on={provider === p}
        data-testid="ai-provider-{p}"
        onclick={() => pick(p)}
      >
        {PROVIDER_NAME[p]}
        {#if aiKeys.hasKey(p)}<span class="ai-key-dot" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  </div>

  {#if saved}
    <div class="ai-key-saved">
      <span class="ai-key-saved-text" data-testid="ai-key-saved">
        {tp('ai.key.savedAs', { provider: PROVIDER_ACCOUNT[provider], last: saved.slice(-4) })}
      </span>
      <button type="button" class="ai-key-btn ai-key-forget" data-testid="ai-key-forget" onclick={() => { forgetFailed = !aiKeys.forget(provider); }}>
        {t('ai.key.forget')}
      </button>
    </div>
    {#if onDone}
      <button type="button" class="ai-key-btn ai-key-primary" onclick={onDone}>{t('ai.key.done')}</button>
    {/if}
  {:else}
    <form class="ai-key-form" onsubmit={save}>
      <label class="ai-key-label" for="ai-key-input">{tp('ai.key.label', { provider: PROVIDER_ACCOUNT[provider] })}</label>
      <div class="ai-key-row">
        <input
          id="ai-key-input"
          class="ai-key-input"
          type="password"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder={KEY_PLACEHOLDER[provider]}
          data-testid="ai-key-input"
          bind:value={draft}
        />
        <button type="submit" class="ai-key-btn ai-key-primary" data-testid="ai-key-save" disabled={!draft.trim()}>
          {t('ai.key.save')}
        </button>
      </div>
    </form>
  {/if}

  {#if forgetFailed}
    <p class="ai-key-error" role="alert" data-testid="ai-key-forget-failed">{t('ai.key.forgetFailed')}</p>
  {/if}

  <p class="ai-key-note" data-testid="ai-key-note">
    {tp('ai.key.privacy', { host: PROVIDER_HOST[provider], provider: PROVIDER_ACCOUNT[provider] })}
  </p>
</section>

<style>
  .ai-key {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .ai-key-title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--st-text);
  }
  .ai-key-lead,
  .ai-key-note {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--st-text-2);
    overflow-wrap: anywhere;
  }
  .ai-key-note { color: var(--st-text-3); }
  .ai-key-error { margin: 0; font-size: 0.78rem; line-height: 1.45; color: var(--st-danger); overflow-wrap: anywhere; }
  .ai-key-providers {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
  }
  .ai-key-provider {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: none;
    border: none;
    border-radius: 5px;
    color: var(--st-text-3);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ai-key-provider.on {
    color: var(--st-text);
    background: var(--st-surface-3);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.28), inset 0 -2px 0 -1px var(--st-accent);
  }
  .ai-key-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--st-accent);
  }
  .ai-key-form { display: flex; flex-direction: column; gap: 0.35rem; }
  .ai-key-label { font-size: 0.7rem; color: var(--st-text-2); }
  .ai-key-row { display: flex; gap: 0.4rem; min-width: 0; }
  .ai-key-input {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    background: var(--st-hair);
    border: 1px solid var(--st-surface-3);
    border-radius: 6px;
    color: var(--st-text);
    font-size: 0.75rem;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
  }
  .ai-key-input:focus { outline: none; border-color: var(--st-accent); }
  .ai-key-btn {
    min-height: 32px;
    padding: 0 0.8rem;
    border-radius: 6px;
    border: 1px solid var(--st-surface-3);
    background: var(--st-hair);
    color: var(--st-text);
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }
  .ai-key-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .ai-key-primary:not(:disabled) { border-color: var(--st-accent); color: var(--st-accent); }
  .ai-key-saved {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .ai-key-saved-text { font-size: 0.72rem; color: var(--st-text-2); overflow-wrap: anywhere; }

  @media (pointer: coarse) {
    .ai-key-provider,
    .ai-key-input,
    .ai-key-btn { min-height: 44px; }
    .ai-key-input { font-size: 16px; }
  }
</style>
