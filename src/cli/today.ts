import { Command } from 'commander';
import ora from 'ora';
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
import type { DailySnapshot, RawData, WdidConfig } from '../types.js';
import { localDateString } from '../utils/date.js';

function todayDate(): string {
  return localDateString(new Date());
}

export async function generateSnapshot(
  date: string,
  config: WdidConfig,
  providerOverride?: string,
): Promise<DailySnapshot | null> {
  const repoPaths: string[] = config.git.auto_discover
    ? discoverRepos()
    : config.git.repos.map(expandPath);

  if (repoPaths.length === 0) return null;

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
      // silently skip invalid repos in programmatic use
    }
  }

  const sessionData = await collectSessions(
    config.claude_code.session_path,
    date,
    config.claude_code.enabled,
  );

  if (sessionData.summaries.length > 0) {
    if (repoRawData.length > 0) {
      repoRawData[0].sessions = sessionData.summaries;
    } else {
      repoRawData.push({
        commits: [],
        diffstat: '',
        diff: '',
        sessions: sessionData.summaries,
        repoPath: '.',
        date,
      });
    }
  }

  if (repoRawData.length === 0) return null;

  const router = createRouter(config, providerOverride);
  const result = await summarize(repoRawData, config, router);

  const snapshot: DailySnapshot = {
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
  return snapshot;
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

      const repoPaths: string[] = config.git.auto_discover
        ? discoverRepos()
        : config.git.repos.map(expandPath);

      if (repoPaths.length === 0) {
        renderWarning('No git repos found. Set auto_discover = true or add repos in ~/.whatdone/config.toml');
        return;
      }

      // Collect git data per repo, preserving attribution
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

      // Attach sessions to the first repo entry (or a synthetic one)
      const sessionData = await collectSessions(
        config.claude_code.session_path,
        date,
        config.claude_code.enabled
      );

      if (sessionData.summaries.length > 0) {
        if (repoRawData.length > 0) {
          repoRawData[0].sessions = sessionData.summaries;
        } else {
          repoRawData.push({
            commits: [],
            diffstat: '',
            diff: '',
            sessions: sessionData.summaries,
            repoPath: '.',
            date,
          });
        }
      }

      if (repoRawData.length === 0) {
        renderWarning(`No git commits or Claude Code sessions found for ${date}.`);
        return;
      }

      // Dry run — print prompt and exit
      if (opts.dryRun) {
        const allCommits = repoRawData.flatMap((r) => r.commits);
        const allDiff = repoRawData.map((r) => r.diff).filter(Boolean).join('\n\n');
        const allSessions = repoRawData.flatMap((r) => r.sessions);
        const dummyRaw: RawData = {
          commits: allCommits,
          diffstat: repoRawData.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
          diff: allDiff,
          sessions: allSessions,
          repoPath: repoRawData[0]?.repoPath ?? '.',
          date,
        };
        const prompt = buildTodayPrompt(dummyRaw, config.template.sections);
        renderDryRun(prompt);
        return;
      }

      // Cache key includes template schema hash to bust when template changes
      const cacheContent =
        repoRawData.flatMap((r) => r.commits).join('') +
        repoRawData.flatMap((r) => r.sessions).join('') +
        JSON.stringify(config.template.sections);
      const cacheKey = hashContent(cacheContent);

      if (useCache) {
        const cached = readCache(cacheKey);
        if (cached) {
          renderInfo('(Using cached summary — run with --no-cache to regenerate)');
          const snap: DailySnapshot = {
            version: 2,
            date,
            generatedAt: new Date().toISOString(),
            provider: 'cached',
            model: 'cached',
            summary: cached,
            raw: {
              commits: repoRawData.flatMap((r) => r.commits),
              diffstat: repoRawData.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
              sessions: sessionData.summaries,
            },
          };
          renderToday(snap, 'cached', 'cache hit', config.template);
          return;
        }
      }

      const router = createRouter(config, opts.provider);
      const repoCount = repoRawData.length;
      const commitCount = repoRawData.reduce((n, r) => n + r.commits.length, 0);
      const spinner = ora(
        `Summarizing ${commitCount} commit${commitCount !== 1 ? 's' : ''} across ${repoCount} repo${repoCount !== 1 ? 's' : ''}…`
      ).start();

      let result: Awaited<ReturnType<typeof summarize>>;
      try {
        result = await summarize(repoRawData, config, router);
        spinner.succeed('Summary generated');
      } catch (err) {
        spinner.fail('LLM call failed');
        throw err;
      }

      const snapshot: DailySnapshot = {
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

      const savedPath = saveSnapshot(snapshot);
      writeCache(cacheKey, result.summary);
      renderInfo(`Snapshot saved to ${savedPath}`);

      renderToday(snapshot, router.provider, router.model, config.template);
    });
}
