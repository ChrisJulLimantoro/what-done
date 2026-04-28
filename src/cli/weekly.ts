import { createInterface } from 'node:readline';
import { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { buildWeeklyPrompt } from '../llm/prompts.js';
import { createRouter } from '../llm/router.js';
import { loadSnapshotsRange, getMissingDates } from '../store/snapshots.js';
import { renderWeekly, renderWarning, renderMissingDates, renderInfo } from './renderer.js';
import { generateSnapshot } from './today.js';
import { localDateString } from '../utils/date.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateString(d);
}

function todayDate(): string {
  return localDateString(new Date());
}

export function weeklyCommand(): Command {
  return new Command('weekly')
    .description('Summarize the past 7 days of activity')
    .option('--since <date>', 'Start date (YYYY-MM-DD), defaults to 7 days ago')
    .option('--provider <name>', 'Override LLM provider (anthropic|gemini|openai)')
    .action(async (opts: { since?: string; provider?: string }) => {
      const config = loadConfig();
      const startDate = opts.since ?? daysAgo(6);
      const endDate = todayDate();

      let snapshots = loadSnapshotsRange(startDate, endDate);
      const missing = getMissingDates(startDate, endDate);

      if (snapshots.length === 0 && missing.length === 0) {
        renderWarning(`No activity found between ${startDate} and ${endDate}.`);
        return;
      }

      if (missing.length > 0) {
        renderMissingDates(missing);

        const answer = await new Promise<string>((resolve) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          rl.question('Generate missing snapshots now? (y/n) ', (ans) => {
            rl.close();
            resolve(ans);
          });
        });

        if (answer.trim().toLowerCase().startsWith('y')) {
          for (const date of missing) {
            renderInfo(`Generating snapshot for ${date}…`);
            const result = await generateSnapshot(date, config, opts.provider);
            if (result) {
              renderInfo(`  ✓ ${date}`);
            } else {
              renderWarning(`  No data found for ${date}, skipping.`);
            }
          }
          snapshots = loadSnapshotsRange(startDate, endDate);
        }
      }

      if (snapshots.length === 0) {
        renderWarning(
          `No snapshots found between ${startDate} and ${endDate}.\n` +
          `Run \`whatdone today\` each day to build up your history.`,
        );
        return;
      }

      const router = createRouter(config, opts.provider);
      const prompt = buildWeeklyPrompt(snapshots);
      const spinner = ora('Generating weekly summary…').start();
      let output: string;
      try {
        output = await router.complete(prompt, 1000);
        spinner.succeed('Done');
      } catch (err) {
        spinner.fail('LLM call failed');
        throw err;
      }
      renderWeekly(output);
    });
}
