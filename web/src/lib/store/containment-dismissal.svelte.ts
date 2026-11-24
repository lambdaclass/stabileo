/**
 * The analysis notice over the model, put away by the user: for this session and these messages only, so a
 * new or different notice speaks again. Hiding it changes nothing the results or the design do.
 */
let dismissed = $state<string | null>(null);

const signature = (messages: readonly string[]) => messages.join('\n');

export const containmentDismissal = {
  isDismissed(messages: readonly string[]): boolean { return messages.length > 0 && dismissed === signature(messages); },
  dismiss(messages: readonly string[]): void { dismissed = signature(messages); },
  restore(): void { dismissed = null; },
  get any(): boolean { return dismissed !== null; },
};
