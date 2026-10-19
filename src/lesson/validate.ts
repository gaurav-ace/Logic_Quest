import { classLayoutProblems, sequenceLayoutProblems, type ClassDiagram, type SequenceDiagram } from '../engine/uml';
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
  const common = ['schemaVersion', 'kind', 'id', 'title', 'track', 'level', 'objective', 'sources', 'simplifies', 'requires', 'quiz', 'company', 'basis', 'critique'];
  const own = kind === 'trace' ? ['program', 'diagrams', 'exercise'] : kind === 'sim' ? ['model', 'params', 'challenges'] : kind === 'design' ? ['diagrams', 'steps', 'exercise'] : ['nodes', 'edges', 'steps'];
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
  checkCompany(data, bad);
  if (data.critique !== undefined) {
    if (kind === 'design') bad('critique', 'design lessons have an exercise instead');
    else checkCritique(data.critique, bad);
  }
  if (kind === 'trace') {
    if (!isText(data.program) || !ID.test(data.program)) bad('program', 'must be a program id (lowercase words joined by hyphens)');
    if (data.exercise !== undefined || data.diagrams !== undefined) {
      const kinds = checkDiagrams(data, bad);
      checkExercise(data, kinds, bad);
    }
  } else if (kind === 'sim') {
    checkSim(data, bad);
  } else if (kind === 'design') {
    checkDesign(data, bad);
  } else {
    checkDiagram(data);
  }

  if (problems.length) throw new LessonValidationError(lessonId, problems);
  return data as unknown as Lesson;

  function checkDiagram(data: Obj): void {
    const nodeIds = new Set<string>();
    checkList(data.nodes, 'nodes', bad, (n, p) => checkNode(n, p, bad, nodeIds));
    checkSpacing(data.nodes, 'nodes', bad);
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

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

// The accuracy rule for real companies (CLAUDE.md Phase 5c): a "published" lesson must cite the
// company's own site; anything else is shown as "a plausible design", never as fact.
function checkCompany(data: Obj, bad: Bad): void {
  const c = data.company;
  if (c === undefined) {
    // Generic designs (no company named) need no basis.
    if (data.basis !== undefined) bad('basis', 'needs a company');
    return;
  }
  if (!isObj(c) || !isText(c.name) || !isTextList(c.domains) || !c.domains.length) return void bad('company', 'must be { name, domains: [...] }');
  for (const k of Object.keys(c)) if (!['name', 'domains'].includes(k)) bad(`company.${k}`, 'unknown field');
  if (data.basis !== 'published' && data.basis !== 'plausible') return void bad('basis', 'must be "published" or "plausible" for a lesson about a company');
  if (data.basis === 'published') {
    const sources = Array.isArray(data.sources) ? (data.sources as Obj[]) : [];
    const own = sources.some((s) => isObj(s) && isText(s.url) && (c.domains as string[]).some((d) => hostOf(s.url as string) === d || hostOf(s.url as string).endsWith(`.${d}`)));
    if (!own) bad('sources', `a "published" lesson must cite ${c.name}'s own site (${(c.domains as string[]).join(', ')})`);
  }
}

function checkCritique(cr: unknown, bad: Bad): void {
  const p = 'critique';
  if (!isObj(cr)) return void bad(p, 'must be an object');
  for (const k of Object.keys(cr)) if (!['prompt', 'nodes', 'edges', 'risks', 'hint', 'first', 'explain'].includes(k)) bad(`${p}.${k}`, 'unknown field');
  for (const k of ['prompt', 'hint', 'explain'] as const) if (!isText(cr[k])) bad(`${p}.${k}`, 'must be non-empty text');
  const ids = new Set<string>();
  checkList(cr.nodes, `${p}.nodes`, bad, (n, np) => checkNode(n, np, bad, ids));
  checkSpacing(cr.nodes, `${p}.nodes`, bad);
  if (!Array.isArray(cr.edges)) bad(`${p}.edges`, 'must be a list (it may be empty)');
  else cr.edges.forEach((e, i) => checkEdge(e, `${p}.edges[${i}]`, bad, ids));
  checkList(cr.risks, `${p}.risks`, bad, (r, rp) => {
    if (!isObj(r)) return void bad(rp, 'must be an object');
    for (const k of Object.keys(r)) if (!['text', 'real', 'why', 'nodes'].includes(k)) bad(`${rp}.${k}`, 'unknown field');
    if (!isText(r.text) || !isText(r.why) || typeof r.real !== 'boolean') bad(rp, 'needs text, real (true/false) and why');
    if (r.nodes !== undefined) {
      if (!isTextList(r.nodes)) bad(`${rp}.nodes`, 'must be a list of node ids');
      else for (const id of r.nodes) if (!ids.has(id)) bad(`${rp}.nodes`, `unknown node "${id}"`);
    }
  });
  const risks = Array.isArray(cr.risks) ? cr.risks.filter(isObj) : [];
  // A real review: some risks to find, and some decoys that sound worrying but aren't.
  if (risks.length && (risks.length < 3 || !risks.some((r) => r.real === true) || !risks.some((r) => r.real === false))) {
    bad(`${p}.risks`, 'needs at least 3 candidates, with at least one real risk and one decoy');
  }
  checkQuestion(cr.first, `${p}.first`, bad);
}

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

const CODE_W = 34;
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);

