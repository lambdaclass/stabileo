import { unifiedPlates } from '../features';
import { HIDEABLE_KINDS, type NoticeKind } from './result-notices';

export const HIDDEN_NOTICES_KEY = 'stabileo-hidden-notices';

function load(): NoticeKind[] {
  if (!unifiedPlates()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN_NOTICES_KEY) ?? '[]');
    return Array.isArray(raw) ? HIDEABLE_KINDS.filter((k) => raw.includes(k)) : [];
  } catch {
    return [];
  }
}

function save(kinds: readonly NoticeKind[]): void {
  try { localStorage.setItem(HIDDEN_NOTICES_KEY, JSON.stringify(kinds)); } catch { /* storage unavailable: the choice lasts this session */ }
}

function createNoticePrefs() {
  let hidden = $state<NoticeKind[]>(load());
  const set = (next: NoticeKind[]) => {
    if (!unifiedPlates()) return;
    hidden = next;
    save(next);
  };
  return {
    get hidden(): readonly NoticeKind[] { return hidden; },
    isHidden(kind: NoticeKind): boolean { return HIDEABLE_KINDS.includes(kind) && hidden.includes(kind); },
    hide(kind: NoticeKind): void { if (HIDEABLE_KINDS.includes(kind) && !hidden.includes(kind)) set([...hidden, kind]); },
    show(kind: NoticeKind): void { if (hidden.includes(kind)) set(hidden.filter((k) => k !== kind)); },
    showAll(): void { set([]); },
    reload(): void { hidden = load(); },
  };
}

export const noticePrefs = createNoticePrefs();
