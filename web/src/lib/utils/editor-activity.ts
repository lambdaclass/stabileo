import { getContext, setContext } from 'svelte';

const EDITOR_ACTIVITY = Symbol('editor-activity');

export function provideEditorActivity(active: () => boolean): void {
  setContext(EDITOR_ACTIVITY, active);
}

export function editorActivity(): () => boolean {
  return getContext<() => boolean>(EDITOR_ACTIVITY) ?? (() => true);
}
