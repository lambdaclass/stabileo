<script lang="ts">
  /**
   * A select of ids that holds its full list only while it is in use (`LazySelect`).
   *
   * The members table had two of these per row, each listing every node: on the 3D shed that
   * is 709 rows × 2 × 232 nodes, 330 000 options, and arming the member tool (which opens the
   * table) froze the app for three seconds.
   */
  import LazySelect from './LazySelect.svelte';

  interface Props {
    value: number;
    ids: readonly number[];
    onchange: (id: number) => void;
    testid?: string;
    class?: string;
  }
  let { value, ids, onchange, testid, class: cls = '' }: Props = $props();
</script>

<LazySelect class={cls} {value} label={String(value)} options={() => ids.map((id) => ({ value: id, label: String(id) }))}
  onchange={(v) => onchange(Number(v))} {testid} />
