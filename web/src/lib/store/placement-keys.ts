/**
 * What a key does while a placement is up.
 *
 * The keyboard belongs to the placement — R, Shift+R, F, Tab, Enter, Esc drive it, camera keys
 * move the view, and every other shortcut is held back — except in a field the user is typing
 * into outside the placement bar: the generator's coordinates, rotation and bays are edited
 * during an "at a point" preview precisely so the ghost follows them. Holding those keys dropped
 * the digits, turned 'r' and 'f' into a rotation and a mirror, and Tab into an anchor cycle.
 * There only Escape still cancels.
 */
export type PlacementKeyAction = 'cancel' | 'commit' | 'commitAt' | 'cycleAnchor' | 'rotate' | 'mirror' | 'pass' | 'hold';

/** Where the key was pressed: a field of the placement bar, a field elsewhere, or neither. */
export type KeyPlace = 'hudField' | 'otherField' | 'none';

const CAMERA_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift', 'Control', 'Meta', 'Alt']);

export function placementKeyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean }, place: KeyPlace): PlacementKeyAction {
  const k = e.key;
  const mod = !!(e.ctrlKey || e.metaKey);
  if (k === 'Escape') return 'cancel';
  if (place === 'otherField') return 'pass';
  if (k === 'Enter') return place === 'hudField' ? 'commitAt' : 'commit';
  if (place === 'hudField') return 'pass';
  if (k === 'Tab') return 'cycleAnchor';
  if (!mod && (k === 'r' || k === 'R')) return 'rotate';
  if (!mod && (k === 'f' || k === 'F')) return 'mirror';
  if (CAMERA_KEYS.has(k) && !mod) return 'pass';
  return 'hold';
}

/** Where a keydown's target is, for placementKeyAction. */
export function keyPlace(target: EventTarget | null): KeyPlace {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return 'none';
  const editable = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
  if (!editable) return 'none';
  return el.closest?.('[data-placement-hud]') ? 'hudField' : 'otherField';
}
