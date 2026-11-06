import { refusedWithCode } from './containment-error';
import { eigenRefusalText } from './finite-spectrum-warning';
import { errorText } from '../utils/error-text';
import { localizeEngineText } from '../i18n/engine-text';

/** The toast for a failed buckling run: no compressed bar is an answer, anything else an error. */
export function bucklingFailureToast(e: unknown, t: (key: string) => string): { text: string; kind: 'info' | 'error' } {
  if (refusedWithCode(e, 'no_compressed_elements')) return { text: t('toast.bucklingNoCompression'), kind: 'info' };
  return { text: eigenRefusalText(localizeEngineText(errorText(e, t('toast.bucklingError'))), t), kind: 'error' };
}
