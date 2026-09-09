/**
 * The one place the public contact number lives.
 *
 * International format, digits only — no `+`, no spaces, no dashes. That is
 * what wa.me expects, and anything else silently opens WhatsApp on an invalid
 * contact rather than failing visibly.
 *
 * While this is empty the button does not render at all. A contact button that
 * opens a chat with the wrong number is worse than no contact button, so the
 * failure mode here is "absent", never "wrong".
 */
// Typed as `string`, not left to infer its literal type: this is
// configuration, and code that checks whether it is set must be allowed to
// compare it against ''.
export const WHATSAPP_NUMBER: string = '5491138563881';

/** True when the landing has a number to offer. */
export const hasWhatsapp = () => /^\d{8,15}$/.test(WHATSAPP_NUMBER);

/**
 * A chat link, with the opening line already written.
 *
 * The prefill is not decoration: it tells whoever receives the message where
 * the person came from, which is the difference between a useful lead and an
 * unknown number saying "hola".
 */
export function whatsappUrl(greeting: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(greeting)}`;
}