function checkDesign(data: Obj, bad: Bad): void {
  const kinds = checkDiagrams(data, bad);
  const diagrams = isObj(data.diagrams) ? data.diagrams : {};
  checkList(data.steps, 'steps', bad, (st, p) => {
    if (!isObj(st)) return void bad(p, 'must be an object');
    for (const k of Object.keys(st)) if (!['caption', 'diagram', 'highlight', 'call', 'code', 'predict'].includes(k)) bad(`${p}.${k}`, 'unknown field');
    if (!isText(st.caption)) bad(`${p}.caption`, 'must be non-empty text (it is the text alternative for the diagram)');
    if (!isText(st.diagram) || !kinds.has(st.diagram)) return void bad(`${p}.diagram`, 'must name one of the lesson\'s diagrams');
    const ids = kinds.get(st.diagram);
    if (st.highlight !== undefined) {
      if (!ids) bad(`${p}.highlight`, 'only class diagrams have classes to highlight');
      else if (!isTextList(st.highlight)) bad(`${p}.highlight`, 'must be a list of class ids');
      else for (const id of st.highlight) if (!ids.has(id)) bad(`${p}.highlight`, `unknown class "${id}"`);
    }
    if (st.call !== undefined) {
      const seq = diagrams[st.diagram] as Obj;
      const n = Array.isArray(seq.calls) ? seq.calls.length : 0;
      if (ids !== null) bad(`${p}.call`, 'only sequence diagrams have calls');
      else if (!(typeof st.call === 'number' && Number.isInteger(st.call) && st.call >= 0 && st.call < n)) bad(`${p}.call`, `must be a call index from 0 to ${n - 1}`);
    }
    if (st.code !== undefined) {
      // Blank lines are allowed in code, so only the type is checked.
      if (!(Array.isArray(st.code) && st.code.length && st.code.every((l) => typeof l === 'string'))) bad(`${p}.code`, 'must be a list of lines');
      else st.code.forEach((line, i) => {
        if (line.length > CODE_W) bad(`${p}.code[${i}]`, `is ${line.length} characters; at most ${CODE_W} fit a phone`);
      });
    }
    if (st.predict !== undefined) checkQuestion(st.predict, `${p}.predict`, bad);
  });
  checkExercise(data, kinds, bad);
}

