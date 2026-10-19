import {
  SCHEMA_VERSION,
  type Edge,
  type Lesson,
  type LessonNode,
  type QuizQuestion,
  type Source,
  type Step,
} from './schema';

// Bad lesson data must fail loudly at load time (CLAUDE.md section 10), so the validator
// collects every problem with its path instead of stopping at the first one.

export class LessonValidationError extends Error {
  constructor(
    readonly lessonId: string,
    readonly problems: string[],
  ) {
    super(`Lesson "${lessonId}" is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'LessonValidationError';
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateLesson(data: unknown): Lesson {
  const problems: string[] = [];
  const bad = (path: string, msg: string) => problems.push(`${path}: ${msg}`);

  if (!isObj(data)) throw new LessonValidationError('(unknown)', ['lesson: must be an object']);
  const lessonId = isText(data.id) ? data.id : '(unknown)';

  // A misspelt optional key (e.g. "simplify") would otherwise vanish silently.
  const known = ['schemaVersion', 'id', 'title', 'objective', 'sources', 'simplifies', 'nodes', 'edges', 'steps', 'quiz'];
  for (const key of Object.keys(data)) if (!known.includes(key)) bad(key, 'unknown field');

  if (data.schemaVersion !== SCHEMA_VERSION) bad('schemaVersion', `must be ${SCHEMA_VERSION}`);
  if (!isText(data.id) || !ID.test(data.id)) bad('id', 'must be lowercase words joined by hyphens');
  for (const key of ['title', 'objective'] as const) if (!isText(data[key])) bad(key, 'must be non-empty text');
  if (data.simplifies !== undefined && !isText(data.simplifies)) bad('simplifies', 'must be non-empty text when present');

  checkList(data.sources, 'sources', bad, checkSource);
  const nodeIds = new Set<string>();
  checkList(data.nodes, 'nodes', bad, (n, p) => checkNode(n, p, bad, nodeIds));
  const edgeKeys = new Set<string>();
  checkList(data.edges, 'edges', bad, (e, p) => {
    if (checkEdge(e, p, bad, nodeIds)) {
      const key = edgeKey(e);
      if (edgeKeys.has(key)) bad(p, 'duplicate edge');
      edgeKeys.add(key);
    }
  });
  checkList(data.steps, 'steps', bad, (s, p) => checkStep(s, p, bad, nodeIds, edgeKeys));
  checkList(data.quiz, 'quiz', bad, (q, p) => checkQuestion(q, p, bad));

  if (problems.length) throw new LessonValidationError(lessonId, problems);
  return data as unknown as Lesson;

  function checkSource(s: unknown, p: string): void {
    if (!isObj(s)) return void bad(p, 'must be an object');
    const src = s as Partial<Source>;
    if (!isText(src.title)) bad(`${p}.title`, 'must be non-empty text');
    if (src.url !== undefined && !(isText(src.url) && src.url.startsWith('https://'))) bad(`${p}.url`, 'must start with https://');
  }
}

type Bad = (path: string, msg: string) => void;

function checkList(v: unknown, path: string, bad: Bad, each: (item: unknown, path: string) => void): void {
  if (!Array.isArray(v) || v.length === 0) return void bad(path, 'must be a non-empty list');
  v.forEach((item, i) => each(item, `${path}[${i}]`));
}

function checkNode(n: unknown, p: string, bad: Bad, ids: Set<string>): void {
  if (!isObj(n)) return void bad(p, 'must be an object');
  const node = n as Partial<LessonNode>;
  if (!isText(node.id)) bad(`${p}.id`, 'must be non-empty text');
  else if (ids.has(node.id)) bad(`${p}.id`, `duplicate node id "${node.id}"`);
  else ids.add(node.id);
  if (!isText(node.label)) bad(`${p}.label`, 'must be non-empty text');
  for (const axis of ['x', 'y'] as const) {
    if (typeof node[axis] !== 'number' || !Number.isFinite(node[axis])) bad(`${p}.${axis}`, 'must be a number');
  }
}

function checkEdge(e: unknown, p: string, bad: Bad, nodeIds: Set<string>): e is Edge {
  if (!Array.isArray(e) || e.length !== 2 || !e.every(isText)) {
    bad(p, 'must be a pair of node ids');
    return false;
  }
  let ok = true;
  for (const id of e) {
    if (!nodeIds.has(id)) {
      bad(p, `unknown node "${id}"`);
      ok = false;
    }
  }
  if (e[0] === e[1]) {
    bad(p, 'an edge cannot connect a node to itself');
    ok = false;
  }
  return ok;
}

const edgeKey = ([a, b]: Edge) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function checkStep(s: unknown, p: string, bad: Bad, nodeIds: Set<string>, edgeKeys: Set<string>): void {
  if (!isObj(s)) return void bad(p, 'must be an object');
  const step = s as Partial<Step>;
  if (!isText(step.caption)) bad(`${p}.caption`, 'must be non-empty text (it is the text alternative for the animation)');
  if (!Array.isArray(step.highlight)) bad(`${p}.highlight`, 'must be a list of node ids');
  else step.highlight.forEach((id, i) => {
    if (!nodeIds.has(id)) bad(`${p}.highlight[${i}]`, `unknown node "${String(id)}"`);
  });
  if (!Array.isArray(step.path)) return void bad(`${p}.path`, 'must be a list of hops');
  step.path.forEach((hop, i) => {
    const hp = `${p}.path[${i}]`;
    if (checkEdge(hop, hp, bad, nodeIds) && !edgeKeys.has(edgeKey(hop))) {
      bad(hp, `no edge between "${hop[0]}" and "${hop[1]}"`);
    }
  });
}

function checkQuestion(q: unknown, p: string, bad: Bad): void {
  if (!isObj(q)) return void bad(p, 'must be an object');
  const question = q as Partial<QuizQuestion>;
  if (!isText(question.prompt)) bad(`${p}.prompt`, 'must be non-empty text');
  if (!Array.isArray(question.options) || question.options.length < 2) {
    return void bad(`${p}.options`, 'must have at least 2 options');
  }
  question.options.forEach((o: unknown, i) => {
    const op = `${p}.options[${i}]`;
    if (!isObj(o)) return void bad(op, 'must be an object');
    if (!isText(o.text)) bad(`${op}.text`, 'must be non-empty text');
    if (!isText(o.explanation)) bad(`${op}.explanation`, 'must explain why this option is right or wrong');
  });
  const a = question.answer;
  if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a >= question.options.length) {
    bad(`${p}.answer`, `must be an option index from 0 to ${question.options.length - 1}`);
  }
}
