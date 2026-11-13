<script lang="ts">
  import EcWindInput from './EcWindInput.svelte';
  import type { CodeInputProps } from '../registry';
  import type { UkWindInput } from '../../../../lib/codes/eurocode/inputs';

  let { value, onchange }: CodeInputProps<UkWindInput> = $props();
</script>

<EcWindInput {value} {onchange} uk />
