/**
 * Text notes placed in the model: a point and what is written at it ("junta de dilatación",
 * "ver detalle 4"). Part of the project, drawn in the 3D view, carried by the model code.
 *
 * Pure.
 */
export interface ViewNote { id: number; at: { x: number; y: number; z: number }; text: string }

export function addNote(notes: readonly ViewNote[], at: ViewNote['at'], text: string): ViewNote[] {
  const id = notes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  return [...notes, { id, at: { ...at }, text: text.trim() }];
}
