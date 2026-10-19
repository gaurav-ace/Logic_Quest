import './styles.css';
import hello from '../lessons/hello.json';
import { LessonValidationError, validateLesson } from './lesson/validate';
import { renderLesson } from './render/lesson';

const APP_NAME = 'Logic Quest';

function start(root: HTMLElement): void {
  const heading = document.createElement('h1');
  heading.textContent = APP_NAME;
  const view = document.createElement('div');
  root.replaceChildren(heading, view);
  try {
    renderLesson(view, validateLesson(hello));
  } catch (e) {
    // Bad lesson data must fail loudly, on screen as well as in the console.
    const box = document.createElement('pre');
    box.className = 'card load-error';
    box.textContent = e instanceof LessonValidationError ? e.message : `Could not load the lesson: ${String(e)}`;
    view.replaceChildren(box);
    throw e;
  }
}

const root = document.getElementById('app');
if (root) start(root);