/** Class ids per class diagram; sequence diagrams map to null. */
function checkDiagrams(data: Obj, bad: Bad): Map<string, Set<string> | null> {
  const diagrams = isObj(data.diagrams) ? data.diagrams : {};
  if (!isObj(data.diagrams) || !Object.keys(diagrams).length) bad('diagrams', 'must map names to at least one diagram');
  const kinds = new Map<string, Set<string> | null>();
  for (const [key, d] of Object.entries(diagrams)) {
    const p = `diagrams.${key}`;
    if (!isObj(d)) {
      bad(p, 'must be an object');
      continue;
    }
    if (d.type === 'class') {
      const ids = checkClassDiagram(d, p, bad);
      kinds.set(key, ids);
    } else if (d.type === 'sequence') {
      for (const k of Object.keys(d)) if (!['type', 'actors', 'calls'].includes(k)) bad(`${p}.${k}`, 'unknown field');
      const callsOk = Array.isArray(d.calls) && d.calls.length > 0 && d.calls.every((c) => isObj(c) && isText(c.from) && isText(c.to) && isText(c.label) && (c.reply === undefined || typeof c.reply === 'boolean'));
      if (!isTextList(d.actors)) bad(`${p}.actors`, 'must be a list of names');
      else if (!callsOk) bad(`${p}.calls`, 'must be a non-empty list of { from, to, label, reply? }');
      else for (const problem of sequenceLayoutProblems(d as unknown as SequenceDiagram)) bad(p, problem);
      kinds.set(key, null);
    } else {
      bad(`${p}.type`, 'must be "class" or "sequence"');
    }
  }

  return kinds;
}

function checkExercise(data: Obj, kinds: Map<string, Set<string> | null>, bad: Bad): void {
  const ex = data.exercise;
  if (!isObj(ex)) return void bad('exercise', 'must be an object');
  for (const k of Object.keys(ex)) if (!['change', 'flawed', 'fixed', 'edits', 'hint', 'fix', 'explain'].includes(k)) bad(`exercise.${k}`, 'unknown field');
  for (const k of ['change', 'hint', 'explain'] as const) if (!isText(ex[k])) bad(`exercise.${k}`, 'must be non-empty text');
  checkQuestion(ex.fix, 'exercise.fix', bad);
  const edits = isObj(ex.edits) ? ex.edits : {};
  for (const side of ['flawed', 'fixed'] as const) {
    const key = ex[side];
    const ids = isText(key) ? kinds.get(key) : undefined;
    if (!ids) {
      bad(`exercise.${side}`, 'must name a class diagram');
      continue;
    }
    const list = edits[side];
    // The fixed design may need no edits at all (the change is a new class): open for extension.
    if (!isTextList(list) || (side === 'flawed' && !list.length)) bad(`exercise.edits.${side}`, side === 'flawed' ? 'must list at least one class to edit' : 'must be a list of classes (it may be empty)');
    else for (const id of list) if (!ids.has(id)) bad(`exercise.edits.${side}`, `unknown class "${id}" in the ${side} design`);
  }
  // The whole point of the exercise: the fixed design must make the same change smaller.
  if (isTextList(edits.flawed) && isTextList(edits.fixed) && edits.fixed.length >= edits.flawed.length) {
    bad('exercise.edits', `the fixed design needs ${edits.fixed.length} edits and the flawed one ${edits.flawed.length}; the fix must need fewer`);
  }
  if (isText(ex.flawed) && ex.flawed === ex.fixed) bad('exercise.fixed', 'must be a different diagram from the flawed one');
}

