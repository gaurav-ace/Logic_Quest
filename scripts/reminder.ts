// Posts the twice-daily reminder to Discord. Run by .github/workflows/reminder.yml.
//
//   node scripts/reminder.ts [--dry-run] [--slot morning|evening]
//   node scripts/reminder.ts --decide   (in the workflow: should this run post? see shouldSend)
//
// The webhook URL comes only from the DISCORD_WEBHOOK_URL environment variable (a repository
// secret in GitHub). It is never printed: the URL itself is the credential.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMessage, shouldSend, slotFor, webhookBody, type PastRun, type ReminderLesson } from '../src/reminder/message.ts';

/** The workflow step that posts; must match its name in reminder.yml. */
const SEND_STEP = 'Send the reminder';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slotArg = args.includes('--slot') ? args[args.indexOf('--slot') + 1] : process.env.REMINDER_SLOT;
const slot = slotFor(process.env.REMINDER_SCHEDULE, slotArg);

if (args.includes('--decide')) {
  const past = await pastRuns().catch((e: unknown) => {
    console.log(`Couldn't read earlier runs (${e instanceof Error ? e.message : String(e)}).`);
    return null;
  });
  const { send, reason } = shouldSend(slot, new Date(), process.env.GITHUB_EVENT_NAME !== 'schedule', past);
  console.log(`${slot}: ${send ? 'send' : 'skip'}. ${reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `send=${send}\n`);
  process.exit(0);
}

/** This workflow's runs from the last day, other than this one, and whether each one posted. */
async function pastRuns(): Promise<PastRun[]> {
  const api = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions`;
  // The repo is public, so a local try-out works without a token.
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = async (url: string) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return res.json();
  };
  const since = Date.now() - 86_400_000;
  const { workflow_runs: runs } = (await get(`${api}/workflows/reminder.yml/runs?per_page=30`)) as { workflow_runs: { id: number; run_started_at: string }[] };
  const recent = runs.filter((r) => String(r.id) !== process.env.GITHUB_RUN_ID && Date.parse(r.run_started_at) > since);
  return Promise.all(
    recent.map(async (r) => {
      const { jobs } = (await get(`${api}/runs/${r.id}/jobs`)) as { jobs: { steps?: { name: string; conclusion: string | null }[] }[] };
      const sent = jobs.some((j) => (j.steps ?? []).some((s) => s.name === SEND_STEP && s.conclusion === 'success'));
      return { startedAt: new Date(r.run_started_at), sent };
    }),
  );
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lessons');
const lessons: ReminderLesson[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReminderLesson);
const content = buildMessage(slot, lessons, new Date());

if (dryRun) {
  console.log(`[dry run] ${slot} message, ${content.length} characters:\n${content}`);
  process.exit(0);
}

const hook = process.env.DISCORD_WEBHOOK_URL ?? '';
// Only Discord's own webhook endpoint, so a mistyped secret can't post the message somewhere else.
if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(hook)) {
  console.error('DISCORD_WEBHOOK_URL is missing or is not a Discord webhook URL. Add it under Settings > Secrets and variables > Actions.');
  process.exit(1);
}

const res = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: webhookBody(content) });
if (!res.ok) {
  // The response body can't contain the URL, but keep the log to the status to be safe.
  console.error(`Discord answered ${res.status} ${res.statusText}. The reminder was not sent.`);
  process.exit(1);
}
console.log(`Sent the ${slot} reminder (${content.length} characters).`);
