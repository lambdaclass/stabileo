import { describe, it, expect } from 'vitest';
import { NOTICE_CATALOGUE, noticesOf } from '../notice-catalogue';
import es from '../../../i18n/locales/es';
import en from '../../../i18n/locales/en';
import pt from '../../../i18n/locales/pt';

describe('the design notice catalogue', () => {
  it('every code is unique and has its cause and its fix in es, en and pt', () => {
    const codes = NOTICE_CATALOGUE.map((n) => n.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const dict of [es, en, pt] as Array<Record<string, string>>) {
      for (const n of NOTICE_CATALOGUE) {
        expect(dict[n.causeKey], n.causeKey).toBeTruthy();
        expect(dict[n.fixKey], n.fixKey).toBeTruthy();
      }
    }
  });

  it('a member that does not verify says its outcome first, then what limited it', () => {
    const n = noticesOf({ outcome: 'SECTION_INADEQUATE', limiting: ['barFit', 'shear'] } as never);
    expect(n.map((x) => x.code)).toEqual(['D001', 'D108', 'D102']);
    expect(n[0]!.severity).toBe('error');
    expect(noticesOf({ outcome: 'VERIFIED', limiting: [] } as never)).toEqual([]);
  });
});
