<script lang="ts">
  import AuthDialog from './AuthDialog.svelte';
  import { accountGate } from '../../lib/store/account-gate.svelte';
  import { t } from '../../lib/i18n';
</script>

<AuthDialog
  bind:open={accountGate.open}
  startIn="register"
  reason={{ title: t('account.gateTitle'), lede: t('account.gateLede') }}
/>
