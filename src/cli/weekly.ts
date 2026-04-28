import { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { buildWeeklyPrompt } from '../llm/prompts.js';
import { createRouter } from '../llm/router.js';
import { loadSnapshotsRange } from '../store/snapshots.js';
import { renderWeekly, renderWarning } from './renderer.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
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

      const snapshots = loadSnapshotsRange(startDate, endDate);

      if (snapshots.length === 0) {
        renderWarning(
          `No snapshots found between ${startDate} and ${endDate}.\n` +
          `Run \`whatdone today\` each day to build up your history.`
        );
        return;
      }

      if (snapshots.length < 3) {
        renderWarning(
          `Only ${snapshots.length} of 7 days have snapshots. ` +
          `Run \`whatdone today\` daily for richer weekly summaries.`
        );
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
