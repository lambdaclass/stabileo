/** Capture before viewer handlers can stop propagation; keyboard clicks include camera controls. */
export function viewerInteraction(host: EventTarget, oninteract: () => void) {
  const events = ['pointerdown', 'wheel', 'keydown', 'click'];
  for (const event of events) host.addEventListener(event, oninteract, { capture: true, passive: true });
  return { destroy() { for (const event of events) host.removeEventListener(event, oninteract, true); } };
}
