const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'stroke-linejoin', 'stroke-linecap'] as const;

/** A standalone copy of a drawn SVG: CSS variables and classes resolved into attributes, on a solid background. */
export function standaloneSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const source = [svg, ...svg.querySelectorAll('*')];
  const target = [clone, ...clone.querySelectorAll('*')];
  source.forEach((el, i) => {
    const style = getComputedStyle(el);
    const out = target[i] as SVGElement;
    for (const prop of PAINT) {
      const value = style.getPropertyValue(prop);
      if (value) out.setAttribute(prop, value);
    }
    out.removeAttribute('class');
  });
  const box = svg.viewBox.baseVal;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(box.x));
  bg.setAttribute('y', String(box.y));
  bg.setAttribute('width', String(box.width));
  bg.setAttribute('height', String(box.height));
  bg.setAttribute('fill', getComputedStyle(svg).getPropertyValue('--mh-sheet').trim() || '#0f1e2b');
  clone.insertBefore(bg, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadSvg(svg: SVGSVGElement, name: string) {
  save(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }), `${name}.svg`);
}

export async function downloadPng(svg: SVGSVGElement, name: string, scale = 2) {
  const box = svg.viewBox.baseVal;
  const url = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.width * scale);
    canvas.height = Math.round(box.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) save(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
