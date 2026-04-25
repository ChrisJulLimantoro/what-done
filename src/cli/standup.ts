import { Command } from 'commander';
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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function standupCommand(): Command {
  return new Command('standup')
    .description('Format output as Yesterday / Today / Blockers standup format')
    .option('--date <date>', 'Date to summarize (YYYY-MM-DD), defaults to today')
    .option('--provider <name>', 'Override LLM provider (anthropic|gemini|openai)')
    .action(async (opts: { date?: string; provider?: string }) => {
      const config = loadConfig();
      const date = opts.date ?? todayDate();

      // Try to load an existing snapshot first
      let snapshot = loadSnapshot(date);

      if (!snapshot) {
        // No snapshot — collect and summarize now
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

        const merged: RawData = {
          commits: repoRawData.flatMap((r) => r.commits),
          diffstat: repoRawData.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
          diff: repoRawData.map((r) => r.diff).filter(Boolean).join('\n\n'),
          sessions: sessionData.summaries,
          repoPath: config.git.repos[0] ?? '.',
          date,
        };

        if (merged.commits.length === 0 && merged.sessions.length === 0) {
          renderWarning(`No git commits or sessions found for ${date}.`);
          return;
        }

        const router = createRouter(config, opts.provider);
        const result = await summarize(merged, config, router);

        snapshot = {
          version: 1,
          date,
          generatedAt: new Date().toISOString(),
          provider: router.provider,
          model: router.model,
          summary: result,
          raw: {
            commits: merged.commits,
            diffstat: merged.diffstat,
            sessions: merged.sessions,
          },
        };

        saveSnapshot(snapshot);
      }

      // Format as standup
      const router = createRouter(config, opts.provider);
      const prompt = buildStandupPrompt(snapshot as DailySnapshot);
      const output = await router.complete(prompt, 300);
      renderStandup(output);
    });
}
