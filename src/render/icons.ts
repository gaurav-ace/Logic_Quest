import { svg } from './dom';

// Small line icons drawn here, so the app needs no icon font or library and works offline.
const PATHS = {
  learn: ['M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z', 'M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z'],
  progress: ['M4 19V5', 'M4 19h16', 'M8 15l3-4 3 2 5-6'],
  design: ['M3 4h7v5H3z', 'M14 15h7v5h-7z', 'M14 4h7v5h-7z', 'M10 6.5h4', 'M17.5 9v6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4L4.6 10.5a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGElement {
  const root = svg('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
  for (const d of PATHS[name]) root.append(svg('path', { d }));
  return root;
}
