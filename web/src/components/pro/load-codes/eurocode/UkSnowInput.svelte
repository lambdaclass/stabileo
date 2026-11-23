<script lang="ts">
  import EcSnowInput from './EcSnowInput.svelte';
  import type { CodeInputProps } from '../registry';
  import type { UkSnowInput } from '../../../../lib/codes/eurocode/inputs';

  let { value, onchange }: CodeInputProps<UkSnowInput> = $props();
</script>

<EcSnowInput {value} {onchange} uk />
