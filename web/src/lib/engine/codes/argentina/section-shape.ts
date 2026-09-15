/**
 * The three section outlines this module can draw and design.
 *
 * In its own file because two things need it and neither should own it: the
 * drawing component and the panel that decides which shape is on screen. A
 * type exported from a Svelte component's instance script is not importable,
 * and putting it in either one would make the other depend on a UI file for a
 * piece of geometry.
 *
 * Every dimension is in METRES, like the rest of the engine. The panel takes
 * centimetres from the reader and converts once.
 */
export type SectionShape =
  | { kind: 'rect'; b: number; h: number }
  | { kind: 'tee'; bf: number; hf: number; bw: number; h: number }
  | { kind: 'circle'; D: number };
