/**
 * Whether a mode works in space: Basic 3D and PRO. PRO is always a space workspace, so a check for
 * '3d' alone treats it as a plane one: #245's kinematic panel counted PRO frames as their XY
 * projection. Every dimension check goes through this; comparing a mode with '3d' is only for
 * asking which mode it is (the Basic mode buttons). `web/src/lib/utils/__tests__/workspace-gate.test.ts`
 * keeps it so.
 */
export function is3DWorkspace(mode: string): boolean {
  return mode === '3d' || mode === 'pro';
}
