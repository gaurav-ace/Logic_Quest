// Posts the twice-daily reminder to Discord. Run by .github/workflows/reminder.yml.
//
//   node scripts/reminder.ts [--dry-run] [--slot morning|evening]
//
// The webhook URL comes only from the DISCORD_WEBHOOK_URL environment variable (a repository
// secret in GitHub). It is never printed: the URL itself is the credential.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMessage, slotFor, webhookBody, type ReminderLesson } from '../src/reminder/message.ts';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slotArg = args.includes('--slot') ? args[args.indexOf('--slot') + 1] : process.env.REMINDER_SLOT;
const slot = slotFor(process.env.REMINDER_SCHEDULE, slotArg);

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
