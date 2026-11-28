import type { ExamplePreview } from './preview-geometry';

let map = $state<Record<string, ExamplePreview> | null>(null);
let requested = false;

function request(): void {
  if (requested) return;
  requested = true;
  void import('./previews.generated.json').then((m) => { map = m.default as Record<string, ExamplePreview>; });
}

export const examplePreviews = {
  get(id: string): ExamplePreview | undefined {
    request();
    return map?.[id];
  },
};
