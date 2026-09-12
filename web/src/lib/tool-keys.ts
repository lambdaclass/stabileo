/**
 * Which letter arms which tool — the ONE place this is defined.
 *
 * This table existed in four places (the keyboard handler, the ribbon's
 * shortcut hints, the floating toolbar's tooltips and the mobile toolbar's
 * button labels) and had already drifted: two of them showed (H) for pan
 * while the handler armed it with A — and H has toggled the axes display
 * since long before the ribbon existed, so the displayed shortcut silently
 * did something else.
 *
 * The bindings themselves are the long-standing ones; do not change a letter
 * here without checking it does not collide with the other global shortcuts
 * in KeyboardShortcuts.svelte (H is the axes toggle).
 */
export const TOOL_KEYS = [
  { id: 'pan', key: 'A' },
  { id: 'select', key: 'V' },
  { id: 'node', key: 'N' },
  { id: 'element', key: 'E' },
  { id: 'support', key: 'S' },
  { id: 'load', key: 'L' },
] as const;

export type ToolKeyId = (typeof TOOL_KEYS)[number]['id'];

/** Tool id → its letter, for displays that only need the key. */
export const TOOL_KEY_MAP: Record<ToolKeyId, string> = Object.fromEntries(
  TOOL_KEYS.map((t) => [t.id, t.key]),
) as Record<ToolKeyId, string>;

/**
 * Tool → the Data-panel tab it edits, for the tools that own one.
 *
 * The third thing about a tool that was written down twice. The ribbon
 * declared `dataTab: 'nodes'` beside each command; the keyboard handler kept
 * its own list, by POSITION in the tab strip, and could only act on it by
 * clicking a button that had to already be on screen. So a tool armed from
 * the ribbon opened the table and a tool armed from the keyboard did not —
 * and since the ribbon lights a tool command only while the Data panel is
 * open, pressing N also failed to light Node in the ribbon. One missing
 * step, two symptoms that looked unrelated.
 *
 * `pan` and `select` are absent on purpose: they edit nothing, so they own
 * no tab and must not open one.
 */
export const TOOL_DATA_TAB: Partial<Record<ToolKeyId, string>> = {
  node: 'nodes',
  element: 'elements',
  support: 'supports',
  load: 'loads',
};

/**
 * What a shortcut asks the shell to open. The shell owns the panel state, so
 * the keyboard layer — which is mounted nowhere near it — says what it wants
 * and lets the shell decide, rather than reaching into the DOM for a button.
 */
export const OPEN_PANEL_EVENT = 'stabileo-open-panel';

export interface OpenPanelRequest {
  panel: string | null;
  dataTab?: string;
  toggle?: boolean;
}
