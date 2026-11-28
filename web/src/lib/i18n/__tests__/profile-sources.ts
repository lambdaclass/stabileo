import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE_ROOT = new URL('../../..', import.meta.url).pathname;

export function profileSourceFiles(directories: string[], extensions: RegExp): string[] {
  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) {
        return ['__tests__', '__fixtures__'].includes(entry.name) ? [] : walk(file);
      }
      return extensions.test(file) ? [file] : [];
    });
  }

  return directories.flatMap(directory => walk(join(SOURCE_ROOT, directory)));
}

export const readProfileSource = (path: string) => readFileSync(path, 'utf8');
