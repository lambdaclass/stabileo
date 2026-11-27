/**
 * When opening the editor asks for an account (`editor_requires_account`): once the server's
 * settings are known and a stored session has been tried, never while one is being restored, and
 * not for an editor embedded in another page or a shared model's viewer.
 */
export interface EditorGateState {
  configKnown: boolean;
  restoring: boolean;
  required: boolean;
  signedIn: boolean;
  embedded: boolean;
  editorShown: boolean;
}

export function editorNeedsAccount(s: EditorGateState): boolean {
  return s.configKnown && !s.restoring && s.required && !s.signedIn && !s.embedded && s.editorShown;
}

export function framedByAnotherPage(win: Window = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}
