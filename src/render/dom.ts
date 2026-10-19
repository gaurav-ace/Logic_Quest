// Tiny DOM helpers shared by the screens. No framework: the app has a handful of elements.

type Attrs = Record<string, string | number>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function svg(tag: string, attrs: Attrs = {}): SVGElement {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function button(text: string, onTap: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = el('button', { type: 'button', ...attrs }, text);
  b.addEventListener('click', onTap);
  return b;
}

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function scrollTo(target: Element, block: ScrollLogicalPosition): void {
  target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block });
}
