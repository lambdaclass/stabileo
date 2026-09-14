/**
 * The contact channels, pinned.
 *
 * wa.me does not validate: given a number with a `+`, spaces or dashes it
 * opens WhatsApp on an invalid contact instead of failing, so the mistake is
 * invisible from the code and visible only to whoever tried to write. Hence a
 * shape check on the constant, and a link builder nobody has to remember the
 * rules for.
 */
import { describe, it, expect } from 'vitest';
import { WHATSAPP_NUMBER, hasWhatsapp, whatsappUrl, contactChannels, SOCIAL_LINKS } from '../channels';
import { OFFERED_LOCALES, dictFor } from '../../i18n/store.svelte';

describe('the contact link', () => {
  it('either has no number, or one wa.me can use', () => {
    // Empty is a legitimate state: the channel does not render and the menu
    // simply offers the accounts. What must never happen is a number
    // that looks configured and is not.
    if (WHATSAPP_NUMBER !== '') {
      expect(WHATSAPP_NUMBER, 'digits only, international format, no + or separators').toMatch(/^\d{8,15}$/);
      expect(hasWhatsapp()).toBe(true);
    } else {
      expect(hasWhatsapp()).toBe(false);
    }
  });

  it('rejects the formats a person would naturally type', () => {
    // Documenting the trap rather than only guarding it: these are what a
    // number looks like everywhere except in a wa.me URL.
    for (const bad of ['+5491122334455', '11 2233 4455', '11-2233-4455', '(11) 2233-4455', '123']) {
      expect(/^\d{8,15}$/.test(bad), bad).toBe(false);
    }
  });

  it('builds a wa.me link with the greeting encoded', () => {
    const url = whatsappUrl('¡Hola! Te escribo desde stabileo.com.');
    expect(url.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`)).toBe(true);
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('?text=')[1])).toBe('¡Hola! Te escribo desde stabileo.com.');
  });
});

describe('the channel list both menus read from', () => {
  it('leads with WhatsApp and never offers the company site as a way to reach us', () => {
    const ids = contactChannels('hola').map((c) => c.id);
    expect(ids[0]).toBe('whatsapp');
    // Ergodic Group belongs in the footer — it is a company, not an inbox.
    expect(SOCIAL_LINKS.some((s) => s.id === 'ergodic')).toBe(true);
    expect(ids).not.toContain('ergodic');
  });

  it('gives every channel a mark and a language, because a blank column reads as a defect', () => {
    for (const c of contactChannels('hola')) {
      expect(c.icon, c.id).toMatch(/^<svg/);
      expect(c.langs, c.id).toMatch(/^(EN|ES|PT)(\/(EN|ES|PT))*$/);
      expect(c.href, c.id).toMatch(/^https:\/\//);
    }
  });
});

describe('the three strings the menus translate', () => {
  /*
   * These moved out of the `landing.*` namespace when the editor's header
   * started offering the same channels, and the landing's own parity test —
   * which scans for `landing.…` — stopped covering them. `t()` falls back to
   * English per key without erroring, so a missing one shows an English line
   * inside a Spanish menu and nothing anywhere reports it.
   */
  const KEYS = ['contact.linksTitle', 'contact.linksLabel', 'contact.waGreeting'];

  for (const locale of OFFERED_LOCALES) {
    it(`${locale} says all of them in its own words`, () => {
      const dict = dictFor(locale);
      const en = dictFor('en');
      for (const k of KEYS) {
        expect(dict[k], `${locale} is missing ${k}`).toBeTruthy();
        if (locale !== 'en') expect(dict[k], `${locale}: ${k} is still the English string`).not.toBe(en[k]);
      }
    });
  }
});
