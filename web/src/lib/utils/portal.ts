/**
 * Move a node to `document.body` while it is mounted: a Svelte action.
 *
 * A z-index is only compared inside the stacking context that holds it. The right panel opens one
 * (`.pro-sidebar`, z-index 40), so anything drawn inside it with a higher number still stays
 * under whatever the page stacks above the panel, and under the panel's own resize handle. A
 * full-screen dialog left the app's "?" button over its zoom controls; a hover tip opening to the
 * left went under the viewport; the example gallery let the resize handle light up through it.
 * Raising the number does not fix any of these. Escaping the context does.
 *
 * The node is put back on teardown so nothing is orphaned when the component unmounts with it open.
 */
export function portal(node: HTMLElement) {
  const home = node.parentNode;
  document.body.appendChild(node);
  return {
    destroy() {
      if (home && node.parentNode === document.body) home.appendChild(node);
    },
  };
}