function checkClassDiagram(d: Obj, p: string, bad: Bad): Set<string> {
  const ids = new Set<string>();
  for (const k of Object.keys(d)) if (!['type', 'classes', 'relations'].includes(k)) bad(`${p}.${k}`, 'unknown field');
  let ok = true;
  checkList(d.classes, `${p}.classes`, bad, (c, cp) => {
    if (!isObj(c)) {
      ok = false;
      return void bad(cp, 'must be an object');
    }
    for (const k of Object.keys(c)) if (!['id', 'name', 'kind', 'fields', 'methods', 'col', 'row'].includes(k)) bad(`${cp}.${k}`, 'unknown field');
    if (!isText(c.id) || !ID.test(c.id)) bad(`${cp}.id`, 'must be lowercase words joined by hyphens');
    else if (ids.has(c.id)) bad(`${cp}.id`, `duplicate class id "${c.id}"`);
    else ids.add(c.id);
    if (!isText(c.name)) bad(`${cp}.name`, 'must be non-empty text');
    if (c.kind !== undefined && c.kind !== 'interface' && c.kind !== 'abstract') bad(`${cp}.kind`, 'must be "interface" or "abstract"');
    for (const k of ['fields', 'methods'] as const) if (c[k] !== undefined && !isTextList(c[k])) bad(`${cp}.${k}`, 'must be a list of text');
    if (c.col !== 0 && c.col !== 1 && c.col !== 'both') bad(`${cp}.col`, 'must be 0, 1 or "both"');
    if (!(typeof c.row === 'number' && Number.isInteger(c.row) && c.row >= 0 && c.row < 6)) bad(`${cp}.row`, 'must be a row from 0 to 5');
    if (!isText(c.id) || !isText(c.name) || typeof c.row !== 'number' || (c.col !== 0 && c.col !== 1 && c.col !== 'both')) ok = false;
  });
  if (!Array.isArray(d.relations)) {
    bad(`${p}.relations`, 'must be a list (it may be empty)');
    return ids;
  }
  const seen = new Set<string>();
  d.relations.forEach((r: unknown, i) => {
    const rp = `${p}.relations[${i}]`;
    if (!isObj(r) || !isText(r.from) || !isText(r.to) || !['inherits', 'implements', 'has', 'uses'].includes(r.type as string)) {
      ok = false;
      return void bad(rp, 'must be { from, to, type } with type inherits, implements, has or uses');
    }
    for (const end of [r.from, r.to]) {
      if (ids.has(end)) continue;
      ok = false;
      bad(rp, `unknown class "${end}"`);
    }
    if (r.from === r.to) bad(rp, 'a class cannot relate to itself here');
    const key = [r.from, r.to].sort().join('|');
    if (seen.has(key)) bad(rp, 'two relations between the same classes would draw on top of each other');
    seen.add(key);
  });
  if (ok) for (const problem of classLayoutProblems(d as unknown as ClassDiagram)) bad(p, problem);
  return ids;
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
    const m = EDGE_MARGIN;
    const fits = node.x - w / 2 >= m && node.x + w / 2 <= DIAGRAM_W - m && node.y - NODE_H / 2 >= m && node.y + NODE_H / 2 <= DIAGRAM_H - m;
    if (!fits) bad(p, `box must sit at least ${m} units inside the ${DIAGRAM_W}x${DIAGRAM_H} diagram`);
  }
}

// Boxes that touch each other or the frame pass every "fits" check but read as one blob on a
// phone, and hide the edge between them. These margins are the smallest that look clearly apart.
const EDGE_MARGIN = 4;
const BOX_GAP = 6;

function checkSpacing(nodes: unknown, p: string, bad: Bad): void {
  if (!Array.isArray(nodes)) return;
  const boxes = nodes.filter((n): n is LessonNode => isObj(n) && typeof n.x === 'number' && typeof n.y === 'number');
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      const dx = Math.abs(a.x - b.x) - ((a.width ?? DEFAULT_NODE_W) + (b.width ?? DEFAULT_NODE_W)) / 2;
      const dy = Math.abs(a.y - b.y) - NODE_H;
      if (Math.max(dx, dy) < BOX_GAP) bad(p, `boxes "${a.id}" and "${b.id}" must be at least ${BOX_GAP} units apart`);
    }
  });
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
  if (step.time !== undefined && !(isText(step.time) && step.time.length <= 24)) bad(`${p}.time`, 'must be short text, e.g. "15:39 UTC"');
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
