/**
 * How to reach Stabileo — the one description of it, for every surface.
 *
 * The landing's corner button and the editor's header button offer the same
 * five channels. They render differently, because a marketing page and an
 * application header are not the same kind of place, but WHAT they offer is
 * one list: the accounts, the number, the marks, and the languages each
 * account is actually written in.
 *
 * Two copies of that list would drift, and the drift would be silent — nobody
 * compares a footer against a popover against a header menu. So the copy that
 * exists is this one, and the components hold only their own layout.
 */

/**
 * The public contact number.
 *
 * International format, digits only — no `+`, no spaces, no dashes. That is
 * what wa.me expects, and anything else silently opens WhatsApp on an invalid
 * contact rather than failing visibly.
 *
 * While this is empty the channel does not render at all. A contact link that
 * opens a chat with the wrong number is worse than no contact link, so the
 * failure mode here is "absent", never "wrong".
 *
 * Typed as `string`, not left to infer its literal type: this is
 * configuration, and code that checks whether it is set must be allowed to
 * compare it against ''.
 */
export const WHATSAPP_NUMBER: string = '5491138563881';

/** True when there is a number to offer. */
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

/**
 * The accounts, as the footer lists them.
 *
 * The label is the handle, not the platform: someone scanning a footer already
 * knows what Instagram is; what they do not know is what to search for.
 */
export const SOCIAL_LINKS = [
  { id: 'instagram', label: 'stabileoapp', href: 'https://www.instagram.com/stabileoapp/' },
  { id: 'x', label: '@stabileoapp', href: 'https://x.com/Stabileoapp' },
  { id: 'linkedin', label: 'Stabileo', href: 'https://www.linkedin.com/company/stabileo' },
  { id: 'discord', label: 'Discord', href: 'https://discord.gg/Q53rp7FKXA' },
  { id: 'ergodic', label: 'Ergodic Group', href: 'https://ergodicgroup.com/' },
] as const;

/**
 * What language each channel is actually written in.
 *
 * Not translated, and not derived from the reader's locale: these describe the
 * ACCOUNT, so they read the same in every language. A Portuguese reader learns
 * that Instagram is kept in Spanish, which is the point — the alternative is
 * following an account they cannot read, or writing a message that gets an
 * answer they cannot read.
 */
export const CHANNEL_LANGS: Record<string, string> = {
  whatsapp: 'EN/ES',
  instagram: 'ES',
  x: 'EN',
  linkedin: 'ES',
  discord: 'EN/ES',
};

/**
 * The marks, in one place.
 *
 * Inline strings rather than files: the page fetches nothing from a third
 * party, and five logos are not a reason to hand every visitor to someone
 * else's server. They are authored markup, not user input, so `{@html}` is
 * safe here and nowhere near a value that came from outside.
 */
export const SOCIAL_ICONS: Record<string, string> = {
  whatsapp: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.84-.85 2.03 0 1.2.87 2.35.99 2.51.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.1a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M18.2 2.3h3.3l-7.2 8.2 8.5 11.2h-6.7l-5.2-6.8-6 6.8H1.6l7.7-8.8L1.2 2.3H8l4.7 6.2zm-1.2 17.7h1.8L7.1 4.2H5.2z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20.3 4.9A16.5 16.5 0 0 0 16.2 3.6l-.2.4a15.3 15.3 0 0 1 3.6 1.8 14.6 14.6 0 0 0-11.2 0 15.3 15.3 0 0 1 3.6-1.8l-.2-.4A16.5 16.5 0 0 0 3.7 4.9 20.4 20.4 0 0 0 .8 18.6a16.6 16.6 0 0 0 5 2.5l1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 10.1 0l.4.3a10.8 10.8 0 0 1-1.7.8l1 1.7a16.6 16.6 0 0 0 5-2.5 20.4 20.4 0 0 0-2.9-13.7zM8.5 15.4a1.9 1.9 0 0 1 0-3.8 1.9 1.9 0 0 1 0 3.8zm7 0a1.9 1.9 0 0 1 0-3.8 1.9 1.9 0 0 1 0 3.8z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 2.5 6 2.5 2.5 0 0 1 4.98 3.5zM3 8.98h4v12H3zM9.5 8.98h3.8v1.64h.06a4.2 4.2 0 0 1 3.78-2.08c4 0 4.76 2.63 4.76 6.05v6.4h-4v-5.68c0-1.35 0-3.1-1.9-3.1s-2.2 1.48-2.2 3v5.78h-4z"/></svg>',
};

export type ContactChannel = {
  id: string;
  label: string;
  href: string;
  /** 'EN/ES', 'ES', … — empty when the channel has no stated language. */
  langs: string;
  /** The mark, as authored SVG markup. */
  icon: string;
};

/**
 * The channels a contact menu offers, in the order it offers them.
 *
 * WhatsApp first — it is the only one that reaches a person directly — then
 * the accounts the footer lists. Ergodic Group is in SOCIAL_LINKS and not
 * here: this answers "how do I reach you", and the company's own site is not
 * a way to reach anybody.
 *
 * `greeting` is the prefilled first line of the WhatsApp message, which is
 * the caller's because it is the only part of this that is translated.
 */
export function contactChannels(greeting: string): ContactChannel[] {
  const wa = hasWhatsapp()
    ? [{ id: 'whatsapp', label: 'WhatsApp', href: whatsappUrl(greeting) }]
    : [];
  return [...wa, ...SOCIAL_LINKS.filter((s) => s.id in SOCIAL_ICONS && s.id !== 'ergodic')].map(
    (c) => ({ ...c, langs: CHANNEL_LANGS[c.id] ?? '', icon: SOCIAL_ICONS[c.id] })
  );
}
