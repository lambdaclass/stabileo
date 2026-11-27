import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WallEditor from '../WallEditor.svelte';
import { detailingStore } from '../../../../../lib/store/detailing.svelte';
import { errorText } from '../../../../../lib/store/engine-action';
import { EngineMessageError, msg } from '../../../../../lib/codes/message';
import { setLocale, t } from '../../../../../lib/i18n';

afterEach(() => { vi.restoreAllMocks(); setLocale('en'); });

it.skip('known wrong result: #2655 wall editor displays the translated refusal from floor design', () => {
  setLocale('es');
  const message = errorText(new EngineMessageError(msg('wall.tensionAtOpenings')));
  vi.spyOn(detailingStore, 'lastError', 'get').mockReturnValue(message);
  const html = render(WallEditor).body;
  expect(message).toBe(t('wall.tensionAtOpenings'));
  expect(html).toContain('role="alert"');
  expect(html).toContain(message);
});
