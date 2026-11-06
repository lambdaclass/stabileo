const MARK = '<svg viewBox="0 0 32 32" width="48" height="48" aria-hidden="true" focusable="false"><polygon points="16,4 29,27 3,27" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"></polygon></svg>';

export function showAppBoot(target: HTMLElement): HTMLElement {
  const boot = document.createElement('div');
  boot.dataset.testid = 'app-boot';
  boot.setAttribute('aria-hidden', 'true');
  boot.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--st-bg);color:var(--st-text-2)';
  boot.innerHTML = MARK;
  target.append(boot);
  return boot;
}
