/**
 * The contact link's format, pinned.
 *
 * wa.me does not validate: given a number with a `+`, spaces or dashes it
 * opens WhatsApp on an invalid contact instead of failing, so the mistake is
 * invisible from the code and visible only to whoever tried to write. Hence a
 * shape check on the constant, and a link builder nobody has to remember the
 * rules for.
 */
import { describe, it, expect } from 'vitest';
import { WHATSAPP_NUMBER, hasWhatsapp, whatsappUrl } from '../contact';

describe('the landing contact link', () => {
  it('either has no number, or one wa.me can use', () => {
    // Empty is a legitimate state: the button renders nothing and the landing
    // simply has no contact affordance. What must never happen is a number
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
