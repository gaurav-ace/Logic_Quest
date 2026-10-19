import {
  DEFAULT_NODE_W,
  KINDS,
  LEVELS,
  TRACKS,
  DIAGRAM_H,
  DIAGRAM_W,
  NODE_H,
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

  const kind = data.kind;
  if (!KINDS.includes(kind as never)) bad('kind', `must be one of ${KINDS.join(', ')}`);

  // A misspelt optional key (e.g. "simplify") would otherwise vanish silently.
  const common = ['schemaVersion', 'kind', 'id', 'title', 'track', 'level', 'objective', 'sources', 'simplifies', 'requires', 'quiz'];
  const own = kind === 'trace' ? ['program'] : kind === 'sim' ? ['model', 'params', 'challenges'] : ['nodes', 'edges', 'steps'];
  const known = [...common, ...own];
  for (const key of Object.keys(data)) if (!known.includes(key)) bad(key, 'unknown field');

  if (data.schemaVersion !== SCHEMA_VERSION) bad('schemaVersion', `must be ${SCHEMA_VERSION}`);
  if (!isText(data.id) || !ID.test(data.id)) bad('id', 'must be lowercase words joined by hyphens');
  for (const key of ['title', 'objective'] as const) if (!isText(data[key])) bad(key, 'must be non-empty text');
  if (!TRACKS.includes(data.track as never)) bad('track', `must be one of ${TRACKS.join(', ')}`);
  if (!LEVELS.includes(data.level as never)) bad('level', `must be one of ${LEVELS.join(', ')}`);
  if (data.simplifies !== undefined && !isText(data.simplifies)) bad('simplifies', 'must be non-empty text when present');

  checkList(data.sources, 'sources', bad, checkSource);
  if (data.requires !== undefined && !(Array.isArray(data.requires) && data.requires.every((r) => isText(r) && ID.test(r)))) {
    bad('requires', 'must be a list of lesson ids');
  }
  checkList(data.quiz, 'quiz', bad, (q, p) => checkQuestion(q, p, bad));
  if (kind === 'trace') {
    if (!isText(data.program) || !ID.test(data.program)) bad('program', 'must be a program id (lowercase words joined by hyphens)');
  } else if (kind === 'sim') {
    checkSim(data, bad);
  } else {
    checkDiagram(data);
  }

  if (problems.length) throw new LessonValidationError(lessonId, problems);
  return data as unknown as Lesson;

  function checkDiagram(data: Obj): void {
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
  }

  function checkSource(s: unknown, p: string): void {
    if (!isObj(s)) return void bad(p, 'must be an object');
    const src = s as Partial<Source>;
    if (!isText(src.title)) bad(`${p}.title`, 'must be non-empty text');
    if (src.url !== undefined && !(isText(src.url) && src.url.startsWith('https://'))) bad(`${p}.url`, 'must start with https://');
  }
}

type Bad = (path: string, msg: string) => void;

const isParams = (v: unknown) => isObj(v) && Object.values(v).every((x) => typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)));

// Shape only: whether the model, metrics, controls and actions exist is checked by the catalog,
// which knows the registered models.
function checkSim(data: Obj, bad: Bad): void {
  if (!isText(data.model) || !ID.test(data.model)) bad('model', 'must be a model id (lowercase words joined by hyphens)');
  if (data.params !== undefined && !isParams(data.params)) bad('params', 'must map control ids to numbers or true/false');
  const ids = new Set<string>();
  checkList(data.challenges, 'challenges', bad, (c, p) => {
    if (!isObj(c)) return void bad(p, 'must be an object');
    for (const key of Object.keys(c)) if (!['id', 'title', 'prompt', 'predict', 'setup', 'goal', 'hint', 'explain', 'solution'].includes(key)) bad(`${p}.${key}`, 'unknown field');
    if (!isText(c.id) || !ID.test(c.id)) bad(`${p}.id`, 'must be lowercase words joined by hyphens');
    else if (ids.has(c.id)) bad(`${p}.id`, `duplicate challenge id "${c.id}"`);
    else ids.add(c.id);
    for (const key of ['title', 'prompt', 'hint', 'explain'] as const) if (!isText(c[key])) bad(`${p}.${key}`, 'must be non-empty text');
    if (c.predict !== undefined) checkQuestion(c.predict, `${p}.predict`, bad);
    if (!isParams(c.solution)) bad(`${p}.solution`, 'must map control ids to numbers or true/false');
    const g = c.goal;
    if (!isObj(g) || !isText(g.metric) || (g.op !== '<=' && g.op !== '>=') || typeof g.value !== 'number' || typeof g.forSeconds !== 'number' || g.forSeconds <= 0) {
      bad(`${p}.goal`, 'needs metric, op ("<=" or ">="), value and forSeconds > 0');
    } else if (g.fromStart !== undefined && typeof g.fromStart !== 'boolean') {
      bad(`${p}.goal.fromStart`, 'must be true or false');
    }
    if (c.setup !== undefined) {
      const st = c.setup;
      if (!isObj(st)) return void bad(`${p}.setup`, 'must be an object');
      if (st.params !== undefined && !isParams(st.params)) bad(`${p}.setup.params`, 'must map control ids to numbers or true/false');
      if (st.lock !== undefined && !(Array.isArray(st.lock) && st.lock.every(isText))) bad(`${p}.setup.lock`, 'must be a list of control ids');
      if (st.actions !== undefined && !(Array.isArray(st.actions) && st.actions.every((a) => isObj(a) && typeof a.at === 'number' && a.at >= 0 && isText(a.action)))) {
        bad(`${p}.setup.actions`, 'must be a list of { at, action }');
      }
    }
  });
}

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
  if (node.width !== undefined && !(typeof node.width === 'number' && node.width >= 40 && node.width <= 400)) {
    bad(`${p}.width`, 'must be a number from 40 to 400');
  }
  for (const key of Object.keys(n)) if (!['id', 'label', 'x', 'y', 'width'].includes(key)) bad(`${p}.${key}`, 'unknown field');
  const w = typeof node.width === 'number' ? node.width : DEFAULT_NODE_W;
  if (typeof node.x === 'number' && typeof node.y === 'number') {
    const fits = node.x - w / 2 >= 0 && node.x + w / 2 <= DIAGRAM_W && node.y - NODE_H / 2 >= 0 && node.y + NODE_H / 2 <= DIAGRAM_H;
    if (!fits) bad(p, `box does not fit inside the ${DIAGRAM_W}x${DIAGRAM_H} diagram`);
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
  if (step.predict !== undefined) checkQuestion(step.predict, `${p}.predict`, bad);
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
