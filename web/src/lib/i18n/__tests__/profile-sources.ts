import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { proPlatesSource, readProPlatesProfile } from '../../../../scripts/pro-plates-source.mjs';

export const SOURCE_ROOT = new URL('../../..', import.meta.url).pathname;

const unified = __PUBLIC_FEATURES__.proPlatesUnified;
const profile = proPlatesSource(() => unified);
const { unavailable, restored } = readProPlatesProfile(unified);
const sourcePath = (file: string) => `src/${relative(SOURCE_ROOT, file).split(sep).join('/')}`;

export function profileSourceFiles(directories: string[], extensions: RegExp): string[] {
  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        return ['__tests__', '__fixtures__'].includes(entry.name) ? [] : walk(file);
      }
      return extensions.test(file) && !unavailable.has(sourcePath(file)) ? [file] : [];
    });
  }

  return [
    ...directories.flatMap(directory => walk(join(SOURCE_ROOT, directory))),
    ...[...restored].filter(file => extensions.test(file) && directories.some(directory => file.startsWith(`src/${directory}/`)))
      .map(file => join(SOURCE_ROOT, file.slice('src/'.length))),
  ];
}

export const readProfileSource = profile.read;
