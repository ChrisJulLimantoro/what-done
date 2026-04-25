import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import type { GitData } from '../types.js';
import { NotAGitRepoError } from '../cli/errors.js';
import { expandPath } from '../config/loader.js';

const execFileAsync = promisify(execFile);

export interface GitCollectorOptions {
  repoPath: string;
  date: string; // YYYY-MM-DD
  excludePatterns: string[];
  maxDiffTokens: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[TRUNCATED — diff exceeded token limit]';
}

async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not a git repository')) {
      throw new NotAGitRepoError(repoPath);
    }
    // Non-zero exit with empty output is okay (e.g. no commits)
    if (err && typeof err === 'object' && 'stdout' in err) {
      return (err as { stdout: string }).stdout || '';
    }
    throw err;
  }
}

export async function collectGit(opts: GitCollectorOptions): Promise<GitData> {
  const repoPath = expandPath(opts.repoPath);

  if (!existsSync(repoPath)) {
    throw new NotAGitRepoError(repoPath);
  }

  // Verify it's a git repo
  await git(repoPath, ['rev-parse', '--git-dir']);

  // Get current branch
  let branch = 'unknown';
  try {
    branch = (await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch {
    // ignore
  }

  // Get commits for today
  const since = `${opts.date} 00:00:00`;
  const until = `${opts.date} 23:59:59`;
  const logOut = await git(repoPath, [
    'log',
    `--since=${since}`,
    `--until=${until}`,
    '--oneline',
    '--no-merges',
    '--format=%h %s',
  ]);

  const commits = logOut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const commitCount = commits.length;

  if (commitCount === 0) {
    return { commits: [], diffstat: '', diff: '', branch, commitCount: 0 };
  }

  // Build diff range: commits from today vs the commit before the first one today
  // Get the hashes of today's commits to find the range
  const hashesOut = await git(repoPath, [
    'log',
    `--since=${since}`,
    `--until=${until}`,
    '--oneline',
    '--no-merges',
    '--format=%H',
  ]);
  const hashes = hashesOut.split('\n').map((l) => l.trim()).filter(Boolean);

  // The oldest commit in today's range
  const oldestHash = hashes[hashes.length - 1];

  // Diff base: parent of the oldest today commit
  let diffBase: string;
  try {
    diffBase = (await git(repoPath, ['rev-parse', `${oldestHash}^`])).trim();
  } catch {
    // First commit in repo — diff against empty tree
    diffBase = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }

  const newestHash = hashes[0];

  // Build exclude pathspecs
  const excludeArgs: string[] = [];
  for (const pattern of opts.excludePatterns) {
    excludeArgs.push(`:(exclude)${pattern}`);
  }

  // Diff stat
  const diffstatArgs = ['diff', '--stat', diffBase, newestHash, '--'];
  if (excludeArgs.length > 0) diffstatArgs.push(...excludeArgs);
  const diffstat = (await git(repoPath, diffstatArgs)).trim();

  // Diff patch
  const diffArgs = ['diff', diffBase, newestHash, '--'];
  if (excludeArgs.length > 0) diffArgs.push(...excludeArgs);
  const rawDiff = await git(repoPath, diffArgs);
  const diff = truncateToTokens(rawDiff, opts.maxDiffTokens);

  return {
    commits,
    diffstat,
    diff,
    branch,
    commitCount,
  };
}
