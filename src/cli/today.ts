import { Command } from 'commander';
import { loadConfig, expandPath } from '../config/loader.js';
import { collectGit } from '../collectors/git.js';
import { collectSessions } from '../collectors/sessions.js';
import { discoverRepos } from '../collectors/discover.js';
import { summarize } from '../pipeline/summarizer.js';
import { buildTodayPrompt } from '../llm/prompts.js';
import { createRouter } from '../llm/router.js';
import { saveSnapshot } from '../store/snapshots.js';
import { hashContent, readCache, writeCache } from '../store/cache.js';
import { renderToday, renderDryRun, renderWarning, renderInfo } from './renderer.js';
import type { DailySnapshot, RawData } from '../types.js';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayCommand(): Command {
  return new Command('today')
    .description("Summarize today's git + Claude Code activity")
    .option('--dry-run', 'Print the prompt that would be sent to the LLM without calling it')
    .option('--provider <name>', 'Override LLM provider (anthropic|gemini|openai)')
    .option('--no-cache', 'Skip cache and force re-generation')
    .option('--date <date>', 'Summarize a specific date (YYYY-MM-DD), defaults to today')
    .action(async (opts: { dryRun?: boolean; provider?: string; cache?: boolean; date?: string }) => {
      const config = loadConfig();
      const date = opts.date ?? todayDate();
      const useCache = opts.cache !== false;

      // Resolve repo list — auto-discover or use explicit list
      const repoPaths: string[] = config.git.auto_discover
        ? discoverRepos()
        : config.git.repos.map(expandPath);

      if (repoPaths.length === 0) {
        renderWarning('No git repos found. Set auto_discover = true or add repos in ~/.whatdone/config.toml');
        return;
      }

      // Collect git data — only repos with commits today (auto-discover can return many repos)
      const repoRawData: RawData[] = [];
      for (const repo of repoPaths) {
        try {
          const gitData = await collectGit({
            repoPath: repo,
            date,
            excludePatterns: config.git.exclude_patterns,
            maxDiffTokens: config.git.max_diff_tokens,
          });
          // Skip repos with no activity today
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
          // Silently skip unreadable repos during auto-discovery
          // Only warn for explicitly configured repos
          if (!config.git.auto_discover) {
            renderWarning(`Skipping repo ${repo}: not a valid git repository`);
          }
        }
      }

      // Collect Claude Code sessions
      const sessionData = await collectSessions(
        config.claude_code.session_path,
        date,
        config.claude_code.enabled
      );

      // Merge all repo data
      const merged: RawData = {
        commits: repoRawData.flatMap((r) => r.commits),
        diffstat: repoRawData.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
        diff: repoRawData.map((r) => r.diff).filter(Boolean).join('\n\n'),
        sessions: sessionData.summaries,
        repoPath: config.git.repos[0] ?? '.',
        date,
      };

      if (merged.commits.length === 0 && merged.sessions.length === 0) {
        renderWarning(`No git commits or Claude Code sessions found for ${date}.`);
        return;
      }

      // Dry run — print prompt and exit
      if (opts.dryRun) {
        const prompt = buildTodayPrompt(merged);
        renderDryRun(prompt);
        return;
      }

      // Check cache
      const cacheKey = hashContent(merged.diff + merged.sessions.join(''));
      if (useCache) {
        const cached = readCache(cacheKey);
        if (cached) {
          renderInfo('(Using cached summary — run with --no-cache to regenerate)');
          // Load existing snapshot to display
          const snap: DailySnapshot = {
            version: 1,
            date,
            generatedAt: new Date().toISOString(),
            provider: 'cached',
            model: 'cached',
            summary: cached,
            raw: {
              commits: merged.commits,
              diffstat: merged.diffstat,
              sessions: merged.sessions,
            },
          };
          renderToday(snap, 'cached', 'cache hit');
          return;
        }
      }

      // Summarize
      const router = createRouter(config, opts.provider);
      const result = await summarize(merged, config, router);

      // Save snapshot
      const snapshot: DailySnapshot = {
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

      const savedPath = saveSnapshot(snapshot);
      writeCache(cacheKey, result);
      renderInfo(`Snapshot saved to ${savedPath}`);

      renderToday(snapshot, router.provider, router.model);
    });
}
