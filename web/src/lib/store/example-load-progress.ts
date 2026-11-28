export const generateExampleLoads: typeof import('./saved-loads').generateSavedLoads | undefined = undefined;

export type LoadExampleModel = (beforeLoads?: () => Promise<void>) => Promise<void>;

export function withExampleProgress(_name: string, load: LoadExampleModel): Promise<void> {
  return load();
}
