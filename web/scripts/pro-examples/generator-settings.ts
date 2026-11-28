/**
 * The load generator's settings an example saves, as the generator dialog saves them on each role
 * it configures (`roleSettingsOf`): the gallery writes the loads from them when the example opens
 * (`store/saved-loads.ts`), and the dialog opens on them.
 */
import { defaultRegulations, REGULATIONS_SCHEMA_VERSION, type StoredRegulations } from '../../src/lib/codes/roles';
import { autoLoadsDefaults, type AutoLoadsMemory } from '../../src/components/pro/auto-loads-memory';
import { roleSettingsOf } from '../../src/components/pro/auto-loads-plan';

export type GeneratorSettings = Partial<AutoLoadsMemory>;

/** A new project's regulations with `settings` over the dialog's defaults saved on their roles. */
export function generatorRegulations(settings: GeneratorSettings): StoredRegulations {
  const roles = defaultRegulations();
  const memory: AutoLoadsMemory = { ...autoLoadsDefaults(roles), ...settings };
  for (const [role, saved] of roleSettingsOf(memory)) roles[role] = { ...roles[role], settings: { ...roles[role].settings, ...saved }, configComplete: true };
  return { version: REGULATIONS_SCHEMA_VERSION, roles };
}
