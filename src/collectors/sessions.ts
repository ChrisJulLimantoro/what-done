import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import type { SessionData, SessionEntry } from '../types.js';
import { expandPath } from '../config/loader.js';

interface RawEntry {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
  uuid?: string;
  cwd?: string;
  slug?: string;
}

function extractTextContent(
  content: string | Array<{ type: string; text?: string }> | undefined
): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join(' ');
}

function parseDate(timestamp: string): string {
  // Returns YYYY-MM-DD in local time
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function collectSessions(
  sessionPath: string,
  date: string,
  enabled: boolean
): Promise<SessionData> {
  const empty: SessionData = {
    sessionCount: 0,
    durationMinutes: 0,
    entries: [],
    summaries: [],
  };

  if (!enabled) return empty;

  const resolvedPath = expandPath(sessionPath);

  if (!existsSync(resolvedPath)) {
    return empty;
  }

  const entries: SessionEntry[] = [];
  const summaries: string[] = [];
  let totalMinutes = 0;
  let sessionCount = 0;

  // Walk project subdirectories
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(resolvedPath);
  } catch {
    return empty;
  }

  for (const dir of projectDirs) {
    const dirPath = join(resolvedPath, dir);
    let files: string[] = [];
    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) continue;
      files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(dirPath, file);

      // Quick mtime check — skip files not touched on this date
      try {
        const stat = statSync(filePath);
        const fileDate = parseDate(stat.mtime.toISOString());
        if (fileDate !== date) continue;
      } catch {
        continue;
      }

      let rawLines: string[] = [];
      try {
        rawLines = readFileSync(filePath, 'utf-8')
          .split('\n')
          .filter((l) => l.trim());
      } catch {
        continue;
      }

      const sessionEntries: SessionEntry[] = [];
      const timestamps: number[] = [];

      for (const line of rawLines) {
        let obj: RawEntry;
        try {
          obj = JSON.parse(line) as RawEntry;
        } catch {
          console.warn(`[wdid] Skipping malformed JSONL line in ${filePath}`);
          continue;
        }

        if (!obj.timestamp) continue;

        // Only include entries from the target date
        const entryDate = parseDate(obj.timestamp);
        if (entryDate !== date) continue;

        const ts = new Date(obj.timestamp).getTime();
        if (!isNaN(ts)) timestamps.push(ts);

        if (obj.type === 'user' || obj.type === 'assistant') {
          const role = obj.message?.role ?? obj.type;
          const content = extractTextContent(obj.message?.content);
          if (content.trim()) {
            sessionEntries.push({
              timestamp: obj.timestamp,
              role,
              content: content.slice(0, 500), // cap per-entry for token budget
              filePaths: [],
            });
          }
        }
      }

      if (sessionEntries.length === 0) continue;

      sessionCount++;
      entries.push(...sessionEntries);

      // Calculate session duration from first to last timestamp in this file
      if (timestamps.length >= 2) {
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        totalMinutes += Math.round((maxTs - minTs) / 60000);
      }

      // Build a short text summary of this session (for LLM context)
      const userMsgs = sessionEntries
        .filter((e) => e.role === 'user')
        .slice(0, 3)
        .map((e) => e.content.slice(0, 200));

      if (userMsgs.length > 0) {
        const slug = dir.replace(/^-Users-[^-]+-/, '').replace(/-/g, '/');
        summaries.push(`Session in ${slug || dir}: ${userMsgs.join(' | ')}`);
      }
    }
  }

  return {
    sessionCount,
    durationMinutes: totalMinutes,
    entries,
    summaries,
  };
}
