export function envStamp(env?: Record<string, string | undefined>): string;
export function sourceStamp(): string;
export function buildStamp(env?: Record<string, string | undefined>): string;
export function outputDigest(dir: string): string;
export function sealOf(dir: string, stamp: string): string;
