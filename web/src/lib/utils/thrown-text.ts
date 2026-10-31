export function errorText(e: unknown, fallback: string): string {
  if (typeof e === 'string') return e.trim() ? e : fallback;
  const message = (e as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
