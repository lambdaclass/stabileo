/**
 * What PRO's double-click editor is open on: a node, a member or a shell, and where the click was.
 * A view preference like the drawing state; nothing here is saved.
 */
export type QuickEditTarget =
  | { kind: 'node'; id: number }
  | { kind: 'member'; id: number }
  | { kind: 'plate'; id: number }
  | { kind: 'quad'; id: number };

function createQuickEdit() {
  let target = $state<QuickEditTarget | null>(null);
  let at = $state({ x: 0, y: 0 });
  return {
    get target() { return target; },
    get at() { return at; },
    open(t: QuickEditTarget, x: number, y: number) { target = t; at = { x, y }; },
    close() { target = null; },
  };
}

export const quickEdit = createQuickEdit();
