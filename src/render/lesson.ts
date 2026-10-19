import { packetPosition, type Point } from '../engine/packet';
import type { DiagramLesson, Lesson } from '../lesson/schema';
import { buildDiagram } from './diagram';
import { el } from './dom';
import type { QuizHooks } from './quiz';
import { renderStepped, type LessonView, type Stage } from './stepped';
import { renderTrace } from './trace';

export type { LessonView } from './stepped';

export function renderLesson(root: HTMLElement, lesson: Lesson, hooks: QuizHooks): LessonView {
  return lesson.kind === 'trace' ? renderTrace(root, lesson, hooks) : renderStepped(root, lesson, diagramStage(lesson), hooks);
}

function diagramStage(lesson: DiagramLesson): Stage {
  const byId = new Map(lesson.nodes.map((n) => [n.id, n]));
  const at = (id: string): Point => byId.get(id)!; // ids were checked by validateLesson
  const diagram = buildDiagram(lesson);
  const element = el('div', { class: 'card stage' });
  element.append(diagram.element);
  return {
    element,
    steps: lesson.steps.map((s) => ({ caption: s.caption, hops: s.path.length, ...(s.predict ? { predict: s.predict } : {}) })),
    draw(index, progress, revealed) {
      if (revealed) {
        const step = lesson.steps[index]!;
        diagram.highlight(step.highlight);
        diagram.placePacket(packetPosition(step.path, at, progress));
        return;
      }
      // Asking "what happens next?": show where the previous step ended.
      const prev = lesson.steps[index - 1];
      diagram.highlight(prev?.highlight ?? []);
      diagram.placePacket(prev ? packetPosition(prev.path, at, 1) : null);
    },
  };
}
