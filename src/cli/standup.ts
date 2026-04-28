import { Command } from 'commander';
import ora from 'ora';
import { loadConfig, expandPath } from '../config/loader.js';
import { collectGit } from '../collectors/git.js';
import { discoverRepos } from '../collectors/discover.js';
import { collectSessions } from '../collectors/sessions.js';
import { summarize } from '../pipeline/summarizer.js';
import { buildStandupPrompt } from '../llm/prompts.js';
import { createRouter } from '../llm/router.js';
import { loadSnapshot, saveSnapshot } from '../store/snapshots.js';
import { renderStandup, renderWarning } from './renderer.js';
import type { DailySnapshot, RawData } from '../types.js';
import { localDateString } from '../utils/date.js';

function todayDate(): string {
  return localDateString(new Date());
}

export function standupCommand(): Command {
  return new Command('standup')
    .description('Format output as Yesterday / Today / Blockers standup format')
    .option('--date <date>', 'Date to summarize (YYYY-MM-DD), defaults to today')
    .option('--provider <name>', 'Override LLM provider (anthropic|gemini|openai)')
    .action(async (opts: { date?: string; provider?: string }) => {
      const config = loadConfig();
      const date = opts.date ?? todayDate();

      let snapshot = loadSnapshot(date);

      if (!snapshot) {
        renderWarning(`No snapshot for ${date} — generating one now...`);

        const repoPaths: string[] = config.git.auto_discover
          ? discoverRepos()
          : config.git.repos.map(expandPath);

        const repoRawData: RawData[] = [];
        for (const repo of repoPaths) {
          try {
            const gitData = await collectGit({
              repoPath: repo,
              date,
              excludePatterns: config.git.exclude_patterns,
              maxDiffTokens: config.git.max_diff_tokens,
            });
            if (gitData.commitCount === 0) continue;
            repoRawData.push({
              commits: gitData.commits,
              diffstat: gitData.diffstat,
              diff: gitData.diff,
              sessions: [],
              repoPath: repo,
              date,
            });
          } catch {
            if (!config.git.auto_discover) {
              renderWarning(`Skipping repo ${repo}: not a valid git repository`);
            }
          }
        }

        const sessionData = await collectSessions(
          config.claude_code.session_path,
          date,
          config.claude_code.enabled
        );

        if (sessionData.summaries.length > 0 && repoRawData.length > 0) {
          repoRawData[0].sessions = sessionData.summaries;
        } else if (sessionData.summaries.length > 0) {
          repoRawData.push({
            commits: [],
            diffstat: '',
            diff: '',
            sessions: sessionData.summaries,
            repoPath: '.',
            date,
          });
        }

        if (repoRawData.length === 0) {
          renderWarning(`No git commits or sessions found for ${date}.`);
          return;
        }

        const router = createRouter(config, opts.provider);
        const spinner = ora('Generating summary…').start();
        let result: Awaited<ReturnType<typeof summarize>>;
        try {
          result = await summarize(repoRawData, config, router);
          spinner.succeed('Summary generated');
        } catch (err) {
          spinner.fail('LLM call failed');
          throw err;
        }

        snapshot = {
          version: 2,
          date,
          generatedAt: new Date().toISOString(),
          provider: router.provider,
          model: router.model,
          summary: result.summary,
          groups: result.groups,
          raw: {
            commits: repoRawData.flatMap((r) => r.commits),
            diffstat: repoRawData.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
            sessions: sessionData.summaries,
          },
        };

        saveSnapshot(snapshot);
      }

      const router = createRouter(config, opts.provider);
      const spinner = ora('Formatting standup…').start();
      let output: string;
      try {
        const prompt = buildStandupPrompt(snapshot as DailySnapshot);
        output = await router.complete(prompt, 400);
        spinner.succeed('Done');
      } catch (err) {
        spinner.fail('LLM call failed');
        throw err;
      }
      renderStandup(output);
    });
}
