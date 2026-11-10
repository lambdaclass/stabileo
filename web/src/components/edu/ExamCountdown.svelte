<script lang="ts">
  import { examLock } from '../../lib/store/exam-lock.svelte';
  import { t } from '../../lib/i18n';
  import { formatRemaining } from './exam-time';

  let left = $state(examLock.remainingMs());

  $effect(() => {
    void examLock.deadlineMs;
    left = examLock.remainingMs();
    const id = setInterval(() => { left = examLock.remainingMs(); }, 1000);
    return () => clearInterval(id);
  });
</script>

{#if left !== null}
  <span class="countdown" class:low={left < 5 * 60_000} role="timer" aria-label={t('exam.timeLeft')} data-testid="exam-countdown">
    {formatRemaining(left)}
  </span>
{/if}

<style>
  .countdown {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 0.95rem;
    padding: 2px 10px;
    border-radius: var(--st-radius);
    background: var(--st-surface-3);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
  }
  .countdown.low {
    color: var(--st-danger);
    border-color: currentColor;
  }
</style>
