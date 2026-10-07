/**
 * The generators form's two bits of shared state: which parameter the reader is on, so the help
 * line above the preview can say what it controls, and which sections are open.
 *
 * The explanation of each parameter used to sit between its name and its box, so every box landed
 * at a different x and a long explanation pushed the box onto its own line. It now lives in one
 * place, read for the field under the pointer or, failing that, the one being typed in. Each
 * explanation stays in the DOM beside its field (`gen-hint-<key>`), which is what the field's
 * `aria-describedby` points at.
 */

export interface GenHelp {
  name: string;
  text: string;
}

export const genHelp = $state<{ hover: GenHelp | null; focus: GenHelp | null }>({ hover: null, focus: null });

export function clearGenHelp(): void {
  genHelp.hover = null;
  genHelp.focus = null;
}

/**
 * Open sections, by id. Every section of a form starts folded, so the whole list of what can be
 * edited reads at a glance in the headings and their summaries; the reader opens what they need.
 * Picking a generator (or going back to the gallery) folds them all again.
 */
const opened = $state<Record<string, boolean>>({});

export function sectionOpen(id: string): boolean {
  return !!opened[id];
}

export function setSectionOpen(id: string, open: boolean): void {
  if (sectionOpen(id) === open) return;
  opened[id] = open;
}

export function foldAllSections(): void {
  for (const id of Object.keys(opened)) delete opened[id];
}
