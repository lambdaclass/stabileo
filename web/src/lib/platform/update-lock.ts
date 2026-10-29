let locked = false;
let installed = false;
let previousInert = false;

export function updateInProgress(): boolean { return locked; }

export function lockForUpdate(value: boolean): void {
  if (typeof document !== 'undefined') {
    if (!installed) {
      for (const type of ['keydown', 'pointerdown', 'click', 'paste', 'drop', 'beforeinput']) {
        window.addEventListener(type, (event) => {
          if (!locked) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        }, true);
      }
      installed = true;
    }
    if (value && !locked) previousInert = document.body.inert;
    document.body.inert = value || previousInert;
  }
  locked = value;
}
