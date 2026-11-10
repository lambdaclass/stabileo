<script lang="ts">
  import AuthDialog from './AuthDialog.svelte';
  import { accountGate, gateFileInputs } from '../../lib/store/account-gate.svelte';
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const reason = $derived(
    accountGate.action === 'feedback'
      ? { title: t('account.gateFeedbackTitle'), lede: t('account.gateFeedbackLede') }
      : accountGate.action === 'exam'
        ? { title: t('account.gateExamTitle'), lede: t('account.gateExamLede') }
        : { title: t('account.gateTitle'), lede: t('account.gateLede') },
  );

  $effect(() => gateFileInputs());

  function signInUnavailable(): boolean {
    if (!accountGate.proceedWithoutAccount()) return false;
    uiStore.toast(t('account.gateUnavailable'), 'info');
    return true;
  }
</script>

<AuthDialog bind:open={accountGate.open} {reason} onunavailable={signInUnavailable} />
