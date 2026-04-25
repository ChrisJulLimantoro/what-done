import { minimatch } from 'minimatch';

export interface FilterResult {
  filtered: string;
  redactedFiles: string[];
}

/**
 * Remove diff hunks for files matching privacy exclude patterns.
 * Matches against the filenames extracted from "diff --git a/... b/..." headers.
 */
export function applyPrivacyFilter(diff: string, excludePatterns: string[]): FilterResult {
  if (!diff || excludePatterns.length === 0) {
    return { filtered: diff, redactedFiles: [] };
  }

  const redactedFiles: string[] = [];
  const lines = diff.split('\n');
  const outputLines: string[] = [];
  let skip = false;
  let currentFile = '';

  for (const line of lines) {
    // New file section starts
    if (line.startsWith('diff --git ')) {
      // Extract filename from "diff --git a/<path> b/<path>"
      const match = line.match(/^diff --git a\/(.+) b\/.+$/);
      currentFile = match ? match[1] : '';
      skip = shouldExclude(currentFile, excludePatterns);

      if (skip) {
        redactedFiles.push(currentFile);
        outputLines.push(`diff --git a/${currentFile} b/${currentFile}`);
        outputLines.push(`[REDACTED — matched privacy filter]`);
      } else {
        outputLines.push(line);
      }
      continue;
    }

    if (!skip) {
      outputLines.push(line);
    }
  }

  return {
    filtered: outputLines.join('\n'),
    redactedFiles: [...new Set(redactedFiles)],
  };
}

function shouldExclude(filePath: string, patterns: string[]): boolean {
  const basename = filePath.split('/').pop() ?? filePath;
  for (const pattern of patterns) {
    if (minimatch(basename, pattern, { dot: true })) return true;
    if (minimatch(filePath, pattern, { dot: true })) return true;
  }
  return false;
}
