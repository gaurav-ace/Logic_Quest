import type { Point } from '../engine/packet';
import type { Lesson } from '../lesson/schema';
import { svg } from './dom';

export const NODE_W = 104;
const NODE_H = 46;

export interface Diagram {
  element: SVGElement;
  highlight(ids: string[]): void;
  /** null hides the packet (a step with no path). */
  placePacket(at: Point | null): void;
}

export function buildDiagram(lesson: Lesson): Diagram {
  const byId = new Map(lesson.nodes.map((n) => [n.id, n]));
  const root = svg('svg', { viewBox: '0 0 420 200', role: 'img', 'aria-label': `Diagram: ${lesson.title}` });

  for (const [a, b] of lesson.edges) {
    const p = byId.get(a)!;
    const q = byId.get(b)!;
    root.append(svg('line', { class: 'edge', x1: p.x, y1: p.y, x2: q.x, y2: q.y }));
  }
  // Drawn under the nodes, so the packet slides behind a box when it arrives instead of covering its label.
  const packet = svg('circle', { class: 'packet', r: 8, cx: -20, cy: -20 });
  root.append(packet);

  const nodeEls = new Map<string, SVGElement>();
  for (const n of lesson.nodes) {
    const w = NODE_W;
    const g = svg('g', { class: 'node' });
    g.append(svg('rect', { x: n.x - w / 2, y: n.y - NODE_H / 2, width: w, height: NODE_H, rx: 10 }));
    const label = svg('text', { x: n.x, y: n.y });
    label.textContent = n.label;
    g.append(label);
    root.append(g);
    nodeEls.set(n.id, g);
  }

  return {
    element: root,
    highlight(ids) {
      for (const [id, g] of nodeEls) g.classList.toggle('on', ids.includes(id));
    },
    placePacket(at) {
      packet.setAttribute('visibility', at ? 'visible' : 'hidden');
      if (at) {
        packet.setAttribute('cx', String(at.x));
        packet.setAttribute('cy', String(at.y));
      }
    },
  };
}
