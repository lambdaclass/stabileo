<script lang="ts">
  import AuthDialog from './AuthDialog.svelte';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import { t } from '../../lib/i18n';

  const reason = $derived(
    accountGate.action === 'feedback'
      ? { title: t('account.gateFeedbackTitle'), lede: t('account.gateFeedbackLede') }
      : { title: t('account.gateTitle'), lede: t('account.gateLede') },
  );
</script>

<AuthDialog bind:open={accountGate.open} startIn="register" {reason} />
