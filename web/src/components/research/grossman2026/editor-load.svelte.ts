import { rs } from '../i18n';

export class EditorLoad {
  attempted = $state(false);
  loading = $state(false);
  src = $state<string | null>(null);
  error = $state<string | null>(null);
  private requestId = 0;
  private acceptedRequestId = 0;
  async load(encode: () => Promise<string>, isCurrent: () => boolean): Promise<boolean> {
    const id = ++this.requestId;
    this.attempted = true;
    this.loading = true;
    this.error = null;
    try {
      const url = await encode();
      if (id !== this.requestId) return false;
      if (isCurrent()) {
        this.acceptedRequestId = id;
        this.src = url;
        return true;
      }
      this.error = rs().springsEditorChanged;
    } catch (e) {
      if (id !== this.requestId) return false;
      this.error = `${rs().springsEditorFailed} ${e instanceof Error ? e.message : String(e)}`;
    }
    this.loading = false;
    return false;
  }
  loaded(src: string) {
    if (src === this.src && this.acceptedRequestId === this.requestId) this.loading = false;
  }
}

export async function openEditorWindow(encode: () => Promise<string>, open: () => Window | null, navigate: (url: string) => void) {
  const popup = open();
  try {
    if (popup) popup.opener = null;
    const url = await encode();
    if (popup) popup.location.href = url;
    else navigate(url);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
