import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Directories to never recurse into — they won't contain meaningful git repos
// and account for the bulk of home directory size
const SKIP_DIRS = new Set([
  'node_modules',
  'Library',
  '.cache',
  '.npm',
  '.yarn',
  '.pnpm',
  '.Trash',
  '.git',         // don't recurse inside .git itself
  'Applications',
  'Music',
  'Movies',
  'Pictures',
  'Photos Library.photoslibrary',
  '.Spotlight-V100',
  '.fseventsd',
  '.DocumentRevisions-V100',
  'System',
  'proc',
  'sys',
  'dev',
]);

const MAX_DEPTH = 6;

/**
 * Walk root recursively, collect all directories that contain a .git folder.
 * Skips known-noisy dirs. Stops at MAX_DEPTH.
 */
function walk(dir: string, depth: number, results: string[]): void {
  if (depth > MAX_DEPTH) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // permission denied or unreadable — skip silently
  }

  // If this directory IS a git repo, record it and don't recurse further
  // (avoids picking up submodules as separate repos unless they have their own .git)
  if (entries.includes('.git')) {
    results.push(dir);
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isSymbolicLink()) continue; // avoid loops
      if (stat.isDirectory()) {
        walk(fullPath, depth + 1, results);
      }
    } catch {
      continue;
    }
  }
}

/**
 * Discover all git repos under ~/
 * Returns absolute paths to repo roots.
 */
export function discoverRepos(): string[] {
  const root = homedir();
  if (!existsSync(root)) return [];

  const results: string[] = [];
  walk(root, 0, results);
  return results;
}
