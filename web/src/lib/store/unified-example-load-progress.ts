import type { LoadExampleModel } from './example-load-progress';
import { exampleProgress } from './example-progress.svelte';
import { nextFrame } from './mesh-progress.svelte';

export async function withExampleProgress(name: string, load: LoadExampleModel): Promise<void> {
  exampleProgress.begin(name);
  try {
    await nextFrame();
    await load(async () => {
      exampleProgress.step('loads');
      await nextFrame();
    });
    exampleProgress.step('draw');
    await nextFrame();
  } finally {
    exampleProgress.end();
  }
}
