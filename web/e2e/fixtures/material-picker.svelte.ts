import { mount } from 'svelte';
import MaterialPresetSelector from '../../src/components/MaterialPresetSelector.svelte';

const props = $state({
  open: true, initialTab: 'invent' as const, onselect: () => {}, onclose: () => {}, oninvent: (_id: number) => {},
});
mount(MaterialPresetSelector, { target: document.body, props });
document.querySelector('#replace')!.addEventListener('click', () => {
  props.oninvent = id => { document.title = String(id); };
});
document.querySelector('#toggle')!.addEventListener('click', () => { props.open = !props.open; });
